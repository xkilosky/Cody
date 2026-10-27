import { useEffect, useMemo, useRef, useState } from 'react'
import type { Project, ProjectMeta, Settings } from '../types'
import { STARTER_FILES } from '../lib/starter'
import { languageForPath } from '../lib/languages'
import { relativeTime, uid } from '../lib/utils'
import { filesFromFileList, projectFromJson } from '../lib/importExport'
import Icon from './Icons'
import LangIcon from './LangIcon'
import Sheet, { PromptSheet } from './Sheet'

type Props = {
  open: boolean
  currentId: string | null
  projects: ProjectMeta[]
  settings: Settings
  onClose: () => void
  /** A new workspace needs nothing but a name. */
  onCreate: (name: string) => void
  onOpen: (id: string) => void
  onRename: (id: string, name: string) => void
  onDelete: (id: string) => void
  onDuplicate: (id: string) => void
  onImport: (project: Project) => Promise<void>
  onOpenSettings: () => void
  onNotify: (message: string, tone?: 'info' | 'success' | 'error') => void
  onToggleTheme: () => void
}

/** First letter of the workspace, drawn as a quiet square. No template emoji,
 *  no invented iconography — the name is the identity. */
function markOf(name: string): string {
  const letter = name.trim().replace(/[^\p{L}\p{N}]/u, '').charAt(0)
  return letter ? letter.toUpperCase() : '·'
}

/**
 * Workspace switcher — the editor's home base. Everything a "landing page" used to
 * do lives here, one tap away from the code, never in front of it.
 */
export default function ProjectSwitcher({
  open,
  currentId,
  projects,
  settings,
  onClose,
  onCreate,
  onOpen,
  onRename,
  onDelete,
  onDuplicate,
  onImport,
  onOpenSettings,
  onNotify,
  onToggleTheme,
}: Props) {
  const [creating, setCreating] = useState(false)
  const [name, setName] = useState('')
  const [actionId, setActionId] = useState<string | null>(null)
  const [renaming, setRenaming] = useState<ProjectMeta | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<ProjectMeta | null>(null)
  const jsonInput = useRef<HTMLInputElement | null>(null)
  const filesInput = useRef<HTMLInputElement | null>(null)

  // Always reopen on the workspace list, never half-way through creating one.
  useEffect(() => {
    if (open) {
      setCreating(false)
      setName('')
    }
  }, [open])

  const actionMeta = useMemo(
    () => projects.find((project) => project.id === actionId) ?? null,
    [projects, actionId],
  )

  const startCreating = () => {
    setName('')
    setCreating(true)
  }

  const submit = () => {
    onCreate(name.trim())
    setName('')
    setCreating(false)
    onClose()
  }

  const importAsProject = async (files: Awaited<ReturnType<typeof filesFromFileList>>, label: string) => {
    if (files.length === 0) {
      onNotify('No readable text files found', 'error')
      return
    }
    const now = Date.now()
    const entry =
      files.find((file) => file.path === 'index.html')?.path ??
      files.find((file) => /\.(tsx|ts|jsx|js|py)$/.test(file.path))?.path ??
      files[0].path
    await onImport({
      id: uid('p_'),
      name: label,
      description: `Imported ${files.length} file${files.length === 1 ? '' : 's'}`,
      files,
      entry,
      createdAt: now,
      updatedAt: now,
    })
  }

  return (
    <>
      <Sheet
        open={open}
        title="Workspaces"
        subtitle={projects.length === 0 ? 'Nothing open yet' : `${projects.length} on this device`}
        onClose={onClose}
        size="tall"
      >
        <button className="btn primary block new-workspace" onClick={startCreating}>
          <Icon name="plus" size={16} /> New workspace
        </button>

        {projects.length === 0 ? (
          <div className="empty-state">
            <Icon name="files" size={24} />
            <h3>No workspaces yet</h3>
            <p>Start a plain one — three files, no template, ready to run.</p>
          </div>
        ) : (
          <ul className="switcher-list">
            {projects.map((project) => {
              const current = project.id === currentId
              return (
                <li key={project.id} className={`switcher-row${current ? ' current' : ''}`}>
                  <button
                    className="switcher-main"
                    onClick={() => {
                      onOpen(project.id)
                      onClose()
                    }}
                  >
                    <span className="switcher-mark" aria-hidden="true">
                      {markOf(project.name)}
                    </span>
                    <span className="switcher-text">
                      <strong>
                        {project.name}
                        {current && <span className="pill tiny current-pill">open</span>}
                      </strong>
                      <span className="project-meta">
                        {project.fileCount} file{project.fileCount === 1 ? '' : 's'} · edited{' '}
                        {relativeTime(project.updatedAt)}
                      </span>
                    </span>
                  </button>
                  <button
                    className="icon-btn"
                    aria-label={`Actions for ${project.name}`}
                    onClick={() => setActionId(project.id)}
                  >
                    <Icon name="more" size={18} />
                  </button>
                </li>
              )
            })}
          </ul>
        )}

        <div className="switcher-tools">
          <button className="action-item" onClick={() => filesInput.current?.click()}>
            <Icon name="upload" size={18} />
            <span>Import files as a workspace</span>
          </button>
          <button className="action-item" onClick={() => jsonInput.current?.click()}>
            <Icon name="upload" size={18} />
            <span>Import a .cody.json workspace</span>
          </button>
          <button className="action-item" onClick={onOpenSettings}>
            <Icon name="settings" size={18} />
            <span>Settings</span>
          </button>
          <button className="action-item" onClick={onToggleTheme}>
            <Icon name={settings.theme === 'dark' ? 'sun' : 'moon'} size={18} />
            <span>{settings.theme === 'dark' ? 'Light theme' : 'Dark theme'}</span>
          </button>
        </div>
      </Sheet>

      {/* ---- new workspace ---------------------------------------------- */}
      <Sheet
        open={creating}
        title="New workspace"
        subtitle="No template — just a name"
        onClose={() => setCreating(false)}
      >
        <form
          className="create-form"
          onSubmit={(event) => {
            event.preventDefault()
            submit()
          }}
        >
          <label className="field-label" htmlFor="workspace-name">
            Name
          </label>
          <input
            id="workspace-name"
            className="text-input"
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="Untitled"
            autoFocus
            autoCapitalize="off"
            autoCorrect="off"
            spellCheck={false}
            enterKeyHint="done"
          />

          <p className="section-note">
            It opens with three plain files. No framework, no dependencies — delete them, rename them, or add your
            own.
          </p>

          <div className="starter-list">
            {STARTER_FILES.map((path) => (
              <div key={path} className="starter-row">
                <LangIcon lang={languageForPath(path)} size={15} />
                <span className="grow">{path}</span>
              </div>
            ))}
          </div>

          <button className="btn primary block" type="submit">
            <Icon name="plus" size={16} /> Create workspace
          </button>
        </form>
      </Sheet>

      {/* ---- workspace actions ------------------------------------------ */}
      <Sheet
        open={Boolean(actionMeta)}
        title={actionMeta?.name ?? ''}
        subtitle="Workspace actions"
        onClose={() => setActionId(null)}
      >
        {actionMeta && (
          <div className="action-list">
            <button
              className="action-item"
              onClick={() => {
                onOpen(actionMeta.id)
                setActionId(null)
                onClose()
              }}
            >
              <Icon name="code" size={18} />
              <span>Open in editor</span>
            </button>
            <button
              className="action-item"
              onClick={() => {
                setRenaming(actionMeta)
                setActionId(null)
              }}
            >
              <Icon name="pencil" size={18} />
              <span>Rename</span>
            </button>
            <button
              className="action-item"
              onClick={() => {
                onDuplicate(actionMeta.id)
                setActionId(null)
              }}
            >
              <Icon name="copy" size={18} />
              <span>Duplicate</span>
            </button>
            <button
              className="action-item danger"
              onClick={() => {
                setDeleteTarget(actionMeta)
                setActionId(null)
              }}
            >
              <Icon name="trash" size={18} />
              <span>Delete workspace</span>
            </button>
          </div>
        )}
      </Sheet>

      <PromptSheet
        open={Boolean(renaming)}
        title={renaming ? `Rename ${renaming.name}` : 'Rename workspace'}
        subtitle="Only the name changes — every file stays where it is."
        label="Workspace name"
        initialValue={renaming?.name ?? ''}
        confirmLabel="Rename"
        onClose={() => setRenaming(null)}
        onSubmit={(value) => {
          if (renaming && value.trim()) onRename(renaming.id, value.trim())
          setRenaming(null)
        }}
      />

      <Sheet
        open={Boolean(deleteTarget)}
        title="Delete workspace?"
        subtitle={deleteTarget?.name}
        onClose={() => setDeleteTarget(null)}
        footer={
          <div className="row-gap">
            <button className="btn ghost block" onClick={() => setDeleteTarget(null)}>
              Cancel
            </button>
            <button
              className="btn danger block"
              onClick={() => {
                if (deleteTarget) onDelete(deleteTarget.id)
                setDeleteTarget(null)
              }}
            >
              Delete
            </button>
          </div>
        }
      >
        <p className="muted">Its files are removed from this device. Export a backup first if needed.</p>
      </Sheet>

      <input
        ref={filesInput}
        type="file"
        multiple
        hidden
        onChange={async (event) => {
          const list = event.target.files
          if (list && list.length > 0) {
            const files = await filesFromFileList(list)
            const first = list[0] as File & { webkitRelativePath?: string }
            const label = (first.webkitRelativePath || '').split('/')[0] || first.name.replace(/\.[^.]+$/, '')
            await importAsProject(files, label || 'Imported workspace')
            onClose()
          }
          event.target.value = ''
        }}
      />
      <input
        ref={jsonInput}
        type="file"
        accept=".json,application/json"
        hidden
        onChange={async (event) => {
          const file = event.target.files?.[0]
          if (file) {
            const project = projectFromJson(await file.text(), file.name.replace(/\.json$/i, ''))
            if (project) {
              await onImport(project)
              onClose()
            } else onNotify('That file is not a Cody project', 'error')
          }
          event.target.value = ''
        }}
      />
    </>
  )
}
