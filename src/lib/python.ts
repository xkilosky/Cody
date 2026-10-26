import type { LogLevel } from '../types'
import PythonWorker from './python.worker?worker'

export type RunnerLog = (level: LogLevel, text: string) => void

let worker: Worker | null = null
let activeLog: RunnerLog | null = null

function getWorker(): Worker {
  if (!worker) {
    worker = new PythonWorker()
    worker.addEventListener('message', (event: MessageEvent<Record<string, unknown>>) => {
      const data = event.data
      if (!data) return
      const log = activeLog
      switch (data.type) {
        case 'status':
        case 'ready':
          log?.('system', String(data.message ?? ''))
          break
        case 'stdout':
          log?.('log', String(data.text ?? ''))
          break
        case 'stderr':
          log?.('warn', String(data.text ?? ''))
          break
        case 'error':
          log?.('error', String(data.text ?? 'Python error'))
          break
        case 'done':
          log?.('success', 'Python process finished')
          activeLog = null
          break
        default:
          break
      }
    })
    worker.addEventListener('error', (event) => {
      activeLog?.('error', `Python worker error: ${event.message || 'unknown error'}`)
      activeLog = null
    })
  }
  return worker
}

export function runPython(
  files: Array<{ path: string; content: string }>,
  entry: string,
  onLog: RunnerLog,
): () => void {
  activeLog = onLog
  const instance = getWorker()
  instance.postMessage({ type: 'run', entry, files: files.filter((f) => f.path.endsWith('.py')) })
  return () => {
    activeLog = null
    worker?.terminate()
    worker = null
  }
}

export function stopPython() {
  activeLog = null
  worker?.terminate()
  worker = null
}
