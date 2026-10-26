import { useMemo, useState } from 'react'
import type { Project } from '../types'
import { languageForPath, runtimeLabel } from '../lib/languages'
import Icon from './Icons'
import LangIcon from './LangIcon'
import Sheet, { PromptSheet } from './Sheet'
import ProblemMark from './ProblemMark'
import { fileName, normalizePath } from '../lib/utils'
import { problemsAt, useProblemIndex } from '../lib/problemIndex'

type Props = {
  project: Project
  activePath: string | null
  runEntry: string | null
  onOpenFile: (path: string) => void
  onRunFile: (path: string) => void
  onCreateFile: (path: string, content?: string) => void
  onRenameFile: (from: string, to: string) => void
  onDeleteFile: (path: string) => void
  onDuplicateFile: (path: string) => void
  onSetEntry: (path: string) => void
  onNotify: (message: string, tone?: 'info' | 'success' | 'error') => void
}

type FileNode = { kind: 'file'; name: string; path: string }
type FolderNode = { kind: 'folder'; name: string; path: string; children: TreeNode[] }
type TreeNode = FileNode | FolderNode

function buildTree(paths: string[]): TreeNode[] {
  const root: FolderNode = { kind: 'folder', name: '', path: '', children: [] }
  for (const path of paths) {
    const parts = path.split('/')
    let cursor = root
    parts.forEach((part, index) => {
      const isLeaf = index === parts.length - 1
      const nextPath = parts.slice(0, index + 1).join('/')
      if (isLeaf) {
        cursor.children.push({ kind: 'file', name: part, path })
      } else {
        let folder = cursor.children.find(
          (child): child is FolderNode => child.kind === 'folder' && child.name === part,
        )
        if (!folder) {
          folder = { kind: 'folder', name: part, path: nextPath, children: [] }
          cursor.children.push(folder)
        }
        cursor = folder
      }
    })
  }
  const sortNodes = (nodes: TreeNode[]): TreeNode[] =>
    nodes.sort((a, b) => {
      if (a.kind !== b.kind) return a.kind === 'folder' ? -1 : 1
      return a.name.localeCompare(b.name)
    })
  const walk = (nodes: TreeNode[]) => {
    sortNodes(nodes)
    for (const node of nodes) if (node.kind === 'folder') walk(node.children)
  }
  walk(root.children)
  return root.children
}

const QUICK_FILES = [
  'index.html',
  'styles.css',
  'app.js',
  'src/main.tsx',
  'src/App.tsx',
  'main.py',
  'main.go',
  'main.c',
  'Main.java',
  'main.rs',
  'README.md',
]

export default function FilesPane({
  project,
  activePath,
  runEntry,
  onOpenFile,
  onRunFile,
  onCreateFile,
  onRenameFile,
  onDeleteFile,
  onDuplicateFile,
  onSetEntry,
  onNotify,
}: Props) {
  const [filter, setFilter] = useState('')
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())
  const [actionPath, setActionPath] = useState<string | null>(null)
  const [newFileOpen, setNewFileOpen] = useState(false)
  const [renaming, setRenaming] = useState<string | null>(null)
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null)

  // One shared project scan: which files are broken, and which folders hide
  // something broken inside them.
  const index = useProblemIndex(project.files)

  const tree = useMemo(() => {
    const query = filter.trim().toLowerCase()
    const paths = project.files
      .map((file) => file.path)
      .filter((path) => !query || path.toLowerCase().includes(query))
    return buildTree(paths)
  }, [project.files, filter])

  const toggleFolder = (path: string) => {
    setCollapsed((prev) => {
      const next = new Set(prev)
      if (next.has(path)) next.delete(path)
      else next.add(path)
      return next
    })
  }

  const renderNodes = (nodes: TreeNode[], depth = 0) =>
    nodes.map((node) => {
      if (node.kind === 'folder') {
        const isCollapsed = collapsed.has(node.path)
        const inside = problemsAt(index, node.path)
        return (
          <div key={node.path}>
            <button
              className="file-row folder-row"
              style={{ paddingLeft: 12 + depth * 14 }}
              onClick={() => toggleFolder(node.path)}
            >
              <Icon name={isCollapsed ? 'folder' : 'folder-open'} size={16} />
              <span className="file-name">{node.name}</span>
              <ProblemMark problems={inside} path={node.path} />
              <span className="file-meta">{node.children.length}</span>
              <Icon name={isCollapsed ? 'chevron-right' : 'chevron-down'} size={14} />
            </button>
            {!isCollapsed && renderNodes(node.children, depth + 1)}
          </div>
        )
      }
      const lang = languageForPath(node.path)
      const isEntry = runEntry === node.path || project.entry === node.path
      const isRunnable = lang.runtime !== 'none'
      return (
        <div
          key={node.path}
          className={`file-row-wrap${activePath === node.path ? ' active' : ''}`}
          style={{ paddingLeft: 12 + depth * 14 }}
        >
          <button className="file-row-main" onClick={() => onOpenFile(node.path)}>
            <LangIcon lang={lang} size={15} />
            <ProblemMark problems={problemsAt(index, node.path)} path={node.path} />
            <span className="file-name">{node.name}</span>
            {isEntry && <span className="pill tiny">entry</span>}
            {node.path.includes('/') && <span className="file-meta path-hint">{node.path}</span>}
          </button>
          {isRunnable && (
            <button
              className="row-icon"
              aria-label={`Run ${node.path}`}
              onClick={(event) => {
                event.stopPropagation()
                onRunFile(node.path)
              }}
            >
              <Icon name="play" size={14} filled />
            </button>
          )}
          <button
            className="row-icon"
            aria-label={`Actions for ${node.path}`}
            onClick={(event) => {
              event.stopPropagation()
              setActionPath(node.path)
            }}
          >
            <Icon name="more" size={18} />
          </button>
        </div>
      )
    })

  const actionFile = project.files.find((file) => file.path === actionPath)
  const actionLang = actionFile ? languageForPath(actionFile.path) : null

  return (
    <div className="pane files-pane">
      <div className="pane-toolbar">
        <div className="search-field">
          <Icon name="search" size={16} />
          <input
            value={filter}
            onChange={(event) => setFilter(event.target.value)}
            placeholder="Search files"
            aria-label="Search files"
            autoCapitalize="off"
            autoCorrect="off"
            spellCheck={false}
          />
          {filter && (
            <button className="clear-btn" onClick={() => setFilter('')} aria-label="Clear search">
              <Icon name="close" size={14} />
            </button>
          )}
        </div>
        <button className="btn small ghost" onClick={() => setNewFileOpen(true)}>
          <Icon name="plus" size={16} /> New
        </button>
      </div>

      <div className="file-list">
        {project.files.length === 0 ? (
          <div className="empty-state">
            <Icon name="file" size={28} />
            <h3>No files yet</h3>
            <p>Create your first file to start building.</p>
            <button className="btn primary" onClick={() => setNewFileOpen(true)}>
              <Icon name="plus" size={16} /> New file
            </button>
          </div>
        ) : tree.length === 0 ? (
          <div className="empty-state">
            <Icon name="search" size={26} />
            <h3>No matches</h3>
            <p>Nothing matches “{filter}”.</p>
          </div>
        ) : (
          renderNodes(tree)
        )}
      </div>

      <div className="pane-footnote">
        <span>
          {project.files.length} file{project.files.length === 1 ? '' : 's'} ·{' '}
          {new Set(project.files.map((file) => languageForPath(file.path).id)).size} language
          {new Set(project.files.map((file) => languageForPath(file.path).id)).size === 1 ? '' : 's'}
        </span>
        {project.entry && (
          <button className="linkish" onClick={() => onOpenFile(project.entry!)}>
            entry: {fileName(project.entry)}
          </button>
        )}
      </div>

      <PromptSheet
        open={newFileOpen}
        title="New file"
        subtitle="Type a path — folders are created automatically."
        label="File path"
        placeholder="src/components/Card.tsx"
        initialValue=""
        confirmLabel="Create file"
        onClose={() => setNewFileOpen(false)}
        onSubmit={(value) => {
          const path = normalizePath(value)
          if (!path) return
          if (project.files.some((file) => file.path === path)) {
            onNotify('That file already exists', 'error')
            return
          }
          onCreateFile(path)
        }}
      >
        <div className="chip-row wrap">
          {QUICK_FILES.filter((name) => !project.files.some((file) => file.path === name)).map((name) => (
            <button
              key={name}
              className="chip"
              onClick={() => {
                onCreateFile(name)
                setNewFileOpen(false)
              }}
            >
              {name}
            </button>
          ))}
        </div>
      </PromptSheet>

      <PromptSheet
        open={Boolean(renaming)}
        title="Rename or move"
        subtitle="Changing folders here rewrites the path."
        label="New path"
        initialValue={renaming ?? ''}
        confirmLabel="Rename"
        onClose={() => setRenaming(null)}
        onSubmit={(value) => {
          if (!renaming) return
          const path = normalizePath(value)
          if (!path) return
          onRenameFile(renaming, path)
        }}
      />

      <Sheet
        open={Boolean(actionFile)}
        title={actionFile ? fileName(actionFile.path) : ''}
        subtitle={actionFile ? `${actionFile.path} · ${actionLang?.label ?? ''}` : undefined}
        onClose={() => setActionPath(null)}
      >
        {actionFile && (
          <div className="action-list">
            <button
              className="action-item"
              onClick={() => {
                onOpenFile(actionFile.path)
                setActionPath(null)
              }}
            >
              <Icon name="code" size={18} />
              <span>Open in editor</span>
            </button>
            {actionLang && actionLang.runtime !== 'none' && (
              <button
                className="action-item"
                onClick={() => {
                  onRunFile(actionFile.path)
                  setActionPath(null)
                }}
              >
                <Icon name="play" size={18} />
                <span>Run · {runtimeLabel(actionLang.runtime)}</span>
              </button>
            )}
            <button
              className="action-item"
              onClick={() => {
                onSetEntry(actionFile.path)
                setActionPath(null)
              }}
            >
              <Icon name="zap" size={18} />
              <span>Set as project entry</span>
            </button>
            <button
              className="action-item"
              onClick={() => {
                setRenaming(actionFile.path)
                setActionPath(null)
              }}
            >
              <Icon name="pencil" size={18} />
              <span>Rename or move</span>
            </button>
            <button
              className="action-item"
              onClick={() => {
                onDuplicateFile(actionFile.path)
                setActionPath(null)
              }}
            >
              <Icon name="copy" size={18} />
              <span>Duplicate file</span>
            </button>
            <button
              className="action-item danger"
              onClick={() => {
                setConfirmDelete(actionFile.path)
                setActionPath(null)
              }}
            >
              <Icon name="trash" size={18} />
              <span>Delete file</span>
            </button>
          </div>
        )}
      </Sheet>

      <Sheet
        open={Boolean(confirmDelete)}
        title="Delete file?"
        subtitle={confirmDelete ?? ''}
        onClose={() => setConfirmDelete(null)}
        footer={
          <div className="row-gap">
            <button className="btn ghost block" onClick={() => setConfirmDelete(null)}>
              Cancel
            </button>
            <button
              className="btn danger block"
              onClick={() => {
                if (confirmDelete) onDeleteFile(confirmDelete)
                setConfirmDelete(null)
              }}
            >
              Delete
            </button>
          </div>
        }
      >
        <p className="muted">This removes the file from the project. Export a backup first if you need it.</p>
      </Sheet>
    </div>
  )
}
