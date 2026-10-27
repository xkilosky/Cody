import { useEffect, useMemo, useRef, useState } from 'react'
import type { AiConfig } from '../../lib/ai/config'
import { ROLES } from '../../lib/ai/config'
import { PROVIDERS, isFreeModel, providerOf } from '../../lib/ai/providers'
import { selectTargets } from '../../lib/ai/client'
import { TOOLS } from '../../lib/ai/tools'
import Icon from '../Icons'
import Sheet from '../Sheet'
import type { AiSession, UiTurn } from './useAiSession'
import Markdown from './Markdown'

type Props = {
  config: AiConfig
  keys: Record<string, string | undefined>
  session: AiSession
  onOpenSettings: () => void
}

const EXAMPLES = [
  'Build a pomodoro timer with start, pause and reset',
  'Make a landing page for a coffee shop with a working menu',
  'Write a Python script that prints a multiplication table',
]

const ROLE_GLYPH: Record<string, string> = {
  planner: 'P',
  coderA: 'A',
  coderB: 'B',
  tester: 'T',
  assistant: '✧',
  user: 'You',
  system: '!',
}

/** `read_console` → `Read console`, so a chip reads like an action. */
function sentence(name: string): string {
  const words = name.replace(/_/g, ' ')
  return `${words.charAt(0).toUpperCase()}${words.slice(1)}`
}

function modelLine(turn: UiTurn): string | null {
  return turn.model ?? null
}

function ToolActivity({ activity }: { activity: AiSession['activity'] }) {
  if (activity.length === 0) return null
  const visible = activity.slice(-8)
  const hidden = activity.length - visible.length
  return (
    <div className="ai-activity" aria-label="Tool activity">
      {hidden > 0 && <span className="ai-activity-more">+{hidden} earlier</span>}
      {visible.map((entry) => (
        <span key={entry.id} className={`ai-tool${entry.ok ? '' : ' failed'}`} title={entry.summary}>
          <Icon name={entry.ok ? 'check' : 'alert'} size={11} />
          <span className="ai-tool-name">{sentence(entry.tool)}</span>
          <span className="ai-tool-desc">{entry.summary}</span>
        </span>
      ))}
    </div>
  )
}

function TurnRow({ turn }: { turn: UiTurn }) {
  if (turn.kind === 'user') {
    return (
      <div className="ai-msg user">
        <p>{turn.text}</p>
      </div>
    )
  }
  if (turn.kind === 'note') {
    return (
      <div className="ai-note">
        <Icon name="refresh" size={12} />
        <span>{turn.text}</span>
      </div>
    )
  }
  if (turn.kind === 'error') {
    return (
      <div className="ai-note error">
        <Icon name="alert" size={12} />
        <span>{turn.text}</span>
      </div>
    )
  }
  if (turn.kind === 'summary') {
    return (
      <div className="ai-summary">
        <Icon name="check" size={13} />
        <div>
          <Markdown text={turn.text} />
        </div>
      </div>
    )
  }
  // A turn with nothing to say is not a bubble; the tool chips carry it.
  if (!turn.text.trim()) return null
  const glyph = ROLE_GLYPH[turn.speaker] ?? '✧'
  return (
    <div className="ai-msg agent" data-role={turn.speaker}>
      <div className="ai-avatar" aria-hidden="true">
        {glyph}
      </div>
      <div className="ai-msg-body">
        <div className="ai-msg-head">
          <strong>{turn.label}</strong>
          {modelLine(turn) && <span className="ai-model">{modelLine(turn)}</span>}
        </div>
        <div className="ai-msg-text">
          <Markdown text={turn.text} />
        </div>
      </div>
    </div>
  )
}

export default function BuildAiPane({ config, keys, session, onOpenSettings }: Props) {
  const [draft, setDraft] = useState('')
  const scrollRef = useRef<HTMLDivElement | null>(null)
  const inputRef = useRef<HTMLTextAreaElement | null>(null)

  const selection = useMemo(() => selectTargets(config, keys, session.mode === 'crew' ? 'planner' : null), [config, keys, session.mode])
  const configured = selection.targets.length > 0
  const crew = session.mode === 'crew'

  useEffect(() => {
    const node = scrollRef.current
    if (!node) return
    node.scrollTop = node.scrollHeight
  }, [session.turns, session.activity, session.status])

  const send = () => {
    const text = draft.trim()
    if (!text || session.running) return
    setDraft('')
    void session.send(text, session.mode)
    if (inputRef.current) inputRef.current.style.height = 'auto'
  }

  return (
    <div className="pane ai-pane">
      <header className="ai-head">
        <div className="segmented ai-mode">
          <button className={!crew ? 'active' : ''} onClick={() => session.setMode('chat')} aria-pressed={!crew}>
            <Icon name="sparkles" size={13} /> Chat
          </button>
          <button className={crew ? 'active' : ''} onClick={() => session.setMode('crew')} aria-pressed={crew}>
            <Icon name="agents" size={13} /> Crew
          </button>
        </div>
        <div className="ai-head-right">
          <button className="ai-status" onClick={onOpenSettings} aria-label="AI settings">
            <span className={`ai-dot${configured && !selection.paidFallback ? ' on' : ''}`} />
            <span className="ai-status-text">
              {!configured
                ? 'no key'
                : selection.paidFallback
                  ? 'no free model · paid'
                  : config.freeOnly && config.auto
                    ? `free · ${selection.targets.length} model${selection.targets.length === 1 ? '' : 's'}`
                    : config.auto
                      ? `auto · ${new Set(selection.targets.map((target) => target.provider)).size} provider${
                          new Set(selection.targets.map((target) => target.provider)).size === 1 ? '' : 's'
                        }`
                      : `${providerOf(selection.targets[0].provider).label}${
                          isFreeModel(selection.targets[0].provider, selection.targets[0].model) ? ' · free' : ''
                        }`}
            </span>
            <Icon name="settings" size={14} />
          </button>
        </div>
      </header>

      <div className="ai-scroll" ref={scrollRef}>
        {!configured ? (
          <div className="ai-setup">
            <div className="ai-setup-mark">
              <Icon name="key" size={20} />
            </div>
            <h3>Bring your own key</h3>
            <p>
              Cody has no server and no account. Paste a key for any provider — it stays on this device and is
              never included in exports. Free models are used by default; a paid one is called only if you pin
              it.
            </p>
            <div className="ai-provider-chips">
              {PROVIDERS.filter((provider) => !provider.custom && provider.freeTier)
                .slice(0, 6)
                .map((provider) => (
                  <span key={provider.id} className="chip tiny">
                    {provider.label}
                  </span>
                ))}
              <span className="chip tiny">+ custom</span>
            </div>
            <button className="btn primary block" onClick={onOpenSettings}>
              <Icon name="key" size={15} /> Add a provider key
            </button>
          </div>
        ) : session.turns.length === 0 ? (
          <div className="ai-intro">
            <h3>{crew ? 'A crew of four' : 'Ask for anything'}</h3>
            <p>
              {crew
                ? 'Four models take turns on your project — each can be a different provider — until the tester says it runs. Free models only, unless you pin one.'
                : 'One model, with the same tools. It can read, write and patch the files in this workspace. Free models by default.'}
            </p>
            <div className="ai-roles">
              {ROLES.map((role, index) => (
                <div key={role.id} className="ai-role" data-role={role.id}>
                  <span className="ai-role-step">{index + 1}</span>
                  <div>
                    <strong>{role.label}</strong>
                    <span>{role.job}</span>
                  </div>
                </div>
              ))}
            </div>
            <div className="ai-examples">
              {EXAMPLES.map((example) => (
                <button
                  key={example}
                  className="ai-example"
                  onClick={() => {
                    setDraft(example)
                    inputRef.current?.focus()
                  }}
                >
                  {example}
                </button>
              ))}
            </div>
            <p className="ai-tools-line">
              {TOOLS.length} tools · projects, folders, files, patches, preview, problems
            </p>
          </div>
        ) : (
          <div className="ai-thread">
            {session.turns.map((turn) => (
              <TurnRow key={turn.id} turn={turn} />
            ))}
            {session.running && (
              <div className="ai-thinking">
                <span className="spinner" />
                <span>{session.status ?? 'Thinking…'}</span>
              </div>
            )}
          </div>
        )}
        <ToolActivity activity={session.activity} />
      </div>

      <div className="ai-composer">
        {session.canRevert && !session.running && (
          <button className="ai-revert" onClick={() => void session.revert()}>
            <Icon name="undo" size={12} /> Undo this run
          </button>
        )}
        <div className="ai-input-row">
          <textarea
            ref={inputRef}
            className="ai-input"
            value={draft}
            rows={1}
            placeholder={crew ? 'What should the crew build?' : 'Ask or ask for a change…'}
            onChange={(event) => {
              setDraft(event.target.value)
              const node = event.currentTarget
              node.style.height = 'auto'
              node.style.height = `${Math.min(120, node.scrollHeight)}px`
            }}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && !event.shiftKey) {
                event.preventDefault()
                send()
              }
            }}
            aria-label="Message"
          />
          {session.running ? (
            <button className="ai-send stop" onClick={session.stop} aria-label="Stop">
              <Icon name="stop" size={16} filled />
            </button>
          ) : (
            <button className="ai-send" onClick={send} disabled={!draft.trim() || !configured} aria-label="Send">
              <Icon name="send" size={16} />
            </button>
          )}
        </div>
        <div className="ai-foot">
          <span>
            {crew ? 'Planner → Coder A → Coder B → Tester' : 'Tools can edit this workspace'}
            {config.freeOnly && !selection.paidFallback ? ' · free' : ''}
          </span>
          {session.turns.length > 0 && !session.running && (
            <button className="linkish" onClick={session.clear}>
              New chat
            </button>
          )}
        </div>
      </div>

      <Sheet
        open={Boolean(session.approval)}
        title="Allow this change?"
        subtitle={session.approval ? `${session.approval.call.tool.replace(/_/g, ' ')} on your project` : undefined}
        onClose={() => session.respondToApproval(false)}
        footer={
          <div className="confirm-row">
            <button className="btn ghost" onClick={() => session.respondToApproval(false)}>
              Skip
            </button>
            <button className="btn primary" onClick={() => session.respondToApproval(true)}>
              Allow
            </button>
          </div>
        }
      >
        <pre className="ai-approval">
          {session.approval ? JSON.stringify(session.approval.call.args, null, 2).slice(0, 2400) : ''}
        </pre>
      </Sheet>
    </div>
  )
}
