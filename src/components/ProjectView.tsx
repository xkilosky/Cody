import { useRef, useState, type MutableRefObject } from 'react'
import type { AppTab, LogEntry, Project, ProjectMeta, RunState, Settings } from '../types'
import type { CodyEditorHandle } from '../editor/CodeEditor'
import { languageForPath } from '../lib/languages'
import { downloadBlob, downloadText, relativeTime } from '../lib/utils'
import {
  filesFromFileList,
  projectFromJson,
  projectToJson,
  projectZipBlob,
  shareProject,
} from '../lib/importExport'
import CodePane from './CodePane'
import CodyPanel from './CodyPanel'
import FilesPane from './FilesPane'
import Icon from './Icons'
import RunPanel from './RunPanel'
import Sheet, { PromptSheet } from './Sheet'

type Props = {
  project: Project
  settings: Settings
  projects: ProjectMeta[]
  activePath: string | null
  activeLanguage: string | null
  tab: AppTab
  setTab: (tab: AppTab) => void
  runState: RunState
  runEntry: string | null
  logs: LogEntry[]
  stdin: string
  setStdin: (value: string) => void
  savedAt: number | null
  unsaved: boolean
  recentPaths: string[]
  onCloseTab: (path: string) => void
  onOpenSwitcher: () => void
  onOpenFile: (path: string) => void
  onRunFile: (path: string) => void
  onChangeFile: (path: string, content: string) => void
  onCreateFile: (path: string, content?: string) => void
  onRenameFile: (from: string, to: string) => void
  onDeleteFile: (path: string) => void
  onDuplicateFile: (path: string) => void
  onSetEntry: (path: string) => void
  onRun: (path?: string) => void
  onStop: () => void
  onClearLogs: () => void
  onSetRunEntry: (path: string) => void
  onInsertSnippet: (code: string) => void
  onRenameProject: (name: string) => void
  onUpdateDescription: (description: string) => void
  onOpenSettings: () => void
  onNotify: (message: string, tone?: 'info' | 'success' | 'error') => void
  onOpenProject: (id: string) => void
  onImportProject: (project: Project) => void
  onDeleteProject: (id: string) => void
  editorRef: MutableRefObject<CodyEditorHandle | null>
  onSaveNow: () => void
  onUpdateSettings?: (patch: Partial<Settings>) => void
}

const TABS: Array<{ id: AppTab; label: string; icon: 'files' | 'code' | 'terminal' | 'sparkles' }> = [
  { id: 'files', label: 'Files', icon: 'files' },
  { id: 'code', label: 'Code', icon: 'code' },
  { id: 'run', label: 'Run', icon: 'terminal' },
  { id: 'cody', label: 'Build', icon: 'sparkles' },
]

export default function ProjectView(props: Props) {
  const {
    project,
    settings,
    activePath,
    activeLanguage,
    tab,
    setTab,
    runState,
    runEntry,
    logs,
    stdin,
    setStdin,
    savedAt,
    unsaved,
    recentPaths,
    onCloseTab,
    onOpenSwitcher,
    onOpenFile,
    onRunFile,
    onChangeFile,
    onCreateFile,
    onRenameFile,
    onDeleteFile,
    onDuplicateFile,
    onSetEntry,
    onRun,
    onStop,
    onClearLogs,
    onSetRunEntry,
    onInsertSnippet,
    onRenameProject,
    onUpdateDescription,
    onOpenSettings,
    onNotify,
    onImportProject,
    onDeleteProject,
    editorRef,
    onSaveNow,
    onUpdateSettings,
  } = props

  const [menuOpen, setMenuOpen] = useState(false)
  const [renameOpen, setRenameOpen] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [aboutOpen, setAboutOpen] = useState(false)
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const jsonInputRef = useRef<HTMLInputElement | null>(null)

  const running =
    runState.kind === 'running' || runState.kind === 'bundling' || runState.kind === 'loading-runtime'

  const handleFiles = async (list: FileList | null) => {
    if (!list || list.length === 0) return
    const files = await filesFromFileList(list)
    if (files.length === 0) {
      onNotify('No text files found in that selection', 'error')
      return
    }
    let added = 0
    for (const file of files) {
      if (project.files.some((existing) => existing.path === file.path)) continue
      onCreateFile(file.path, file.content)
      added += 1
    }
    onNotify(added > 0 ? `Imported ${added} file${added === 1 ? '' : 's'}` : 'Those files already exist', added > 0 ? 'success' : 'error')
    setMenuOpen(false)
  }

  const handleJson = async (list: FileList | null) => {
    const file = list?.[0]
    if (!file) return
    const next = projectFromJson(await file.text(), file.name.replace(/\.json$/i, ''))
    if (!next) {
      onNotify('That file is not a Cody project', 'error')
      return
    }
    onImportProject(next)
    setMenuOpen(false)
  }

  return (
    <div className="project-shell">
      <header className="app-header">
        <button
          className="icon-btn"
          onClick={onOpenSwitcher}
          aria-label="Switch workspace"
          title="Workspaces (⌘K)"
        >
          <Icon name="chevron-left" size={22} />
        </button>
        <button className="title-block" onClick={() => setRenameOpen(true)}>
          <h1>{project.name}</h1>
          <p>
            {project.files.length} file{project.files.length === 1 ? '' : 's'}
            {activeLanguage ? ` · ${activeLanguage}` : ''}
            {savedAt ? ` · ${relativeTime(savedAt)}` : ''}
          </p>
        </button>
        <button
          className={`icon-btn${running ? ' accent' : ''}`}
          onClick={() => (running ? onStop() : onRun())}
          aria-label={running ? 'Stop' : 'Run project'}
        >
          <Icon name={running ? 'stop' : 'play'} size={18} filled />
        </button>
        <button className="icon-btn" onClick={() => setMenuOpen(true)} aria-label="Project menu">
          <Icon name="more" size={20} />
        </button>
      </header>

      <main className={`tab-stage tab-${tab}`}>
        {tab === 'files' && (
          <FilesPane
            project={project}
            activePath={activePath}
            runEntry={runEntry ?? project.entry ?? null}
            onOpenFile={onOpenFile}
            onRunFile={onRunFile}
            onCreateFile={onCreateFile}
            onRenameFile={onRenameFile}
            onDeleteFile={onDeleteFile}
            onDuplicateFile={onDuplicateFile}
            onSetEntry={onSetEntry}
            onNotify={onNotify}
          />
        )}

        {tab === 'code' && (
          <CodePane
            project={project}
            settings={settings}
            activePath={activePath}
            runEntry={runEntry ?? project.entry ?? null}
            savedAt={savedAt}
            unsaved={unsaved}
            recentPaths={recentPaths}
            onCloseTab={onCloseTab}
            editorRef={editorRef}
            onChangeFile={onChangeFile}
            onOpenFile={onOpenFile}
            onRun={() => onRun()}
            onRunFile={onRunFile}
            onSaveNow={onSaveNow}
            onUpdateSettings={(patch) => onUpdateSettings?.(patch)}
            onNotify={onNotify}
          />
        )}

        {tab === 'run' && (
          <RunPanel
            project={project}
            runState={runState}
            runEntry={runEntry}
            logs={logs}
            stdin={stdin}
            settings={settings}
            savedAt={savedAt}
            onSetStdin={setStdin}
            onSetRunEntry={onSetRunEntry}
            onRun={onRun}
            onStop={onStop}
            onClearLogs={onClearLogs}
            onOpenFile={onOpenFile}
            onNotify={onNotify}
          />
        )}

        {tab === 'cody' && (
          <CodyPanel
            project={project}
            activePath={activePath}
            onInsertSnippet={onInsertSnippet}
            onCreateFile={onCreateFile}
            onOpenFile={onOpenFile}
            onNotify={onNotify}
          />
        )}
      </main>

      <nav className="tab-bar" role="tablist" aria-label="Project sections">
        {TABS.map((item) => (
          <button
            key={item.id}
            role="tab"
            aria-selected={tab === item.id}
            className={`tab-btn${tab === item.id ? ' active' : ''}`}
            onClick={() => setTab(item.id)}
          >
            <span className="tab-icon">
              <Icon name={item.icon} size={20} filled={tab === item.id && item.id === 'run' ? false : false} />
              {item.id === 'run' && running && <span className="tab-dot" />}
            </span>
            <span>{item.label}</span>
          </button>
        ))}
      </nav>

      <Sheet open={menuOpen} title={project.name} subtitle="Project actions" onClose={() => setMenuOpen(false)}>
        <div className="action-list">
          <button
            className="action-item"
            onClick={() => {
              onOpenSwitcher()
              setMenuOpen(false)
            }}
          >
            <Icon name="files" size={18} />
            <span>Switch workspace…</span>
          </button>
          <button
            className="action-item"
            onClick={() => {
              setRenameOpen(true)
              setMenuOpen(false)
            }}
          >
            <Icon name="pencil" size={18} />
            <span>Rename project</span>
          </button>
          <button
            className="action-item"
            onClick={() => {
              setAboutOpen(true)
              setMenuOpen(false)
            }}
          >
            <Icon name="info" size={18} />
            <span>Details & entry file</span>
          </button>
          <button
            className="action-item"
            onClick={() => fileInputRef.current?.click()}
          >
            <Icon name="upload" size={18} />
            <span>Import files into project</span>
          </button>
          <button
            className="action-item"
            onClick={() => jsonInputRef.current?.click()}
          >
            <Icon name="upload" size={18} />
            <span>Import Cody project (.json)</span>
          </button>
          <button
            className="action-item"
            onClick={() => {
              const blob = projectZipBlob(project)
              downloadBlob(`${project.name.replace(/[^a-z0-9-_ ]/gi, '').trim() || 'cody-project'}.zip`, blob)
              onNotify('ZIP exported', 'success')
              setMenuOpen(false)
            }}
          >
            <Icon name="download" size={18} />
            <span>Export ZIP</span>
          </button>
          <button
            className="action-item"
            onClick={() => {
              downloadText(
                `${project.name.replace(/[^a-z0-9-_ ]/gi, '').trim() || 'cody-project'}.cody.json`,
                projectToJson(project),
                'application/json',
              )
              onNotify('Project JSON exported', 'success')
              setMenuOpen(false)
            }}
          >
            <Icon name="save" size={18} />
            <span>Export project JSON</span>
          </button>
          <button
            className="action-item"
            onClick={async () => {
              const shared = await shareProject(project)
              if (!shared) {
                downloadBlob(
                  `${project.name.replace(/[^a-z0-9-_ ]/gi, '').trim() || 'cody-project'}.zip`,
                  projectZipBlob(project),
                )
              }
              notifyShare(shared)
              setMenuOpen(false)
            }}
          >
            <Icon name="share" size={18} />
            <span>Share ZIP…</span>
          </button>
          <button
            className="action-item"
            onClick={() => {
              onOpenSettings()
              setMenuOpen(false)
            }}
          >
            <Icon name="settings" size={18} />
            <span>App settings</span>
          </button>
          <button
            className="action-item danger"
            onClick={() => {
              setDeleteOpen(true)
              setMenuOpen(false)
            }}
          >
            <Icon name="trash" size={18} />
            <span>Delete project</span>
          </button>
        </div>
      </Sheet>

      <PromptSheet
        open={renameOpen}
        title="Rename project"
        label="Project name"
        initialValue={project.name}
        confirmLabel="Rename"
        onClose={() => setRenameOpen(false)}
        onSubmit={(value) => {
          onRenameProject(value)
          onNotify('Project renamed', 'success')
        }}
      />

      <Sheet
        open={aboutOpen}
        title="Project details"
        subtitle="Workspace metadata"
        onClose={() => setAboutOpen(false)}
      >
        <div className="detail-grid">
          <div>
            <span>Entry file</span>
            <strong>{project.entry ?? 'not set'}</strong>
          </div>
          <div>
            <span>Files</span>
            <strong>{project.files.length}</strong>
          </div>
          <div>
            <span>Created</span>
            <strong>{new Date(project.createdAt).toLocaleDateString()}</strong>
          </div>
          <div>
            <span>Updated</span>
            <strong>{relativeTime(project.updatedAt)}</strong>
          </div>
        </div>
        <label className="field-label">Description</label>
        <textarea
          className="text-input"
          rows={2}
          value={project.description ?? ''}
          placeholder="What are you building?"
          onChange={(event) => onUpdateDescription(event.target.value)}
        />
        <label className="field-label">Entry file</label>
        <div className="action-list compact">
          {project.files.map((file) => (
            <button
              key={file.path}
              className={`action-item${project.entry === file.path ? ' selected' : ''}`}
              onClick={() => {
                onSetEntry(file.path)
                onSetRunEntry(file.path)
              }}
            >
              <span className="lang-dot" style={{ background: languageForPath(file.path).color }} />
              <span className="grow">{file.path}</span>
              {project.entry === file.path && <Icon name="check" size={16} />}
            </button>
          ))}
        </div>
      </Sheet>

      <Sheet
        open={deleteOpen}
        title="Delete project?"
        subtitle={project.name}
        onClose={() => setDeleteOpen(false)}
        footer={
          <div className="row-gap">
            <button className="btn ghost block" onClick={() => setDeleteOpen(false)}>
              Cancel
            </button>
            <button
              className="btn danger block"
              onClick={() => {
                setDeleteOpen(false)
                onDeleteProject(project.id)
              }}
            >
              Delete forever
            </button>
          </div>
        }
      >
        <p className="muted">
          This removes {project.files.length} file{project.files.length === 1 ? '' : 's'} from this device.
          Export a ZIP first if you want a backup.
        </p>
      </Sheet>

      <input
        ref={fileInputRef}
        type="file"
        multiple
        hidden
        onChange={(event) => {
          void handleFiles(event.target.files)
          event.target.value = ''
        }}
      />
      <input
        ref={jsonInputRef}
        type="file"
        accept=".json,application/json"
        hidden
        onChange={(event) => {
          void handleJson(event.target.files)
          event.target.value = ''
        }}
      />
    </div>
  )

  function notifyShare(shared: boolean) {
    if (shared) onNotify('Shared', 'success')
    else onNotify('Sharing unavailable — ZIP downloaded instead', 'info')
  }
}
