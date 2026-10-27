export type ProjectFile = {
  path: string
  content: string
}

export type Project = {
  id: string
  name: string
  files: ProjectFile[]
  /** Folders that exist even when empty. Implied folders come from file paths. */
  folders?: string[]
  /** Preferred entry file, relative to project root. */
  entry?: string
  description?: string
  templateId?: string
  createdAt: number
  updatedAt: number
}

export type ProjectMeta = {
  id: string
  name: string
  description?: string
  templateId?: string
  fileCount: number
  createdAt: number
  updatedAt: number
}

export type ThemeName = 'dark' | 'light'

export type Settings = {
  theme: ThemeName
  /** Syntax colour scheme: 'vscode' | 'onedark' | 'github'. */
  syntaxTheme: string
  fontFamily: 'mono' | 'serif'
  fontSize: number
  tabSize: number
  lineWrap: boolean
  autoRun: boolean
  haptics: boolean
  showLineNumbers: boolean
  /** Endpoint used for cloud (non-browser) code execution. */
  runnerEndpoint: string
}

export const DEFAULT_SETTINGS: Settings = {
  theme: 'dark',
  syntaxTheme: 'vscode',
  fontFamily: 'mono',
  fontSize: 13,
  tabSize: 2,
  lineWrap: true,
  autoRun: false,
  haptics: true,
  showLineNumbers: true,
  runnerEndpoint: 'https://emkc.org/api/v2/piston/execute',
}

export type LogLevel = 'log' | 'info' | 'warn' | 'error' | 'system' | 'success'

export type LogEntry = {
  id: string
  level: LogLevel
  text: string
  time: number
  source?: string
}

export type AppTab = 'files' | 'code' | 'run' | 'cody' | 'ai'

export type RunKind = 'idle' | 'bundling' | 'running' | 'loading-runtime' | 'done' | 'error'

export type RunState = {
  kind: RunKind
  message?: string
  /** Increments every time a new run is started so the preview re-mounts. */
  runId: number
  previewHtml?: string
  entry?: string
  runtimeLabel?: string
  url?: string
}

export type Toast = { id: string; message: string; tone?: 'info' | 'success' | 'error' }
