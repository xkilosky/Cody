/**
 * The agent toolbox.
 *
 * A model cannot edit a project by talking about it, so every capability is a
 * named tool with typed arguments, a workspace implementation and a one-line
 * result the model can read back. The set is deliberately small and boring:
 * projects, folders, files, patches, the preview, and the problems list.
 *
 * **Protocol.** Tools are called with a fenced block:
 *
 *     ```tool
 *     {"tool": "create_file", "args": {"path": "index.html", "content": "<!doctype html>"}}
 *     ```
 *
 * Plain JSON in a fence rather than provider-native function calling, because
 * BYOK means the model might be *any* provider, and a lot of cheap/free models
 * have no function-calling surface at all. JSON in text works everywhere, is
 * trivial to log, and the parser below is forgiving about fences and shapes.
 */
import type { ProjectFile, ProjectMeta } from '../../types'

export type ToolName =
  | 'list_projects'
  | 'create_project'
  | 'open_project'
  | 'rename_project'
  | 'delete_project'
  | 'list_files'
  | 'read_file'
  | 'create_file'
  | 'write_file'
  | 'patch_file'
  | 'delete_file'
  | 'rename_file'
  | 'create_folder'
  | 'delete_folder'
  | 'rename_folder'
  | 'move_file'
  | 'set_entry'
  | 'check_problems'
  | 'run_preview'
  | 'read_console'
  | 'finish'

export type ToolSpec = {
  name: ToolName
  group: 'project' | 'folder' | 'file' | 'run' | 'done'
  summary: string
  args: Array<{ name: string; type: 'string' | 'boolean'; required?: boolean; description: string }>
  /** Changes what is on disk / in the project. */
  writes?: boolean
  /** Cannot be undone by a later turn. */
  destructive?: boolean
}

export const TOOLS: ToolSpec[] = [
  {
    name: 'list_projects',
    group: 'project',
    summary: 'List the workspaces on this device with their id and file count.',
    args: [],
  },
  {
    name: 'create_project',
    group: 'project',
    summary: 'Create an empty workspace and open it. Use this before building something new.',
    args: [{ name: 'name', type: 'string', required: true, description: 'Workspace name, e.g. "Timer"' }],
    writes: true,
  },
  {
    name: 'open_project',
    group: 'project',
    summary: 'Switch to another workspace by name or id.',
    args: [{ name: 'project', type: 'string', required: true, description: 'Workspace name or id' }],
  },
  {
    name: 'rename_project',
    group: 'project',
    summary: 'Rename the current workspace.',
    args: [{ name: 'name', type: 'string', required: true, description: 'New name' }],
    writes: true,
  },
  {
    name: 'delete_project',
    group: 'project',
    summary: 'Delete a workspace and all of its files. Ask the user first.',
    args: [{ name: 'project', type: 'string', required: true, description: 'Workspace name or id' }],
    writes: true,
    destructive: true,
  },
  {
    name: 'list_files',
    group: 'file',
    summary: 'List every file path in the current workspace, with sizes.',
    args: [],
  },
  {
    name: 'read_file',
    group: 'file',
    summary: 'Read one file. Read before patching — patches need the exact text.',
    args: [{ name: 'path', type: 'string', required: true, description: 'File path, e.g. src/App.tsx' }],
  },
  {
    name: 'create_file',
    group: 'file',
    summary: 'Create a new file with its full content. Fails if the path exists (use write_file).',
    args: [
      { name: 'path', type: 'string', required: true, description: 'File path; folders are created automatically' },
      { name: 'content', type: 'string', description: 'The whole file' },
    ],
    writes: true,
  },
  {
    name: 'write_file',
    group: 'file',
    summary: 'Create or replace a whole file. Simplest way to write something new.',
    args: [
      { name: 'path', type: 'string', required: true, description: 'File path' },
      { name: 'content', type: 'string', required: true, description: 'The whole file' },
    ],
    writes: true,
  },
  {
    name: 'patch_file',
    group: 'file',
    summary:
      'Replace an exact snippet inside a file — use this for edits instead of rewriting the whole file.',
    args: [
      { name: 'path', type: 'string', required: true, description: 'File path' },
      { name: 'find', type: 'string', required: true, description: 'Exact existing text, including indentation' },
      { name: 'replace', type: 'string', required: true, description: 'What to put there (may be empty to delete)' },
      { name: 'all', type: 'boolean', description: 'Replace every occurrence instead of requiring exactly one' },
    ],
    writes: true,
  },
  {
    name: 'delete_file',
    group: 'file',
    summary: 'Delete a file.',
    args: [{ name: 'path', type: 'string', required: true, description: 'File path' }],
    writes: true,
    destructive: true,
  },
  {
    name: 'rename_file',
    group: 'file',
    summary: 'Rename or move a file to another path.',
    args: [
      { name: 'from', type: 'string', required: true, description: 'Current path' },
      { name: 'to', type: 'string', required: true, description: 'New path' },
    ],
    writes: true,
  },
  {
    name: 'create_folder',
    group: 'folder',
    summary: 'Create a folder, even an empty one.',
    args: [{ name: 'path', type: 'string', required: true, description: 'Folder path, e.g. src/lib' }],
    writes: true,
  },
  {
    name: 'delete_folder',
    group: 'folder',
    summary: 'Delete a folder and everything inside it.',
    args: [{ name: 'path', type: 'string', required: true, description: 'Folder path' }],
    writes: true,
    destructive: true,
  },
  {
    name: 'rename_folder',
    group: 'folder',
    summary: 'Rename a folder; files inside move with it.',
    args: [
      { name: 'from', type: 'string', required: true, description: 'Current path' },
      { name: 'to', type: 'string', required: true, description: 'New path' },
    ],
    writes: true,
  },
  {
    name: 'move_file',
    group: 'folder',
    summary: 'Put a file into a folder (or back to the root with an empty folder).',
    args: [
      { name: 'path', type: 'string', required: true, description: 'File path' },
      { name: 'folder', type: 'string', required: true, description: 'Target folder, "" for the root' },
    ],
    writes: true,
  },
  {
    name: 'set_entry',
    group: 'file',
    summary: 'Mark which file the preview and Run button should start from.',
    args: [{ name: 'path', type: 'string', required: true, description: 'Entry file path' }],
    writes: true,
  },
  {
    name: 'check_problems',
    group: 'run',
    summary: 'Run Cody’s real parsers over every file and return the syntax errors and warnings.',
    args: [],
  },
  {
    name: 'run_preview',
    group: 'run',
    summary: 'Bundle and run the project in the preview, then return the console output.',
    args: [],
  },
  {
    name: 'read_console',
    group: 'run',
    summary: 'Read the most recent console output without re-running.',
    args: [{ name: 'limit', type: 'string', description: 'How many lines (default 40)' }],
  },
  {
    name: 'finish',
    group: 'done',
    summary: 'Stop working and hand back to the user with a short summary. Call this when the task is done.',
    args: [
      { name: 'summary', type: 'string', required: true, description: 'What you built or changed, in one or two sentences' },
    ],
  },
]

export const TOOL_BY_NAME = new Map(TOOLS.map((tool) => [tool.name, tool]))

export const WRITE_TOOLS = new Set<ToolName>(
  TOOLS.filter((tool) => tool.writes).map((tool) => tool.name),
)

/* ------------------------------------------------------------------ */
/* the workspace the tools act on                                      */
/* ------------------------------------------------------------------ */

export type WorkspaceFile = ProjectFile

/**
 * Everything the tools are allowed to touch. `App` implements this, which keeps
 * the AI subsystem free of React, storage and bundling details — and makes the
 * whole toolbox testable with a plain object.
 */
export type ToolWorkspace = {
  currentProject: () => { id: string; name: string; files: ProjectFile[]; folders: string[] } | null
  listProjects: () => ProjectMeta[]
  createProject: (name: string) => Promise<{ id: string; name: string } | null>
  openProject: (nameOrId: string) => Promise<boolean>
  renameProject: (name: string) => Promise<boolean>
  deleteProject: (nameOrId: string) => Promise<boolean>
  createFile: (path: string, content: string) => Promise<boolean>
  writeFile: (path: string, content: string) => Promise<boolean>
  readFile: (path: string) => string | null
  deleteFile: (path: string) => Promise<boolean>
  renameFile: (from: string, to: string) => Promise<boolean>
  createFolder: (path: string) => Promise<boolean>
  deleteFolder: (path: string) => Promise<boolean>
  renameFolder: (from: string, to: string) => Promise<boolean>
  moveFile: (path: string, folder: string) => Promise<boolean>
  setEntry: (path: string) => Promise<boolean>
  listProblems: () => Array<{ path: string; line: number; column: number; severity: string; message: string; rule: string }>
  runPreview: () => Promise<{ ok: boolean; entry?: string; message?: string; htmlLength?: number }>
  readConsole: () => Array<{ level: string; text: string; time: number; source?: string }>
  /** A copy of the workspace before a run, so the run can be undone. */
  snapshot: () => Promise<{ id: string; name: string; files: ProjectFile[]; folders: string[] } | null>
  /** Put a snapshot back, and drop any project the run created. */
  restore: (snapshot: { id: string; name: string; files: ProjectFile[]; folders: string[] }, createdProjectIds: string[]) => Promise<boolean>
}

export type ToolResult = {
  ok: boolean
  /** One or two lines for the model, and for the chip in the chat. */
  summary: string
  data?: unknown
}

const EMPTY_RESULT = (summary: string): ToolResult => ({ ok: false, summary })

/* ------------------------------------------------------------------ */
/* argument hygiene                                                    */
/* ------------------------------------------------------------------ */

/** Paths are project-relative, POSIX, and never escape the project. */
export function cleanPath(input: unknown): string | null {
  if (typeof input !== 'string') return null
  const trimmed = input.trim().replace(/^\.\//, '').replace(/^\/+/, '')
  if (!trimmed) return null
  const parts = trimmed.split('/').filter((part) => part.length > 0 && part !== '.')
  if (parts.some((part) => part === '..')) return null
  if (/^[a-z]:/i.test(parts[0] ?? '')) return null
  return parts.join('/')
}

function str(args: Record<string, unknown>, key: string): string | null {
  const value = args[key]
  if (typeof value === 'string') return value
  if (typeof value === 'number') return String(value)
  return null
}

function folderOf(path: string): string {
  const index = path.lastIndexOf('/')
  return index === -1 ? '' : path.slice(0, index)
}

function baseOf(path: string): string {
  return path.slice(path.lastIndexOf('/') + 1)
}

/* ------------------------------------------------------------------ */
/* execution                                                           */
/* ------------------------------------------------------------------ */

export async function executeTool(
  name: string,
  rawArgs: Record<string, unknown>,
  workspace: ToolWorkspace,
): Promise<ToolResult> {
  const args = rawArgs ?? {}
  const spec = TOOL_BY_NAME.get(name as ToolName)
  if (!spec) return EMPTY_RESULT(`Unknown tool “${name}”. Available: ${TOOLS.map((tool) => tool.name).join(', ')}`)

  switch (spec.name) {
    case 'list_projects': {
      const projects = workspace.listProjects()
      const current = workspace.currentProject()
      const lines = projects.map(
        (project) =>
          `${project.id === current?.id ? '*' : ' '} ${project.name} — ${project.fileCount} file${project.fileCount === 1 ? '' : 's'} (id ${project.id})`,
      )
      return {
        ok: true,
        summary: `${projects.length} workspace${projects.length === 1 ? '' : 's'}${current ? `, current: ${current.name}` : ''}`,
        data: lines.join('\n'),
      }
    }

    case 'create_project': {
      const name = str(args, 'name')?.trim()
      if (!name) return EMPTY_RESULT('create_project needs a name')
      const created = await workspace.createProject(name)
      return created
        ? { ok: true, summary: `Created and opened “${created.name}”`, data: created }
        : EMPTY_RESULT(`Could not create “${name}”`)
    }

    case 'open_project': {
      const wanted = str(args, 'project')?.trim()
      if (!wanted) return EMPTY_RESULT('open_project needs a workspace name or id')
      const opened = await workspace.openProject(wanted)
      const current = workspace.currentProject()
      return opened
        ? { ok: true, summary: `Opened “${current?.name ?? wanted}”`, data: { name: current?.name, files: current?.files.map((file) => file.path) } }
        : EMPTY_RESULT(`No workspace called “${wanted}”`)
    }

    case 'rename_project': {
      const name = str(args, 'name')?.trim()
      if (!name) return EMPTY_RESULT('rename_project needs a name')
      return (await workspace.renameProject(name))
        ? { ok: true, summary: `Renamed the workspace to “${name}”` }
        : EMPTY_RESULT('Could not rename the workspace')
    }

    case 'delete_project': {
      const wanted = str(args, 'project')?.trim()
      if (!wanted) return EMPTY_RESULT('delete_project needs a workspace name or id')
      return (await workspace.deleteProject(wanted))
        ? { ok: true, summary: `Deleted “${wanted}”` }
        : EMPTY_RESULT(`No workspace called “${wanted}”`)
    }

    case 'list_files': {
      const project = workspace.currentProject()
      if (!project) return EMPTY_RESULT('No workspace is open')
      if (project.files.length === 0) return { ok: true, summary: 'The workspace has no files', data: '' }
      const lines = project.files.map((file) => `${file.path} (${file.content.split('\n').length} lines)`)
      return { ok: true, summary: `${project.files.length} files`, data: lines.join('\n') }
    }

    case 'read_file': {
      const path = cleanPath(args.path)
      if (!path) return EMPTY_RESULT('read_file needs a valid relative path')
      const content = workspace.readFile(path)
      if (content === null) return EMPTY_RESULT(`No file at ${path}`)
      return { ok: true, summary: `Read ${path} (${content.length} bytes)`, data: content }
    }

    case 'create_file':
    case 'write_file': {
      const path = cleanPath(args.path)
      if (!path) return EMPTY_RESULT(`${spec.name} needs a valid relative path`)
      const content = str(args, 'content') ?? ''
      const existing = workspace.readFile(path)
      if (spec.name === 'create_file' && existing !== null) {
        return EMPTY_RESULT(`${path} already exists — use write_file or patch_file`)
      }
      const done =
        spec.name === 'create_file'
          ? await workspace.createFile(path, content)
          : existing === null
            ? await workspace.createFile(path, content)
            : await workspace.writeFile(path, content)
      if (!done) return EMPTY_RESULT(`Could not write ${path}`)
      const lines = content.split('\n').length
      return {
        ok: true,
        summary: `${existing === null ? 'Created' : 'Rewrote'} ${path} (${lines} lines)`,
        data: { path, lines },
      }
    }

    case 'patch_file': {
      const path = cleanPath(args.path)
      if (!path) return EMPTY_RESULT('patch_file needs a valid relative path')
      const find = str(args, 'find')
      const replace = str(args, 'replace')
      if (find === null || replace === null) return EMPTY_RESULT('patch_file needs both “find” and “replace”')
      if (find.length === 0) return EMPTY_RESULT('patch_file “find” cannot be empty — use write_file instead')
      const content = workspace.readFile(path)
      if (content === null) return EMPTY_RESULT(`No file at ${path}`)
      const all = args.all === true
      const count = content.split(find).length - 1
      if (count === 0) {
        return EMPTY_RESULT(`“find” does not appear in ${path} — read_file first and copy the text exactly`)
      }
      if (count > 1 && !all) {
        return EMPTY_RESULT(`“find” appears ${count} times in ${path}; make it unique, or pass "all": true`)
      }
      const next = all ? content.split(find).join(replace) : content.replace(find, replace)
      const written = await workspace.writeFile(path, next)
      if (!written) return EMPTY_RESULT(`Could not write ${path}`)
      return {
        ok: true,
        summary: `Patched ${path} (${all ? count : 1} change${(all ? count : 1) === 1 ? '' : 's'})`,
        data: { path, replaced: all ? count : 1 },
      }
    }

    case 'delete_file': {
      const path = cleanPath(args.path)
      if (!path) return EMPTY_RESULT('delete_file needs a valid relative path')
      if (workspace.readFile(path) === null) return EMPTY_RESULT(`No file at ${path}`)
      return (await workspace.deleteFile(path))
        ? { ok: true, summary: `Deleted ${path}` }
        : EMPTY_RESULT(`Could not delete ${path}`)
    }

    case 'rename_file': {
      const from = cleanPath(args.from)
      const to = cleanPath(args.to)
      if (!from || !to) return EMPTY_RESULT('rename_file needs “from” and “to” paths')
      if (from === to) return { ok: true, summary: `${from} is already at that path` }
      const folder = folderOf(to)
      if (folder) await workspace.createFolder(folder)
      return (await workspace.renameFile(from, to))
        ? { ok: true, summary: `Renamed ${from} → ${to}` }
        : EMPTY_RESULT(`Could not rename ${from} — does ${to} already exist?`)
    }

    case 'create_folder': {
      const path = cleanPath(args.path)
      if (!path) return EMPTY_RESULT('create_folder needs a valid relative path')
      return (await workspace.createFolder(path))
        ? { ok: true, summary: `Created folder ${path}/` }
        : EMPTY_RESULT(`Could not create ${path}/`)
    }

    case 'delete_folder': {
      const path = cleanPath(args.path)
      if (!path) return EMPTY_RESULT('delete_folder needs a valid relative path')
      return (await workspace.deleteFolder(path))
        ? { ok: true, summary: `Deleted folder ${path}/` }
        : EMPTY_RESULT(`No folder at ${path}/`)
    }

    case 'rename_folder': {
      const from = cleanPath(args.from)
      const to = cleanPath(args.to)
      if (!from || !to) return EMPTY_RESULT('rename_folder needs “from” and “to” paths')
      return (await workspace.renameFolder(from, to))
        ? { ok: true, summary: `Renamed folder ${from}/ → ${to}/` }
        : EMPTY_RESULT(`Could not rename ${from}/`)
    }

    case 'move_file': {
      const path = cleanPath(args.path)
      const folderRaw = str(args, 'folder')
      const folder = folderRaw === null || folderRaw.trim() === '' ? '' : cleanPath(folderRaw)
      if (!path) return EMPTY_RESULT('move_file needs a valid file path')
      if (folder === null) return EMPTY_RESULT('move_file needs a valid folder path')
      const target = `${folder ? `${folder}/` : ''}${baseOf(path)}`
      if (target === path) return { ok: true, summary: `${path} is already there` }
      if (folder) await workspace.createFolder(folder)
      return (await workspace.moveFile(path, folder))
        ? { ok: true, summary: `Moved ${path} → ${target}` }
        : EMPTY_RESULT(`Could not move ${path} to ${folder || 'the root'}`)
    }

    case 'set_entry': {
      const path = cleanPath(args.path)
      if (!path) return EMPTY_RESULT('set_entry needs a valid relative path')
      if (workspace.readFile(path) === null) return EMPTY_RESULT(`No file at ${path}`)
      return (await workspace.setEntry(path))
        ? { ok: true, summary: `Entry file is now ${path}` }
        : EMPTY_RESULT('Could not set the entry file')
    }

    case 'check_problems': {
      const problems = workspace.listProblems()
      if (problems.length === 0) return { ok: true, summary: 'No problems found', data: '' }
      const errors = problems.filter((problem) => problem.severity === 'error').length
      const lines = problems.slice(0, 24).map(
        (problem) => `${problem.severity === 'error' ? 'ERROR' : 'WARN'} ${problem.path}:${problem.line}:${problem.column} ${problem.message} [${problem.rule}]`,
      )
      return {
        ok: errors === 0,
        summary: `${errors} error${errors === 1 ? '' : 's'} · ${problems.length - errors} warning${problems.length - errors === 1 ? '' : 's'}`,
        data: lines.join('\n'),
      }
    }

    case 'run_preview': {
      const result = await workspace.runPreview()
      const logs = workspace.readConsole().slice(-12)
      const logLines = logs.map((entry) => `[${entry.level}] ${entry.text}`).join('\n')
      return {
        ok: result.ok,
        summary: result.ok
          ? `Preview ran${result.entry ? ` from ${result.entry}` : ''}${result.htmlLength ? ` (${Math.round(result.htmlLength / 1024)} kB)` : ''}`
          : `Preview failed${result.message ? `: ${result.message}` : ''}`,
        data: logLines || '(no console output)',
      }
    }

    case 'read_console': {
      const raw = str(args, 'limit')
      const limit = Math.min(120, Math.max(1, Number(raw) || 40))
      const logs = workspace.readConsole().slice(-limit)
      if (logs.length === 0) return { ok: true, summary: 'The console is empty', data: '' }
      return {
        ok: true,
        summary: `${logs.length} console line${logs.length === 1 ? '' : 's'}`,
        data: logs.map((entry) => `[${entry.level}] ${entry.text}`).join('\n'),
      }
    }

    case 'finish': {
      const summary = str(args, 'summary')?.trim() || 'Done'
      return { ok: true, summary: `Finished — ${summary}`, data: { done: true } }
    }
  }
}

/* ------------------------------------------------------------------ */
/* parsing the model's answer                                          */
/* ------------------------------------------------------------------ */

export type ToolCall = { tool: string; args: Record<string, unknown>; raw: string }

const FENCE = /```(?:tool|json|jsonc)?\s*\n?([\s\S]*?)```/gi

function objectToCall(value: unknown): ToolCall | null {
  if (!value || typeof value !== 'object') return null
  const record = value as Record<string, unknown>
  const name = (record.tool ?? record.name ?? record.function ?? record.action) as unknown
  if (typeof name !== 'string' || !name.trim()) return null
  const rawArgs = record.args ?? record.arguments ?? record.params ?? record.input
  let args: Record<string, unknown> = {}
  if (typeof rawArgs === 'string') {
    try {
      args = JSON.parse(rawArgs) as Record<string, unknown>
    } catch {
      args = {}
    }
  } else if (rawArgs && typeof rawArgs === 'object') {
    args = rawArgs as Record<string, unknown>
  } else {
    // tolerate flat arguments: {"tool": "create_file", "path": "...", "content": "..."}
    const { tool: _tool, name: _name, function: _fn, action: _action, args: _args, arguments: _arguments, params: _params, input: _input, ...rest } = record
    args = rest
  }
  return { tool: name.trim(), args, raw: JSON.stringify(record) }
}

/** Every tool call in a model answer, in order. */
export function parseToolCalls(text: string): ToolCall[] {
  const calls: ToolCall[] = []
  FENCE.lastIndex = 0
  let match = FENCE.exec(text)
  while (match) {
    const body = match[1].trim()
    if (body) {
      try {
        const parsed = JSON.parse(body) as unknown
        if (Array.isArray(parsed)) {
          for (const entry of parsed) {
            const call = objectToCall(entry)
            if (call) calls.push(call)
          }
        } else {
          const call = objectToCall(parsed)
          if (call) calls.push(call)
        }
      } catch {
        /* not a tool block — prose in a fence, which is fine */
      }
    }
    match = FENCE.exec(text)
  }

  // gpt-oss and friends emit their tool calls as harmony control tokens when
  // they are not given a native `tools` array:
  //   <|channel|>commentary to=functions.list_projects <|constrain|>json<|message|>{"x":1}<|call|>
  const harmony = /to=functions\.([a-zA-Z0-9_.-]+)[\s\S]{0,120}?<\|message\|>([\s\S]*?)(?:<\|call\|>|<\|end\|>|<\|start\|>|$)/g
  let token = harmony.exec(text)
  while (token) {
    const args = token[2].trim()
    let parsedArgs: Record<string, unknown> = {}
    if (args) {
      try {
        const value = JSON.parse(args) as unknown
        if (value && typeof value === 'object' && !Array.isArray(value)) parsedArgs = value as Record<string, unknown>
      } catch {
        parsedArgs = {}
      }
    }
    calls.push({ tool: token[1].split('.').pop() ?? token[1], args: parsedArgs, raw: token[0].trim() })
    token = harmony.exec(text)
  }

  // A last-resort shape some models fall into: <tool>{...}</tool>
  const tagged = /<tool[^>]*>\s*([\s\S]*?)\s*<\/tool>/gi
  let tag = tagged.exec(text)
  while (tag) {
    try {
      const call = objectToCall(JSON.parse(tag[1]))
      if (call) calls.push(call)
    } catch {
      /* ignore */
    }
    tag = tagged.exec(text)
  }

  return calls
}

/**
 * The prose of an answer, with the tool blocks taken out.
 *
 * Only fences that actually contain a tool call are removed — a model that
 * explains itself with a code sample must keep its code sample.
 */
export function stripToolBlocks(text: string): string {
  return text
    .replace(new RegExp(FENCE.source, 'gi'), (match, body: string) => {
      const trimmed = String(body ?? '').trim()
      if (!trimmed) return match
      try {
        const parsed = JSON.parse(trimmed) as unknown
        const entries = Array.isArray(parsed) ? parsed : [parsed]
        return entries.some((entry) => objectToCall(entry) !== null) ? '' : match
      } catch {
        return match
      }
    })
    .replace(/<tool[^>]*>[\s\S]*?<\/tool>/gi, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

/* ------------------------------------------------------------------ */
/* tool echoes                                                         */
/* ------------------------------------------------------------------ */

/**
 * A cheap model will sometimes answer a tool result by *restating* it in the
 * chat: `[Tool Output]` followed by the JSON it thinks it received. That is
 * not an answer, it is a copy of what the app already shows as a chip — so it
 * is cut before it reaches the transcript.
 *
 * Only marker-then-payload is removed. An ordinary JSON block in an ordinary
 * answer ("show me the shape of a project") stays exactly where it is.
 */
const ECHO_MARKER =
  /^[ \t>*#_`-]*(?:\[[^\]\n]{0,24}(?:tool|function)[ \t_-]?(?:output|result|response|call)[^\]\n]{0,12}\]|\((?:tool|function)[ \t_-]?(?:output|result|response)\)|(?:tool|function)[ \t_-]?(?:output|result|response)[ \t]*:)/gim

/** Index just past a balanced JSON object/array starting at `start`. */
function skipBalanced(text: string, start: number): number {
  let depth = 0
  let inString = false
  let escaped = false
  for (let index = start; index < text.length; index += 1) {
    const char = text[index]
    if (inString) {
      if (escaped) escaped = false
      else if (char === '\\') escaped = true
      else if (char === '"') inString = false
      continue
    }
    if (char === '"') inString = true
    else if (char === '[' || char === '{') depth += 1
    else if (char === ']' || char === '}') {
      depth -= 1
      if (depth === 0) return index + 1
    }
  }
  return -1
}

/** Remove `[Tool Output] …` restatements and stray control tokens. */
export function stripToolEcho(input: string): string {
  let text = String(input ?? '')
  if (!text.trim()) return ''
  text = text
    .replace(/<tool[_-](?:output|result)>[\s\S]*?<\/tool[_-](?:output|result)>/gi, ' ')
    // harmony-style control tokens some OpenAI-compatible providers leak
    .replace(/<\|[^|\n]{0,40}\|>/g, ' ')

  let result = ''
  let cursor = 0
  for (;;) {
    ECHO_MARKER.lastIndex = cursor
    const match = ECHO_MARKER.exec(text)
    if (!match) {
      result += text.slice(cursor)
      break
    }
    result += text.slice(cursor, match.index)

    const markerEnd = match.index + match[0].length
    const lineEnd = text.indexOf('\n', markerEnd)
    const inline = text.slice(markerEnd, lineEnd === -1 ? text.length : lineEnd).trim()

    // Where does the payload start? Same line, or after the marker line.
    let payloadAt = markerEnd
    while (payloadAt < text.length && /\s/.test(text[payloadAt])) payloadAt += 1
    const isPayload =
      text.startsWith('```', payloadAt) || text[payloadAt] === '[' || text[payloadAt] === '{'
    // A marker followed by a plain sentence is prose: only the marker goes.
    const skipPayload = isPayload && (inline === '' || /^[[{`]/.test(inline))

    let after = markerEnd
    if (skipPayload) {
      if (text.startsWith('```', payloadAt)) {
        const close = text.indexOf('```', payloadAt + 3)
        after = close === -1 ? text.length : close + 3
      } else {
        const end = skipBalanced(text, payloadAt)
        after = end === -1 ? text.length : end
      }
    }
    cursor = Math.max(after, markerEnd)
  }

  return result
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

/** The compact tool manual that goes in the system prompt. */
export function toolCatalogText(): string {
  return TOOLS.map((tool) => {
    const args = tool.args
      .map((arg) => `${arg.name}${arg.required ? '' : '?'}:${arg.type}`)
      .join(', ')
    return `- ${tool.name}(${args}) — ${tool.summary}`
  }).join('\n')
}

/** Names only, for a one-line "what can it do" in the UI. */
export function toolGroups(): Array<{ group: string; label: string; tools: ToolSpec[] }> {
  const labels: Record<string, string> = {
    project: 'Workspaces',
    folder: 'Folders',
    file: 'Files',
    run: 'Preview & checks',
    done: 'Hand back',
  }
  return ['project', 'folder', 'file', 'run', 'done'].map((group) => ({
    group,
    label: labels[group],
    tools: TOOLS.filter((tool) => tool.group === group),
  }))
}
