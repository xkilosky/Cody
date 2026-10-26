/// <reference lib="webworker" />

/**
 * Python runtime worker — loads Pyodide from a CDN, mounts the project into a
 * virtual filesystem and executes the entry script. Kept in a worker so the UI
 * thread never blocks while Python starts up.
 */

const PYODIDE_VERSION = '0.26.2'
const BASE = `https://cdn.jsdelivr.net/npm/pyodide@${PYODIDE_VERSION}/`

type PyodideLike = {
  FS: {
    mkdirTree: (path: string) => void
    writeFile: (path: string, data: string | Uint8Array) => void
  }
  runPythonAsync: (code: string) => Promise<unknown>
  setStdout: (opts: { batched: (text: string) => void }) => void
  setStderr: (opts: { batched: (text: string) => void }) => void
  setStdin?: (opts: { stdin: () => string }) => void
  loadPackagesFromImports?: (code: string) => Promise<unknown>
}

let pyodide: PyodideLike | null = null
let loading: Promise<PyodideLike> | null = null

function post(message: Record<string, unknown>) {
  ;(self as unknown as Worker).postMessage(message)
}

async function ensurePyodide(): Promise<PyodideLike> {
  if (pyodide) return pyodide
  if (loading) return loading
  loading = (async () => {
    post({ type: 'status', message: 'Downloading Python runtime (~10 MB)…' })
    const mod = (await import(/* @vite-ignore */ `${BASE}pyodide.mjs`)) as {
      loadPyodide: (opts: { indexURL: string }) => Promise<PyodideLike>
    }
    post({ type: 'status', message: 'Starting Python…' })
    const instance = await mod.loadPyodide({ indexURL: BASE })
    instance.setStdout({ batched: (text) => post({ type: 'stdout', text }) })
    instance.setStderr({ batched: (text) => post({ type: 'stderr', text }) })
    pyodide = instance
    post({ type: 'status', message: 'Python ready' })
    return instance
  })()
  return loading
}

type RunMessage = {
  type: 'run'
  entry: string
  files: Array<{ path: string; content: string }>
  pip?: string[]
}

const ROOT = '/home/pyodide/project'

self.addEventListener('message', async (event: MessageEvent<RunMessage>) => {
  const data = event.data
  if (!data || data.type !== 'run') return
  try {
    const py = await ensurePyodide()
    const entry = data.entry || data.files[0]?.path
    if (!entry) {
      post({ type: 'error', text: 'No Python file to run.' })
      return
    }
    post({ type: 'status', message: `Running ${entry}…` })
    try {
      py.FS.mkdirTree(ROOT)
    } catch {
      /* exists */
    }
    for (const file of data.files) {
      const target = `${ROOT}/${file.path.replace(/^\/+/, '')}`
      const dir = target.slice(0, target.lastIndexOf('/'))
      try {
        py.FS.mkdirTree(dir)
      } catch {
        /* exists */
      }
      py.FS.writeFile(target, file.content)
    }

    const entryDir = entry.includes('/') ? `${ROOT}/${entry.slice(0, entry.lastIndexOf('/'))}` : ROOT
    const setup = [
      'import sys, os',
      `os.chdir(${JSON.stringify(entryDir)})`,
      `sys.path.insert(0, ${JSON.stringify(entryDir)})`,
      `sys.path.insert(0, ${JSON.stringify(ROOT)})`,
    ].join('\n')
    await py.runPythonAsync(setup)

    const source = data.files.find((f) => f.path === entry)?.content ?? ''
    if (py.loadPackagesFromImports && /^\s*(import|from)\s+/m.test(source)) {
      post({ type: 'status', message: 'Resolving Python packages…' })
      try {
        await py.loadPackagesFromImports(source)
      } catch {
        /* missing package will surface when running */
      }
    }

    try {
      await py.runPythonAsync(
        `import runpy\nrunpy.run_path(${JSON.stringify(entry)}, run_name="__main__")`,
      )
    } finally {
      post({ type: 'done' })
    }
  } catch (error) {
    const message =
      error instanceof Error
        ? (error as Error & { message: string }).message
        : String(error)
    post({ type: 'error', text: message.replace(/\n+$/, '') })
    post({ type: 'done' })
  }
})

export {}
