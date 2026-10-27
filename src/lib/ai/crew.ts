/**
 * The crew: four models, one shared transcript, one project.
 *
 * Planner reads the request, Coder A writes, Coder B reviews and finishes,
 * Tester runs the thing and sends it back. They are separate model calls (and
 * can be separate *providers* — that is the point of BYOK), talking through a
 * single transcript so each one sees what the others did.
 *
 * The rules that keep it from running away on a phone:
 *  - every turn is bounded (max tool calls per turn, max turns per run),
 *  - a failing model fails over to the next candidate instead of ending the run,
 *  - a tool that fails returns its error to the model rather than throwing,
 *  - "finish" is a tool, so ending is an explicit decision — not a guess about
 *    whether the prose sounded done.
 */
import type { AiConfig, AiRole } from './config'
import { ROLES } from './config'
import type { AiEvent, ChatMessage, ModelTarget } from './client'
import { AiError, callAi } from './client'
import {
  executeTool,
  stripToolBlocks,
  stripToolEcho,
  toolCatalogText,
  WRITE_TOOLS,
  type ToolCall,
  type ToolResult,
  type ToolWorkspace,
} from './tools'
import { parseToolCalls } from './tools'

export type Speaker = 'user' | AiRole | 'assistant' | 'system'

export type Turn = {
  speaker: Speaker
  label: string
  text: string
  /** Which model actually answered — shown as a small caption. */
  target?: ModelTarget
}

export type RunEvent =
  | { kind: 'start'; mode: 'chat' | 'crew'; task: string }
  | { kind: 'thinking'; speaker: Speaker; label: string; turn: number }
  | { kind: 'message'; speaker: Speaker; label: string; text: string; target?: ModelTarget }
  | { kind: 'tool'; speaker: Speaker; call: ToolCall; result: ToolResult }
  | { kind: 'skipped'; call: ToolCall; reason: string }
  | { kind: 'fallback'; speaker: Speaker; message: string }
  | { kind: 'done'; summary: string }
  | { kind: 'error'; speaker: Speaker; message: string }
  | { kind: 'stopped' }

export type RunOptions = {
  config: AiConfig
  keys: Record<string, string | undefined>
  workspace: ToolWorkspace
  task: string
  /** Turns already in the conversation (chat history / previous runs). */
  history?: Turn[]
  signal?: AbortSignal
  onEvent?: (event: RunEvent) => void
  /** Asked before a write when `config.writes === 'confirm'`. */
  approve?: (call: ToolCall) => Promise<boolean>
  fetchImpl?: typeof fetch
}

export type RunResult = {
  /** Everything said in this run, in order. */
  turns: Turn[]
  summary: string
  /** Tool results, for the UI's activity list. */
  actions: Array<{ tool: string; summary: string; ok: boolean }>
  turnsUsed: number
  stopped: boolean
  error: string | null
}

/* ------------------------------------------------------------------ */
/* prompts                                                             */
/* ------------------------------------------------------------------ */

const PROTOCOL = `You work on a real project inside Cody, a mobile code editor. You cannot touch it by talking about it — you use tools.

Call a tool by writing a fenced block exactly like this:

\`\`\`tool
{"tool": "create_file", "args": {"path": "src/App.tsx", "content": "export default function App() { return null }"}}
\`\`\`

Rules:
- One block per tool call. You may write several blocks; they run in order.
- \`read_file\` before \`patch_file\`. Copy the text to patch exactly, including indentation.
- Prefer \`patch_file\` for edits and \`write_file\` for new or fully rewritten files. Never paste a whole file in prose.
- Paths are relative to the project root, POSIX style. Folders are created automatically.
- Keep your prose to one or two sentences. The work is in the tool calls, not in the explanation.
- If a tool fails, read the error and try a different approach. Do not repeat the same failing call.
- When the task is done, call \`finish\` with a short summary. Nothing else.

Available tools:
${toolCatalogText()}`

function brief(workspace: ToolWorkspace, task: string): string {
  const project = workspace.currentProject()
  const files = project?.files ?? []
  const listing = files
    .slice(0, 80)
    .map((file) => `- ${file.path} (${file.content.length} bytes)`)
    .join('\n')
  return [
    `TASK FROM THE USER:\n${task}`,
    '',
    `CURRENT WORKSPACE: ${project ? `${project.name} (${files.length} files)` : 'none'}`,
    project && files.length > 0 ? listing : '(the workspace is empty)',
    project?.folders?.length ? `Empty folders: ${project.folders.join(', ')}` : '',
  ]
    .filter(Boolean)
    .join('\n')
}

const ROLE_PROMPTS: Record<AiRole, string> = {
  planner: `You are the PLANNER of a four-agent crew (Planner, Coder A, Coder B, Tester).
Your job: read the request, decide the smallest file set that delivers it, and write the plan.
- If a new workspace is needed, \`create_project\` first.
- Create empty folders you will need (\`create_folder\`) if the structure matters.
- Do not write file contents; that is Coder A's job.
- Your plan is a short numbered list: what each file is for and what it must do. Three to seven points.
- Then call \`finish\` with a one-sentence summary of the plan.`,

  coderA: `You are CODER A of a four-agent crew. You implement the plan.
- Follow the planner's list. Write real, runnable code — no placeholders, no TODOs.
- Create every file the plan names, with full content.
- Keep it small enough to actually run on a phone preview: no build step, no npm install.
- If the planner asked for HTML, CSS and JS, wire them together so double-tapping Run shows something.
- Do not stop halfway. When the plan is implemented, call \`finish\` with what you wrote.`,

  coderB: `You are CODER B of a four-agent crew. You are the reviewer and second pair of hands.
- Read what Coder A actually wrote (\`list_files\`, \`read_file\`).
- Fix real bugs: syntax errors, wrong paths, missing wiring, a selector that does not exist, an import that points nowhere.
- Finish anything Coder A left undone.
- Do not rewrite working files for style points. Do not delete the project.
- Then call \`finish\` with what you changed.`,

  tester: `You are the TESTER of a four-agent crew. You judge whether it actually works.
- Run \`check_problems\` (real parsers) and \`run_preview\` (real bundler + console).
- If there are errors, or the console shows an exception, fix them yourself with \`patch_file\` — you have the same tools.
- Re-run after fixing. Two honest attempts, then report.
- When it passes, call \`finish\` with "PASS:" and one line about what you verified.
- If it cannot pass, call \`finish\` with "FAIL:" and exactly what is broken.`,
}

function systemFor(speaker: Speaker): string {
  if (speaker === 'assistant') {
    return `You are Cody's built-in assistant, inside a mobile code editor with a real file system.
You can read and change the user's project with tools, and the user watches every change.

${PROTOCOL}

Be brief and concrete. When you change files, say what changed in one sentence. When you are only being asked a question, answer it without tools.`
  }
  const role = speaker as AiRole
  return `${ROLE_PROMPTS[role]}

${PROTOCOL}`
}

/* ------------------------------------------------------------------ */
/* transcript ⇄ chat messages                                          */
/* ------------------------------------------------------------------ */

/**
 * Models copy the label off their own transcript: our history is sent as
 * `[Coder A] …`, so answers come back starting with `[Cody]` or `[Coder A]`.
 * The bubble already says who is talking, so the prefix is dropped.
 */
const SPEAKER_ECHO = /^\s*\[(?:cody|assistant|user|system|planner|coder[ \t]?[ab]|tester)\]\s*[:\-–]?\s*/i

export function stripSpeakerPrefix(text: string): string {
  let out = text
  // A model that starts three lines with its own name is not telling us anything.
  for (let guard = 0; guard < 3; guard += 1) {
    const next = out.replace(SPEAKER_ECHO, '')
    if (next === out) break
    out = next
  }
  return out
}

function labelOf(speaker: Speaker): string {
  if (speaker === 'user') return 'User'
  if (speaker === 'assistant') return 'Cody'
  return ROLES.find((role) => role.id === speaker)?.label ?? speaker
}

export function turnsToMessages(history: Turn[]): ChatMessage[] {
  return history.map((turn) => ({
    role: turn.speaker === 'user' ? 'user' : 'assistant',
    content: turn.speaker === 'user' ? turn.text : `[${turn.label}] ${turn.text}`,
  }))
}

/* ------------------------------------------------------------------ */
/* the engine                                                          */
/* ------------------------------------------------------------------ */

const MAX_TOOL_CALLS_PER_TURN = 4
const MAX_TOOL_CALLS_PER_RUN = 48

export async function runAgent(options: RunOptions): Promise<RunResult> {
  const { config, workspace, task, signal, onEvent } = options
  const turns: Turn[] = []
  const actions: RunResult['actions'] = []
  let toolCalls = 0
  let stops = false
  let error: string | null = null
  let summary = ''
  let planSummary = ''
  let turnsUsed = 0

  const emit = (event: RunEvent) => onEvent?.(event)

  const messages = (speaker: Speaker, context: string): ChatMessage[] => [
    { role: 'system', content: systemFor(speaker) },
    ...turnsToMessages([...(options.history ?? []), ...turns]),
    { role: 'user', content: context },
  ]

  /** One model call, with tools, looping while the model asks for more. */
  const takeTurn = async (speaker: Speaker): Promise<Turn | null> => {
    const label = labelOf(speaker)
    emit({ kind: 'thinking', speaker, label, turn: turnsUsed + 1 })

    const role: AiRole | null = speaker === 'user' || speaker === 'assistant' ? (speaker === 'assistant' ? null : null) : (speaker as AiRole)
    const context = brief(workspace, task)
    const conversation = messages(speaker, context)
    const collected: string[] = []
    let target: ModelTarget | undefined
    // `ended` closes *this* turn. Only a non-planner turn closes the run: the
    // planner always calls `finish`, and that must not skip the coders.
    let ended = false

    for (let step = 0; step <= MAX_TOOL_CALLS_PER_TURN; step += 1) {
      let answer
      try {
        answer = await callAi({
          config,
          keys: options.keys,
          role,
          messages: conversation,
          signal,
          fetchImpl: options.fetchImpl,
          onEvent: (event: AiEvent) => {
            if (event.kind === 'fail') {
              emit({
                kind: 'fallback',
                speaker,
                message: `${event.target.label ?? event.target.model} (${event.target.provider}) — ${event.message}${event.willRetry ? ' · trying the next model' : ''}`,
              })
            }
          },
        })
      } catch (failure) {
        if ((failure as Error)?.message === 'Stopped') {
          stops = true
          return null
        }
        const message = (failure as AiError)?.message ?? String(failure)
        error = message
        emit({ kind: 'error', speaker, message })
        return null
      }

      target = answer.target
      const prose = stripSpeakerPrefix(stripToolEcho(stripToolBlocks(answer.text)))
      if (prose) collected.push(prose)

      const calls = parseToolCalls(answer.text)
      if (calls.length === 0) break

      // Keep the model's own tool block in the transcript so it can see what it asked for.
      conversation.push({ role: 'assistant', content: answer.text })

      for (const call of calls) {
        if (toolCalls >= MAX_TOOL_CALLS_PER_RUN) {
          emit({ kind: 'skipped', call, reason: 'tool budget for this run is used up' })
          continue
        }
        toolCalls += 1

        if (config.writes === 'confirm' && WRITE_TOOLS.has(call.tool as never) && options.approve) {
          const allowed = await options.approve(call)
          if (!allowed) {
            const result = { ok: false, summary: 'The user declined this change.' }
            actions.push({ tool: call.tool, summary: result.summary, ok: false })
            emit({ kind: 'tool', speaker, call, result })
            conversation.push({
              role: 'user',
              content: `TOOL RESULT ${call.tool}: declined by the user. Do not retry it; work around it or stop.`,
            })
            continue
          }
        }

        const result = await executeTool(call.tool, call.args, workspace)
        actions.push({ tool: call.tool, summary: result.summary, ok: result.ok })
        emit({ kind: 'tool', speaker, call, result })
        conversation.push({
          role: 'user',
          content: `TOOL RESULT ${call.tool} (${result.ok ? 'ok' : 'failed'}): ${result.summary}${result.data ? `\n${String(result.data).slice(0, 4000)}` : ''}`,
        })

        if (call.tool === 'finish') {
          const text = String((call.args as { summary?: string }).summary ?? result.summary)
          if (speaker === 'planner') planSummary = text
          else summary = text
          ended = true
        }
      }

      if (ended) break
    }

    // Coder A and Coder B finish their own turn and hand over; the run ends
    // when the Tester passes judgement.
    if (ended && speaker === 'tester') stops = true

    turnsUsed += 1
    const text = collected.join('\n\n').trim()
    const turn: Turn = { speaker, label, text, target }
    // Nothing to say is a legitimate turn — the tool chips already told the
    // story. Do not invent a bubble for it.
    if (text) {
      turns.push(turn)
      emit({ kind: 'message', speaker, label, text, target })
    }
    return turn
  }

  emit({ kind: 'start', mode: 'crew', task })

  // Planner once, then the loop: write → review → test.
  if (!(await takeTurn('planner')) && error) {
    return { turns, summary: summary || planSummary, actions, turnsUsed, stopped: stops, error }
  }

  const maxTurns = Math.max(2, config.maxTurns)
  while (!stops && turnsUsed < maxTurns && !error) {
    for (const role of ['coderA', 'coderB', 'tester'] as AiRole[]) {
      if (stops || turnsUsed >= maxTurns || error) break
      await takeTurn(role)
    }
  }

  if (!summary) summary = planSummary
  if (!summary && !error) summary = 'The crew stopped before reporting. Open the transcript to see the last step.'

  emit(error ? { kind: 'error', speaker: 'assistant', message: error } : { kind: 'done', summary })
  return { turns, summary, actions, turnsUsed, stopped: stops, error }
}

/** Plain chat: one assistant, same tools, one turn per message. */
export async function runChat(options: RunOptions): Promise<RunResult> {
  const { config, workspace, task, signal, onEvent } = options
  const turns: Turn[] = []
  const actions: RunResult['actions'] = []
  let error: string | null = null
  let summary = ''
  let toolCalls = 0
  let stopped = false

  const emit = (event: RunEvent) => onEvent?.(event)
  emit({ kind: 'start', mode: 'chat', task })

  const history = [...(options.history ?? [])]
  const conversation: ChatMessage[] = [
    { role: 'system', content: systemFor('assistant') },
    ...turnsToMessages(history),
    { role: 'user', content: brief(workspace, task) },
  ]
  const collected: string[] = []
  let target: ModelTarget | undefined

  for (let step = 0; step <= MAX_TOOL_CALLS_PER_TURN; step += 1) {
    let answer
    try {
      answer = await callAi({
        config,
        keys: options.keys,
        role: null,
        messages: conversation,
        signal,
        fetchImpl: options.fetchImpl,
        onEvent: (event: AiEvent) => {
          if (event.kind === 'fail') {
            emit({
              kind: 'fallback',
              speaker: 'assistant',
              message: `${event.target.label ?? event.target.model} (${event.target.provider}) — ${event.message}${event.willRetry ? ' · trying the next model' : ''}`,
            })
          }
        },
      })
    } catch (failure) {
      if ((failure as Error)?.message === 'Stopped') {
        stopped = true
        emit({ kind: 'stopped' })
        return { turns, summary, actions, turnsUsed: 0, stopped, error: null }
      }
      error = (failure as Error)?.message ?? String(failure)
      emit({ kind: 'error', speaker: 'assistant', message: error })
      break
    }

    target = answer.target
    const prose = stripSpeakerPrefix(stripToolEcho(stripToolBlocks(answer.text)))
    if (prose) collected.push(prose)

    const calls = parseToolCalls(answer.text)
    if (calls.length === 0) break
    conversation.push({ role: 'assistant', content: answer.text })

    for (const call of calls) {
      if (toolCalls >= MAX_TOOL_CALLS_PER_RUN) break
      toolCalls += 1
      if (config.writes === 'confirm' && WRITE_TOOLS.has(call.tool as never) && options.approve) {
        const allowed = await options.approve(call)
        if (!allowed) {
          const result = { ok: false, summary: 'The user declined this change.' }
          actions.push({ tool: call.tool, summary: result.summary, ok: false })
          emit({ kind: 'tool', speaker: 'assistant', call, result })
          conversation.push({ role: 'user', content: `TOOL RESULT ${call.tool}: declined by the user.` })
          continue
        }
      }
      const result = await executeTool(call.tool, call.args, workspace)
      actions.push({ tool: call.tool, summary: result.summary, ok: result.ok })
      emit({ kind: 'tool', speaker: 'assistant', call, result })
      conversation.push({
        role: 'user',
        content: `TOOL RESULT ${call.tool} (${result.ok ? 'ok' : 'failed'}): ${result.summary}${result.data ? `\n${String(result.data).slice(0, 4000)}` : ''}`,
      })
      if (call.tool === 'finish') summary = String((call.args as { summary?: string }).summary ?? result.summary)
    }
    if (summary) break
  }

  const text = collected.join('\n\n').trim()
  if (text) {
    const turn: Turn = { speaker: 'assistant', label: 'Cody', text, target }
    turns.push(turn)
    emit({ kind: 'message', speaker: 'assistant', label: 'Cody', text, target })
  }
  if (!error) emit({ kind: 'done', summary: summary || '' })
  return { turns, summary, actions, turnsUsed: turns.length, stopped, error }
}

/* ------------------------------------------------------------------ */
/* limits for the UI                                                   */
/* ------------------------------------------------------------------ */

export const CREW_STEPS = 3
export const TURN_TOOL_LIMIT = MAX_TOOL_CALLS_PER_TURN
export const RUN_TOOL_LIMIT = MAX_TOOL_CALLS_PER_RUN
