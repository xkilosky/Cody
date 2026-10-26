import { useEffect, useMemo, useRef, useState } from 'react'
import type { Project, ProjectMeta, Settings } from '../types'
import { TEMPLATES, type Template } from '../lib/templates'
import { languageForPath } from '../lib/languages'
import { relativeTime, uid } from '../lib/utils'
import { filesFromFileList, projectFromJson } from '../lib/importExport'
import Icon from './Icons'
import Sheet, { PromptSheet } from './Sheet'

type Props = {
  open: boolean
  currentId: string | null
  projects: ProjectMeta[]
  settings: Settings
  onClose: () => void
  onCreate: (template: Template, name?: string) => void
  onOpen: (id: string) => void
  onDelete: (id: string) => void
  onDuplicate: (id: string) => void
  onImport: (project: Project) => Promise<void>
  onOpenSettings: () => void
  onNotify: (message: string, tone?: 'info' | 'success' | 'error') => void
  onToggleTheme: () => void
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
  onDelete,
  onDuplicate,
  onImport,
  onOpenSettings,
  onNotify,
  onToggleTheme,
}: Props) {
  const [view, setView] = useState<'open' | 'new'>('open')
  const [pendingTemplate, setPendingTemplate] = useState<Template | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<ProjectMeta | null>(null)
  const [actionId, setActionId] = useState<string | null>(null)
  const jsonInput = useRef<HTMLInputElement | null>(null)
  const filesInput = useRef<HTMLInputElement | null>(null)

  // Always reopen on the workspace list, even if the last visit ended on "New".
  useEffect(() => {
    if (open) setView('open')
  }, [open])

  const actionMeta = useMemo(
    () => projects.find((project) => project.id === actionId) ?? null,
    [projects, actionId],
  )

  const importAsProject = async (files: Awaited<ReturnType<typeof filesFromFileList>>, name: string) => {
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
      name,
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
        <div className="segmented full">
          <button className={view === 'open' ? 'active' : ''} onClick={() => setView('open')}>
            <Icon name="files" size={15} /> Open
          </button>
          <button className={view === 'new' ? 'active' : ''} onClick={() => setView('new')}>
            <Icon name="plus" size={15} /> New
          </button>
        </div>

        {view === 'open' ? (
          <>
            {projects.length === 0 ? (
              <div className="empty-state">
                <Icon name="files" size={24} />
                <h3>No workspaces yet</h3>
                <p>Start one from a template.</p>
                <button className="btn primary" onClick={() => setView('new')}>
                  <Icon name="plus" size={16} /> New project
                </button>
              </div>
            ) : (
              <ul className="switcher-list">
                {projects.map((project) => {
                  const template = TEMPLATES.find((item) => item.id === project.templateId)
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
                        <span className="switcher-emoji">{template?.emoji ?? '📁'}</span>
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
                <span>Import files as a project</span>
              </button>
              <button className="action-item" onClick={() => jsonInput.current?.click()}>
                <Icon name="upload" size={18} />
                <span>Import a .cody.json project</span>
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
          </>
        ) : (
          <>
            <p className="section-note padded">
              Pick a starting point — you can add any file or language later.
            </p>
            <div className="template-list">
              {TEMPLATES.map((template) => (
                <button
                  key={template.id}
                  className="template-row"
                  style={{ ['--accent' as string]: template.accent }}
                  onClick={() => setPendingTemplate(template)}
                >
                  <span className="template-emoji">{template.emoji}</span>
                  <span className="grow">
                    <strong>{template.name}</strong>
                    <span className="template-tagline">{template.tagline}</span>
                  </span>
                  <Icon name="chevron-right" size={16} />
                </button>
              ))}
            </div>
          </>
        )}
      </Sheet>

      <PromptSheet
        open={Boolean(pendingTemplate)}
        title={pendingTemplate ? `New ${pendingTemplate.name} project` : 'New project'}
        subtitle={pendingTemplate?.tagline}
        label="Project name"
        initialValue={pendingTemplate?.name ?? ''}
        confirmLabel="Create"
        onClose={() => setPendingTemplate(null)}
        onSubmit={(value) => {
          if (!pendingTemplate) return
          onCreate(pendingTemplate, value)
          setPendingTemplate(null)
          onClose()
        }}
      >
        {pendingTemplate && (
          <div className="file-preview-list">
            {pendingTemplate.files.map((file) => {
              const lang = languageForPath(file.path)
              return (
                <div key={file.path} className="file-preview-row">
                  <span className="lang-dot" style={{ background: lang.color }} />
                  <span className="grow">{file.path}</span>
                </div>
              )
            })}
          </div>
        )}
      </PromptSheet>

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
            const name = (first.webkitRelativePath || '').split('/')[0] || first.name.replace(/\.[^.]+$/, '')
            await importAsProject(files, name || 'Imported project')
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
