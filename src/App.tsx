import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type {
  LogEntry,
  Project,
  ProjectMeta,
  RunState,
  Settings,
  Toast,
} from './types'
import { DEFAULT_SETTINGS } from './types'
import ProjectSwitcher from './components/ProjectSwitcher'
import ProjectView from './components/ProjectView'
import SettingsSheet from './components/SettingsSheet'
import Toasts from './components/Toasts'
import { bundleProject, findEntryForFile, resolveEntry } from './lib/bundle'
import { runInCloud } from './lib/cloud'
import { runPython, stopPython } from './lib/python'
import { languageForPath } from './lib/languages'
import { dirName, fileName, normalizePath, uid } from './lib/utils'
import { allFolders, ancestorFolders, filesUnder, foldersUnder } from './lib/projectTree'
import {
  deleteProject as deleteProjectRecord,
  getValue,
  listProjects,
  loadProject,
  loadSettings,
  saveProject,
  saveSettings,
  setValue,
} from './lib/storage'
import { blankProject } from './lib/starter'

type Cleanup = () => void

export default function App() {
  const [booting, setBooting] = useState(true)
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS)
  const [projects, setProjects] = useState<ProjectMeta[]>([])
  const [project, setProject] = useState<Project | null>(null)
  const [activePath, setActivePath] = useState<string | null>(null)
  const [runEntry, setRunEntry] = useState<string | null>(null)
  const [tab, setTab] = useState<'files' | 'code' | 'run' | 'cody'>('code')
  const [runState, setRunState] = useState<RunState>({ kind: 'idle', runId: 0 })
  const [logs, setLogs] = useState<LogEntry[]>([])
  const [stdin, setStdin] = useState('')
  const [toasts, setToasts] = useState<Toast[]>([])
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [switcherOpen, setSwitcherOpen] = useState(false)
  const [savedAt, setSavedAt] = useState<number | null>(null)
  const [unsaved, setUnsaved] = useState(false)
  const [recentPaths, setRecentPaths] = useState<string[]>([])

  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const cleanupRef = useRef<Cleanup | null>(null)
  const projectRef = useRef<Project | null>(null)
  const savedAtRef = useRef<number | null>(null)

  projectRef.current = project
  savedAtRef.current = savedAt

  /* ---------------------------------------------------------------- */
  /* boot                                                              */
  /* ---------------------------------------------------------------- */

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const [storedSettings, metas, lastId] = await Promise.all([
        loadSettings(),
        listProjects(),
        getValue<string | null>('lastProject', null),
      ])
      if (cancelled) return
      setSettings(storedSettings)
      setProjects(metas)

      // Editor first: always boot straight into a workspace.
      const firstRun = !lastId && metas.length === 0
      let target: Project | null = null
      if (lastId) target = await loadProject(lastId)
      if (!target && metas.length > 0) target = await loadProject(metas[0].id)
      if (!target) {
        target = blankProject()
        await saveProject(target)
      }
      if (cancelled || !target) return
      setProjects(await listProjects())
      if (cancelled) return
      enterProject(target)
      setBooting(false)
      if (firstRun) {
        setTimeout(
          () => notify('Fresh workspace — tap the workspace name to switch or start another', 'info'),
          700,
        )
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return
    const media = window.matchMedia('(prefers-color-scheme: dark)')
    const onChange = (event: MediaQueryListEvent) => {
      if (event.matches && settings.theme === 'light') {
        // Keep the user's explicit choice; only used when they never picked.
      }
    }
    media.addEventListener('change', onChange)
    return () => media.removeEventListener('change', onChange)
  }, [settings.theme])

  useEffect(() => {
    document.documentElement.dataset.theme = settings.theme
    document.documentElement.style.setProperty('--editor-font-size', `${settings.fontSize}px`)
  }, [settings.theme, settings.fontSize])

  /* ---------------------------------------------------------------- */
  /* helpers                                                           */
  /* ---------------------------------------------------------------- */

  const notify = useCallback((message: string, tone: Toast['tone'] = 'info') => {
    const id = uid('t_')
    setToasts((prev) => [...prev.slice(-2), { id, message, tone }])
    setTimeout(() => setToasts((prev) => prev.filter((toast) => toast.id !== id)), 2600)
  }, [])

  const addLog = useCallback((level: LogEntry['level'], text: string, source?: string) => {
    if (!text) return
    setLogs((prev) => [
      ...prev.slice(-499),
      { id: uid('l_'), level, text, time: Date.now(), source },
    ])
  }, [])

  const updateSettings = useCallback((patch: Partial<Settings>) => {
    setSettings((prev) => {
      const next = { ...prev, ...patch }
      void saveSettings(next)
      return next
    })
  }, [])

  const refreshProjects = useCallback(async () => {
    setProjects(await listProjects())
  }, [])

  const persistProject = useCallback((next: Project, immediate = false) => {
    if (saveTimer.current) clearTimeout(saveTimer.current)
    const write = () => {
      void saveProject(next).then(() => {
        setSavedAt(Date.now())
        setUnsaved(false)
        void refreshProjects()
      })
    }
    if (immediate) write()
    else saveTimer.current = setTimeout(write, 450)
  }, [refreshProjects])

  const commit = useCallback(
    (updater: (prev: Project) => Project, immediate = false) => {
      const current = projectRef.current
      if (!current) return
      const next = { ...updater(current), updatedAt: Date.now() }
      projectRef.current = next
      setProject(next)
      setUnsaved(true)
      persistProject(next, immediate)
    },
    [persistProject],
  )

  const enterProject = useCallback((next: Project) => {
    // Flush any pending edit of the project we are leaving.
    const previous = projectRef.current
    if (previous && previous.id !== next.id && saveTimer.current) {
      clearTimeout(saveTimer.current)
      void saveProject(previous)
    }
    cleanupRef.current?.()
    cleanupRef.current = null
    setProject(next)
    projectRef.current = next
    const firstPath =
      next.entry && next.files.some((f) => f.path === next.entry) ? next.entry : next.files[0]?.path ?? null
    setActivePath(firstPath)
    setRecentPaths(firstPath ? [firstPath] : [])
    setUnsaved(false)
    setRunEntry(resolveEntry(next) ?? null)
    setLogs([])
    setRunState({ kind: 'idle', runId: 0 })
    setTab('code')
    setSettingsOpen(false)
    setSwitcherOpen(false)
    void setValue('lastProject', next.id)
  }, [])

  const openSwitcher = useCallback(() => {
    const current = projectRef.current
    if (current && saveTimer.current) {
      clearTimeout(saveTimer.current)
      saveTimer.current = null
      void saveProject(current)
    }
    setSwitcherOpen(true)
  }, [])

  /* ---------------------------------------------------------------- */
  /* project lifecycle                                                 */
  /* ---------------------------------------------------------------- */

  const createProject = useCallback(
    async (name?: string) => {
      const next = blankProject(name)
      await saveProject(next)
      await refreshProjects()
      enterProject(next)
      notify(`Created ${next.name}`, 'success')
    },
    [enterProject, notify, refreshProjects],
  )

  const renameProject = useCallback(
    async (id: string, next: string) => {
      const name = next.trim()
      if (!name) return
      const current = projectRef.current
      if (current && current.id === id) {
        commit((prev) => ({ ...prev, name }), true)
      } else {
        const found = await loadProject(id)
        if (!found) return
        await saveProject({ ...found, name, updatedAt: Date.now() })
      }
      await refreshProjects()
      notify(`Renamed to ${name}`, 'success')
    },
    [commit, notify, refreshProjects],
  )

  const openProject = useCallback(
    async (id: string) => {
      const found = await loadProject(id)
      if (!found) {
        notify('Project not found', 'error')
        void refreshProjects()
        return
      }
      enterProject(found)
    },
    [enterProject, notify, refreshProjects],
  )

  const removeProject = useCallback(
    async (id: string) => {
      await deleteProjectRecord(id)
      const remaining = await listProjects()
      setProjects(remaining)
      if (projectRef.current?.id === id) {
        const nextMeta = remaining[0]
        const next = nextMeta ? await loadProject(nextMeta.id) : null
        if (next) {
          enterProject(next)
        } else {
          const scratch = blankProject()
          await saveProject(scratch)
          await refreshProjects()
          enterProject(scratch)
        }
      }
      notify('Project deleted')
    },
    [enterProject, notify, refreshProjects],
  )

  const duplicateProject = useCallback(
    async (id: string) => {
      const found = await loadProject(id)
      if (!found) return
      const copy: Project = {
        ...found,
        id: uid('p_'),
        name: `${found.name} copy`,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        files: found.files.map((file) => ({ ...file })),
      }
      await saveProject(copy)
      await refreshProjects()
      notify('Project duplicated', 'success')
    },
    [notify, refreshProjects],
  )

  const importProject = useCallback(
    async (next: Project) => {
      await saveProject(next)
      await refreshProjects()
      notify(`Imported ${next.name}`, 'success')
    },
    [notify, refreshProjects],
  )

  /* ---------------------------------------------------------------- */
  /* file operations                                                   */
  /* ---------------------------------------------------------------- */

  const changeFile = useCallback(
    (path: string, content: string) => {
      commit((prev) => ({
        ...prev,
        files: prev.files.map((file) => (file.path === path ? { ...file, content } : file)),
      }))
    },
    [commit],
  )

  const createFile = useCallback(
    (path: string, content = '', open = true) => {
      const current = projectRef.current
      if (!current) return
      if (current.files.some((file) => file.path === path)) {
        notify('That file already exists', 'error')
        return
      }
      commit(
        (prev) => ({
          ...prev,
          files: [...prev.files, { path, content }].sort((a, b) => a.path.localeCompare(b.path)),
          entry: prev.entry ?? path,
        }),
        true,
      )
      if (open) {
        setActivePath(path)
        setTab('code')
        setRunEntry((prev) => prev ?? path)
      }
      notify(`Created ${path}`, 'success')
    },
    [commit, notify],
  )

  const renameFile = useCallback(
    (oldPath: string, newPath: string, silent = false) => {
      const current = projectRef.current
      if (!current) return
      if (oldPath === newPath) return
      if (current.files.some((file) => file.path === newPath)) {
        notify('A file with that path exists', 'error')
        return
      }
      commit((prev) => ({
        ...prev,
        files: prev.files
          .map((file) => (file.path === oldPath ? { ...file, path: newPath } : file))
          .sort((a, b) => a.path.localeCompare(b.path)),
        entry: prev.entry === oldPath ? newPath : prev.entry,
      }))
      setActivePath((prev) => (prev === oldPath ? newPath : prev))
      setRunEntry((prev) => (prev === oldPath ? newPath : prev))
      if (!silent) notify('File renamed', 'success')
    },
    [commit, notify],
  )

  const deleteFile = useCallback(
    (path: string) => {
      const current = projectRef.current
      if (!current) return
      commit((prev) => {
        const files = prev.files.filter((file) => file.path !== path)
        return {
          ...prev,
          files,
          entry: prev.entry === path ? files[0]?.path : prev.entry,
        }
      })
      if (projectRef.current?.files.length === 0) setActivePath(null)
      setActivePath((prev) => {
        if (prev !== path) return prev
        const remaining = projectRef.current?.files ?? []
        return remaining[0]?.path ?? null
      })
      notify(`Deleted ${path}`)
    },
    [commit, notify],
  )

  const duplicateFile = useCallback(
    (path: string) => {
      const current = projectRef.current
      if (!current) return
      const file = current.files.find((f) => f.path === path)
      if (!file) return
      const dot = path.lastIndexOf('.')
      const copyPath =
        dot > 0 ? `${path.slice(0, dot)}-copy${path.slice(dot)}` : `${path}-copy`
      createFile(copyPath, file.content, true)
    },
    [createFile],
  )

  /* ---------------------------------------------------------------- */
  /* folders                                                           */
  /* ---------------------------------------------------------------- */

  const createFolder = useCallback(
    (raw: string) => {
      const current = projectRef.current
      if (!current) return
      const path = normalizePath(raw)
      if (!path) return
      if (allFolders(current.files, current.folders).includes(path)) {
        notify('That folder already exists', 'error')
        return
      }
      commit(
        (prev) => ({
          ...prev,
          folders: [...new Set([...(prev.folders ?? []), ...ancestorFolders(path), path])].sort((a, b) =>
            a.localeCompare(b),
          ),
        }),
        true,
      )
      notify(`Created ${path}/`, 'success')
    },
    [commit, notify],
  )

  const renameFolder = useCallback(
    (from: string, rawTo: string) => {
      const current = projectRef.current
      if (!current) return
      const to = normalizePath(rawTo)
      if (!to || to === from) return
      if (to.startsWith(`${from}/`)) {
        notify('A folder cannot move inside itself', 'error')
        return
      }
      if (current.files.some((file) => file.path === to)) {
        notify('A file already uses that path', 'error')
        return
      }
      const movedFilesUnder = filesUnder(current.files, from)
      const collisions = movedFilesUnder
        .map((file) => `${to}/${file.path.slice(from.length + 1)}`)
        .filter((path) => current.files.some((file) => file.path === path))
      if (collisions.length > 0) {
        notify(`${collisions[0]} already exists`, 'error')
        return
      }

      const rewrite = (path: string) => `${to}${path.slice(from.length)}`
      // only *declared* folders are stored; implied ones come from file paths
      const declared = current.folders ?? []
      const movedDeclared = foldersUnder(declared, from).map(rewrite)
      const keptDeclared = declared.filter((folder) => !foldersUnder(declared, from).includes(folder))
      const touched = foldersUnder(allFolders(current.files, declared), from)
      const movedFiles = new Set(movedFilesUnder.map((file) => file.path))

      commit((prev) => ({
        ...prev,
        files: prev.files
          .map((file) => (movedFiles.has(file.path) ? { ...file, path: rewrite(file.path) } : file))
          .sort((a, b) => a.path.localeCompare(b.path)),
        folders: [...new Set([...keptDeclared, ...movedDeclared])].sort((a, b) => a.localeCompare(b)),
        entry: prev.entry && prev.entry.startsWith(`${from}/`) ? rewrite(prev.entry) : prev.entry,
      }))
      setActivePath((prev) => (prev && prev.startsWith(`${from}/`) ? rewrite(prev) : prev))
      setRunEntry((prev) => (prev && prev.startsWith(`${from}/`) ? rewrite(prev) : prev))
      notify('Folder renamed', 'success')
    },
    [commit, notify],
  )

  const deleteFolder = useCallback(
    (raw: string) => {
      const current = projectRef.current
      if (!current) return
      const path = normalizePath(raw)
      if (!path) return
      const doomed = filesUnder(current.files, path)
      const declared = current.folders ?? []
      const dropped = foldersUnder(declared, path)
      const removed = new Set(doomed.map((file) => file.path))

      commit((prev) => {
        const files = prev.files.filter((file) => !removed.has(file.path))
        return {
          ...prev,
          files,
          folders: (prev.folders ?? []).filter((folder) => !dropped.includes(folder)),
          entry: prev.entry && removed.has(prev.entry) ? files[0]?.path : prev.entry,
        }
      })
      setActivePath((prev) => {
        if (!prev || !removed.has(prev)) return prev
        const current2 = projectRef.current
        return current2?.files[0]?.path ?? null
      })
      setRunEntry((prev) => (prev && removed.has(prev) ? null : prev))
      notify(`Deleted ${path}/ · ${doomed.length} file${doomed.length === 1 ? '' : 's'}`)
    },
    [commit, notify],
  )

  const duplicateFolder = useCallback(
    (raw: string) => {
      const current = projectRef.current
      if (!current) return
      const path = normalizePath(raw)
      if (!path) return
      const existing = new Set(allFolders(current.files, current.folders))
      let copyPath = `${path}-copy`
      let counter = 2
      while (existing.has(copyPath)) {
        copyPath = `${path}-copy-${counter}`
        counter += 1
        if (counter > 40) return
      }
      const source = filesUnder(current.files, path)
      if (source.length === 0) {
        notify('Nothing to duplicate in that folder', 'error')
        return
      }
      const copies = source.map((file) => ({
        path: `${copyPath}/${file.path.slice(path.length + 1)}`,
        content: file.content,
      }))
      const copiedDeclared = foldersUnder(current.folders ?? [], path).map(
        (folder) => `${copyPath}${folder.slice(path.length)}`,
      )
      commit((prev) => ({
        ...prev,
        files: [...prev.files, ...copies].sort((a, b) => a.path.localeCompare(b.path)),
        folders: [...new Set([...(prev.folders ?? []), ...copiedDeclared, copyPath])].sort((a, b) => a.localeCompare(b)),
      }))
      notify(`Duplicated ${path}/`, 'success')
    },
    [commit, notify],
  )

  const moveFile = useCallback(
    (path: string, rawFolder: string) => {
      const current = projectRef.current
      if (!current) return
      const folder = normalizePath(rawFolder)
      const target = folder ? `${folder}/${fileName(path)}` : fileName(path)
      if (target === path) return
      if (current.files.some((file) => file.path === target)) {
        notify(`${target} already exists`, 'error')
        return
      }
      // keep the destination folder alive even if the file is later removed
      if (folder) {
        commit((prev) => ({
          ...prev,
          folders: [...new Set([...(prev.folders ?? []), ...ancestorFolders(folder)])].sort((a, b) =>
            a.localeCompare(b),
          ),
        }))
      }
      renameFile(path, target, true)
      notify(`Moved ${fileName(path)} to ${folder || 'project root'}`, 'success')
    },
    [commit, notify, renameFile],
  )

  const setEntry = useCallback(
    (path: string) => {
      commit((prev) => ({ ...prev, entry: path }), true)
      setRunEntry(path)
      notify(`Entry set to ${path}`, 'success')
    },
    [commit, notify],
  )

  /* ---------------------------------------------------------------- */
  /* running                                                           */
  /* ---------------------------------------------------------------- */

  const stopRun = useCallback(() => {
    cleanupRef.current?.()
    cleanupRef.current = null
    stopPython()
    setRunState((prev) => ({ ...prev, kind: 'done' }))
  }, [])

  const run = useCallback(
    (overridePath?: string) => {
      const current = projectRef.current
      if (!current) return
      const entry = overridePath ?? runEntry ?? resolveEntry(current)
      if (!entry) {
        notify('Add a file to run', 'error')
        return
      }
      const file = current.files.find((f) => f.path === entry)
      if (!file) {
        notify('Entry file is missing', 'error')
        return
      }
      cleanupRef.current?.()
      cleanupRef.current = null
      stopPython()
      setLogs([])
      setTab('run')
      const runId = runState.runId + 1
      const lang = languageForPath(entry)
      addLog('system', `▶ ${entry} · ${lang.label}`)

      if (lang.runtime === 'web') {
        setRunState({ kind: 'bundling', runId, entry, runtimeLabel: 'Browser', message: 'Bundling…' })
        try {
          const bundle = bundleProject(current, { entry })
          if (!bundle) throw new Error('No runnable entry file found')
          cleanupRef.current = bundle.cleanup
          for (const warning of bundle.warnings) addLog('warn', warning)
          addLog('system', `${bundle.modules.length} module(s) · entry ${bundle.entry}`)
          setRunState({
            kind: 'running',
            runId,
            entry: bundle.entry,
            previewHtml: bundle.html,
            runtimeLabel: (lang.id === 'tsx' || lang.id === 'jsx') ? 'React · esm.sh' : 'Browser preview',
            url: lang.id === 'html' ? bundle.entry : undefined,
          })
        } catch (error) {
          addLog('error', `Build failed: ${(error as Error).message}`)
          setRunState({ kind: 'error', runId, entry, message: (error as Error).message })
        }
        return
      }

      if (lang.runtime === 'python') {
        setRunState({ kind: 'loading-runtime', runId, entry, runtimeLabel: 'Python · Pyodide', message: 'Starting Python…' })
        runPython(current.files, entry, (level, text) => {
          addLog(level, text, 'python')
          if (level === 'success') setRunState((prev) => ({ ...prev, kind: 'done' }))
        })
        setRunState((prev) => ({ ...prev, kind: 'running' }))
        return
      }

      if (lang.runtime === 'cloud') {
        setRunState({ kind: 'running', runId, entry, runtimeLabel: `${lang.label} · cloud sandbox` })
        const controller = new AbortController()
        cleanupRef.current = () => controller.abort()
        void runInCloud({
          endpoint: settings.runnerEndpoint,
          entry,
          project: current,
          stdin,
          onLog: (level, text) => addLog(level, text, 'cloud'),
          signal: controller.signal,
        }).then(() => {
          setRunState((prev) => (prev.kind === 'running' ? { ...prev, kind: 'done' } : prev))
        })
        return
      }

      addLog('error', `${lang.label} files can't be executed yet.`)
      setRunState({ kind: 'error', runId, entry, message: `${lang.label} is not runnable yet` })
    },
    [addLog, notify, runEntry, runState.runId, settings.runnerEndpoint, stdin],
  )

  // Consume messages from the preview iframe.
  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      const data = event.data as
        | { __cody?: boolean; kind?: string; level?: string; text?: string; title?: string }
        | undefined
      if (!data || data.__cody !== true) return
      if (data.kind === 'console' && data.text) {
        const level = data.level === 'error' || data.level === 'warn' || data.level === 'info' ? data.level : 'log'
        addLog(level, data.text, 'preview')
      }
      if (data.kind === 'ready') {
        setRunState((prev) => (prev.kind === 'running' || prev.kind === 'bundling' ? { ...prev, kind: 'running' } : prev))
      }
    }
    window.addEventListener('message', onMessage)
    return () => window.removeEventListener('message', onMessage)
  }, [addLog])

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const meta = event.metaKey || event.ctrlKey
      if (!meta) return
      if (event.key.toLowerCase() === 's') {
        event.preventDefault()
        const current = projectRef.current
        if (current) {
          void saveProject(current).then(() => {
            setSavedAt(Date.now())
            setUnsaved(false)
            notify('Saved', 'success')
          })
        }
      }
      if (event.key.toLowerCase() === 'k') {
        event.preventDefault()
        openSwitcher()
        return
      }
      if (event.key === 'Enter') {
        event.preventDefault()
        run()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [notify, openSwitcher, run])

  useEffect(() => {
    return () => {
      cleanupRef.current?.()
      stopPython()
    }
  }, [])

  // Never lose the last keystrokes when the app is backgrounded or closed.
  useEffect(() => {
    const flush = () => {
      const current = projectRef.current
      if (!current || !saveTimer.current) return
      clearTimeout(saveTimer.current)
      saveTimer.current = null
      void saveProject(current)
    }
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') flush()
    }
    document.addEventListener('visibilitychange', onVisibility)
    window.addEventListener('pagehide', flush)
    return () => {
      document.removeEventListener('visibilitychange', onVisibility)
      window.removeEventListener('pagehide', flush)
    }
  }, [])

  /* ---------------------------------------------------------------- */
  /* editor assists                                                    */
  /* ---------------------------------------------------------------- */

  const editorHandleRef = useRef<import('./editor/CodeEditor').CodyEditorHandle | null>(null)

  const insertSnippet = useCallback((code: string) => {
    setTab('code')
    // The editor mounts after the tab switch — retry until its handle exists.
    let attempts = 0
    const tryInsert = () => {
      const handle = editorHandleRef.current
      if (handle) {
        handle.insert(code)
        handle.focus()
        return
      }
      if (attempts < 25) {
        attempts += 1
        setTimeout(tryInsert, 60)
      }
    }
    setTimeout(tryInsert, 40)
  }, [])

  const trackRecent = useCallback((path: string) => {
    setRecentPaths((prev) => [path, ...prev.filter((item) => item !== path)].slice(0, 6))
  }, [])

  const openFile = useCallback(
    (path: string) => {
      setActivePath(path)
      trackRecent(path)
      setTab('code')
    },
    [trackRecent],
  )

  const closeTab = useCallback(
    (path: string) => {
      setRecentPaths((prev) => prev.filter((item) => item !== path))
      if (path === activePath) {
        const next = recentPaths.find((item) => item !== path) ?? projectRef.current?.files[0]?.path ?? null
        if (next) setActivePath(next)
      }
    },
    [activePath, recentPaths],
  )

  const runFile = useCallback(
    (path: string) => {
      const current = projectRef.current
      if (!current) return
      const entry = findEntryForFile(current, path)
      if (entry) setRunEntry(entry)
      run(entry)
    },
    [run],
  )

  const activeLanguage = useMemo(
    () => (activePath ? languageForPath(activePath) : null),
    [activePath],
  )

  // Auto re-run the preview after edits settle (opt-in).
  const runRef = useRef(run)
  runRef.current = run
  const autoRunTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const updatedAt = project?.updatedAt
  useEffect(() => {
    if (!settings.autoRun || !project) return
    if (runState.kind !== 'running' || !runState.previewHtml) return
    if (autoRunTimer.current) clearTimeout(autoRunTimer.current)
    autoRunTimer.current = setTimeout(() => runRef.current(), 1100)
    return () => {
      if (autoRunTimer.current) clearTimeout(autoRunTimer.current)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [updatedAt, settings.autoRun])

  /* ---------------------------------------------------------------- */
  /* render                                                            */
  /* ---------------------------------------------------------------- */

  if (booting) {
    return (
      <div className="boot">
        <div className="boot-logo">
          <span className="brand-mark">&lt;/&gt;</span>
        </div>
        <p>Starting Cody…</p>
      </div>
    )
  }

  return (
    <div className="app-root">
      {project ? (
        <ProjectView
          project={project}
          settings={settings}
          projects={projects}
          activePath={activePath}
          activeLanguage={activeLanguage?.label ?? null}
          tab={tab}
          setTab={setTab}
          runState={runState}
          runEntry={runEntry}
          logs={logs}
          stdin={stdin}
          setStdin={setStdin}
          savedAt={savedAt}
          unsaved={unsaved}
          recentPaths={recentPaths}
          onCloseTab={closeTab}
          onOpenSwitcher={openSwitcher}
          onOpenFile={openFile}
          onRunFile={runFile}
          onChangeFile={changeFile}
          onCreateFile={createFile}
          onRenameFile={renameFile}
          onDeleteFile={deleteFile}
          onDuplicateFile={duplicateFile}
          onCreateFolder={createFolder}
          onRenameFolder={renameFolder}
          onDeleteFolder={deleteFolder}
          onDuplicateFolder={duplicateFolder}
          onMoveFile={moveFile}
          onSetEntry={setEntry}
          onRun={run}
          onStop={stopRun}
          onClearLogs={() => setLogs([])}
          onSetRunEntry={setRunEntry}
          onInsertSnippet={insertSnippet}
          onRenameProject={(name) => commit((prev) => ({ ...prev, name }), true)}
          onUpdateDescription={(description) => commit((prev) => ({ ...prev, description }), true)}
          onOpenSettings={() => setSettingsOpen(true)}
          onUpdateSettings={updateSettings}
          onNotify={notify}
          onOpenProject={openProject}
          onImportProject={importProject}
          onDeleteProject={removeProject}
          onDuplicateProject={(id) => void duplicateProject(id)}
          editorRef={editorHandleRef}
          onSaveNow={() => {
            const current = projectRef.current
            if (current) {
              void saveProject(current).then(() => {
                setSavedAt(Date.now())
                setUnsaved(false)
                notify('Saved', 'success')
              })
            }
          }}
        />
      ) : (
        <div className="boot">
          <div className="boot-logo">
            <span className="brand-mark">&lt;/&gt;</span>
          </div>
          <p>Opening workspace…</p>
        </div>
      )}

      <ProjectSwitcher
        open={switcherOpen}
        currentId={project?.id ?? null}
        projects={projects}
        settings={settings}
        onClose={() => setSwitcherOpen(false)}
        onCreate={createProject}
        onRename={renameProject}
        onOpen={openProject}
        onDelete={removeProject}
        onDuplicate={duplicateProject}
        onImport={importProject}
        onOpenSettings={() => {
          setSwitcherOpen(false)
          setSettingsOpen(true)
        }}
        onNotify={notify}
        onToggleTheme={() =>
          updateSettings({ theme: settings.theme === 'dark' ? 'light' : 'dark' })
        }
      />

      <SettingsSheet
        open={settingsOpen}
        settings={settings}
        onChange={updateSettings}
        onClose={() => setSettingsOpen(false)}
        onNotify={notify}
        projects={projects}
      />

      <Toasts toasts={toasts} />
    </div>
  )
}
