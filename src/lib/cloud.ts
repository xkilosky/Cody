import type { Project } from '../types'
import type { RunnerLog } from './python'
import { languageForPath } from './languages'

export type CloudRunOptions = {
  endpoint: string
  entry: string
  project: Project
  stdin?: string
  args?: string[]
  onLog: RunnerLog
  signal?: AbortSignal
}

type PistonFile = { name?: string; content: string }
type PistonResponse = {
  language?: string
  version?: string
  run?: { stdout?: string; stderr?: string; output?: string; code?: number | null; signal?: string | null }
  compile?: { stdout?: string; stderr?: string; output?: string; code?: number | null }
  message?: string
}

/** Languages where Piston expects a single source file. */
function pistonPayload(entry: string, project: Project, stdin: string, args: string[]) {
  const lang = languageForPath(entry)
  const language = lang.id === 'typescript' ? 'typescript' : lang.cloud ?? lang.id
  const file = project.files.find((f) => f.path === entry)
  const content = file?.content ?? ''
  return {
    language,
    version: '*',
    files: [{ name: entry.split('/').pop() || 'main', content }] as PistonFile[],
    stdin,
    args,
    compile_timeout: 10000,
    run_timeout: 10000,
  }
}

export async function runInCloud({ endpoint, entry, project, stdin = '', args = [], onLog, signal }: CloudRunOptions) {
  const lang = languageForPath(entry)
  if (!lang.cloud) {
    onLog('error', `${lang.label} can't run in the cloud sandbox yet.`)
    return
  }
  if (!endpoint) {
    onLog('error', 'No runner endpoint configured. Add one in Settings → Runner.')
    return
  }
  onLog('system', `Sending ${entry} to cloud sandbox (Piston)…`)
  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(pistonPayload(entry, project, stdin, args)),
      signal,
    })
    if (!response.ok) {
      const detail = await response.text().catch(() => '')
      let message = `Runner responded ${response.status}`
      try {
        const parsed = JSON.parse(detail) as { message?: string }
        if (parsed.message) message = parsed.message
      } catch {
        if (detail) message += ` — ${detail.slice(0, 180)}`
      }
      onLog('error', message)
      onLog(
        'system',
        'Tip: the public Piston API may rate-limit. Point Cody at your own Piston endpoint in Settings → Runner.',
      )
      return
    }
    const data = (await response.json()) as PistonResponse
    if (data.compile?.stdout) onLog('info', data.compile.stdout.trimEnd())
    if (data.compile?.stderr) onLog('warn', data.compile.stderr.trimEnd())
    if (data.compile && data.compile.code !== 0 && !data.run?.output) {
      onLog('error', `Compilation failed with exit code ${data.compile.code}`)
      return
    }
    if (data.run?.stdout) onLog('log', data.run.stdout.trimEnd())
    if (data.run?.stderr) onLog('warn', data.run.stderr.trimEnd())
    if (!data.run?.stdout && !data.run?.stderr) {
      if (data.message) onLog('error', data.message)
      else onLog('system', 'Program produced no output.')
    }
    if (data.run?.code != null && data.run.code !== 0) {
      onLog('error', `Exited with code ${data.run.code}${data.run.signal ? ` (${data.run.signal})` : ''}`)
    } else {
      onLog('success', 'Finished')
    }
  } catch (error) {
    if ((error as Error)?.name === 'AbortError') {
      onLog('system', 'Run cancelled.')
      return
    }
    onLog('error', `Cloud run failed: ${(error as Error)?.message ?? String(error)}`)
    onLog('system', 'Check your network connection and the runner endpoint in Settings.')
  }
}

export async function checkRunner(endpoint: string): Promise<string> {
  const base = endpoint.replace(/\/execute\/?$/, '')
  const response = await fetch(`${base}/runtimes`, { headers: { Accept: 'application/json' } })
  if (!response.ok) throw new Error(`Runner responded ${response.status}`)
  const runtimes = (await response.json()) as Array<{ language: string; version: string }>
  return `${runtimes.length} runtimes available`
}
