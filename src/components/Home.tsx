import { useRef, useState } from 'react'
import type { Project, ProjectMeta, Settings } from '../types'
import { TEMPLATES, type Template } from '../lib/templates'
import { LANGUAGES, languageForPath } from '../lib/languages'
import { downloadBlob, formatBytes, normalizePath, relativeTime, uid } from '../lib/utils'
import { filesFromFileList, projectFromJson, projectToJson, projectZipBlob } from '../lib/importExport'
import { loadProject } from '../lib/storage'
import Icon from './Icons'
import Sheet, { PromptSheet } from './Sheet'

type Props = {
  projects: ProjectMeta[]
  settings: Settings
  onCreate: (template: Template, name?: string) => void
  onOpen: (id: string) => void
  onDelete: (id: string) => void
  onDuplicate: (id: string) => void
  onImport: (project: Project) => Promise<void>
  onOpenSettings: () => void
  onNotify: (message: string, tone?: 'info' | 'success' | 'error') => void
  onToggleTheme: () => void
}

export default function Home({
  projects,
  settings,
  onCreate,
  onOpen,
  onDelete,
  onDuplicate,
  onImport,
  onOpenSettings,
  onNotify,
  onToggleTheme,
}: Props) {
  const [pickerOpen, setPickerOpen] = useState(false)
  const [selected, setSelected] = useState<Template | null>(null)
  const [actionId, setActionId] = useState<string | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<ProjectMeta | null>(null)
  const filesInput = useRef<HTMLInputElement | null>(null)
  const jsonInput = useRef<HTMLInputElement | null>(null)

  const activeMeta = projects.find((project) => project.id === actionId) ?? null

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
    const project: Project = {
      id: uid('p_'),
      name,
      description: `Imported ${files.length} file${files.length === 1 ? '' : 's'}`,
      files,
      entry,
      createdAt: now,
      updatedAt: now,
    }
    await onImport(project)
  }

  return (
    <div className="home">
      <header className="home-header">
        <div className="brand">
          <span className="brand-mark" aria-hidden="true">
            <Icon name="logo" size={20} />
          </span>
          <div>
            <h1>Cody</h1>
            <p>Mobile project editor</p>
          </div>
        </div>
        <div className="row-gap">
          <button
            className="icon-btn"
            onClick={onToggleTheme}
            aria-label={settings.theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
          >
            <Icon name={settings.theme === 'dark' ? 'sun' : 'moon'} size={19} />
          </button>
          <button className="icon-btn" onClick={onOpenSettings} aria-label="Settings">
            <Icon name="settings" size={19} />
          </button>
        </div>
      </header>

      <section className="hero">
        <h2>
          Build entire projects
          <br />
          <span className="grad-text">from your phone.</span>
        </h2>
        <p>
          Multi-language editor, live preview, Python in the browser and a cloud sandbox for
          compiled languages. Everything autosaves on this device.
        </p>
        <div className="hero-actions">
          <button className="btn primary big" onClick={() => setPickerOpen(true)}>
            <Icon name="plus" size={18} /> New project
          </button>
          <button className="btn ghost big" onClick={() => filesInput.current?.click()}>
            <Icon name="upload" size={17} /> Import
          </button>
        </div>
        <div className="hero-badges">
          <span className="pill tiny">{LANGUAGES.length} languages</span>
          <span className="pill tiny">Python · Pyodide</span>
          <span className="pill tiny">Offline ready</span>
        </div>
      </section>

      <section className="section">
        <div className="section-head">
          <h3>Start from a template</h3>
          <button className="linkish" onClick={() => setPickerOpen(true)}>
            See all
          </button>
        </div>
        <div className="template-grid">
          {TEMPLATES.slice(0, 6).map((template) => (
            <button
              key={template.id}
              className="template-card"
              onClick={() => setSelected(template)}
              style={{ ['--accent' as string]: template.accent }}
            >
              <span className="template-emoji">{template.emoji}</span>
              <strong>{template.name}</strong>
              <span className="template-tagline">{template.tagline}</span>
              <span className="template-tags">
                {template.tags.map((tag) => (
                  <span key={tag} className="pill tiny">
                    {tag}
                  </span>
                ))}
              </span>
            </button>
          ))}
        </div>
      </section>

      <section className="section">
        <div className="section-head">
          <h3>Your projects</h3>
          <span className="muted small">{projects.length}</span>
        </div>
        {projects.length === 0 ? (
          <div className="empty-state cardish">
            <Icon name="files" size={26} />
            <h3>No projects yet</h3>
            <p>Pick a template above or import files to get going.</p>
            <button className="btn primary" onClick={() => setPickerOpen(true)}>
              <Icon name="plus" size={16} /> Create project
            </button>
          </div>
        ) : (
          <ul className="project-list">
            {projects.map((project) => {
              const template = TEMPLATES.find((item) => item.id === project.templateId)
              return (
                <li key={project.id} className="project-card">
                  <button className="project-main" onClick={() => onOpen(project.id)}>
                    <span className="project-emoji">{template?.emoji ?? '📁'}</span>
                    <span className="project-text">
                      <strong>{project.name}</strong>
                      <span className="project-meta">
                        {project.fileCount} file{project.fileCount === 1 ? '' : 's'} · edited{' '}
                        {relativeTime(project.updatedAt)}
                      </span>
                      {project.description && <span className="project-desc">{project.description}</span>}
                    </span>
                    <Icon name="chevron-right" size={18} />
                  </button>
                  <button
                    className="icon-btn"
                    onClick={() => setActionId(project.id)}
                    aria-label={`Actions for ${project.name}`}
                  >
                    <Icon name="more" size={18} />
                  </button>
                </li>
              )
            })}
          </ul>
        )}
      </section>

      <section className="section">
        <div className="section-head">
          <h3>Data</h3>
        </div>
        <div className="data-card">
          <p>
            Projects live in this browser (IndexedDB). Export a ZIP or a project file to move them
            between devices.
          </p>
          <div className="row-gap wrap">
            <button className="btn small ghost" onClick={() => filesInput.current?.click()}>
              <Icon name="upload" size={15} /> Import files
            </button>
            <button className="btn small ghost" onClick={() => jsonInput.current?.click()}>
              <Icon name="upload" size={15} /> Import project
            </button>
            <button className="btn small ghost" onClick={onOpenSettings}>
              <Icon name="settings" size={15} /> Storage
            </button>
          </div>
        </div>
      </section>

      <footer className="home-footer">
        <span>Cody · built for small screens and big ideas</span>
        <span className="muted small">v1.0</span>
      </footer>

      {/* Template gallery */}
      <Sheet
        open={pickerOpen}
        title="New project"
        subtitle="Pick a starting point — you can add any file later."
        onClose={() => setPickerOpen(false)}
        size="tall"
      >
        <div className="template-list">
          {TEMPLATES.map((template) => (
            <button
              key={template.id}
              className="template-row"
              onClick={() => {
                setSelected(template)
                setPickerOpen(false)
              }}
              style={{ ['--accent' as string]: template.accent }}
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
      </Sheet>

      <PromptSheet
        open={Boolean(selected)}
        title={selected ? `New ${selected.name} project` : 'New project'}
        subtitle={selected?.tagline}
        label="Project name"
        initialValue={selected?.name ?? ''}
        confirmLabel="Create"
        onClose={() => setSelected(null)}
        onSubmit={(value) => {
          if (!selected) return
          onCreate(selected, value)
          setSelected(null)
        }}
      >
        {selected && (
          <div className="file-preview-list">
            {selected.files.map((file) => {
              const lang = languageForPath(file.path)
              return (
                <div key={file.path} className="file-preview-row">
                  <span className="lang-dot" style={{ background: lang.color }} />
                  <span className="grow">{file.path}</span>
                  <span className="muted small">{formatBytes(file.content.length)}</span>
                </div>
              )
            })}
          </div>
        )}
      </PromptSheet>

      {/* Project actions */}
      <Sheet
        open={Boolean(activeMeta)}
        title={activeMeta?.name ?? ''}
        subtitle="Project actions"
        onClose={() => setActionId(null)}
      >
        {activeMeta && (
          <div className="action-list">
            <button
              className="action-item"
              onClick={() => {
                onOpen(activeMeta.id)
                setActionId(null)
              }}
            >
              <Icon name="code" size={18} />
              <span>Open project</span>
            </button>
            <button
              className="action-item"
              onClick={async () => {
                const full = await loadProject(activeMeta.id)
                if (full) {
                  downloadBlob(`${activeMeta.name.replace(/[^a-z0-9-_ ]/gi, '') || 'project'}.zip`, projectZipBlob(full))
                  onNotify('ZIP exported', 'success')
                }
                setActionId(null)
              }}
            >
              <Icon name="download" size={18} />
              <span>Export ZIP</span>
            </button>
            <button
              className="action-item"
              onClick={async () => {
                const full = await loadProject(activeMeta.id)
                if (full) {
                  const blob = new Blob([projectToJson(full)], { type: 'application/json' })
                  downloadBlob(`${activeMeta.name.replace(/[^a-z0-9-_ ]/gi, '') || 'project'}.cody.json`, blob)
                  onNotify('Project JSON exported', 'success')
                }
                setActionId(null)
              }}
            >
              <Icon name="save" size={18} />
              <span>Export project JSON</span>
            </button>
            <button
              className="action-item"
              onClick={() => {
                onDuplicate(activeMeta.id)
                setActionId(null)
              }}
            >
              <Icon name="copy" size={18} />
              <span>Duplicate</span>
            </button>
            <button
              className="action-item danger"
              onClick={() => {
                setDeleteTarget(activeMeta)
                setActionId(null)
              }}
            >
              <Icon name="trash" size={18} />
              <span>Delete project</span>
            </button>
          </div>
        )}
      </Sheet>

      <Sheet
        open={Boolean(deleteTarget)}
        title="Delete project?"
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
        <p className="muted">Files are removed from this device. Export a backup first if needed.</p>
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
            const name =
              normalizePath((list[0] as File & { webkitRelativePath?: string }).webkitRelativePath || '')
                .split('/')[0] || 'Imported project'
            await importAsProject(files, name)
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
            if (project) await onImport(project)
            else onNotify('That file is not a Cody project', 'error')
          }
          event.target.value = ''
        }}
      />
    </div>
  )
}
