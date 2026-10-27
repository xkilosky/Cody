import { useMemo, useState, type ReactNode } from 'react'
import type { Project } from '../types'
import { languageForPath, runtimeLabel } from '../lib/languages'
import Icon from './Icons'
import LangIcon from './LangIcon'
import ProblemMark from './ProblemMark'
import Sheet, { PromptSheet } from './Sheet'
import { dirName, fileName, normalizePath } from '../lib/utils'
import { problemsAt, useProblemIndex } from '../lib/problemIndex'
import { allFolders, buildTree, filesUnder, type TreeNode } from '../lib/projectTree'

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
  onCreateFolder: (path: string) => void
  onRenameFolder: (from: string, to: string) => void
  onDeleteFolder: (path: string) => void
  onDuplicateFolder: (path: string) => void
  onMoveFile: (path: string, folder: string) => void
  onSetEntry: (path: string) => void
  onNotify: (message: string, tone?: 'info' | 'success' | 'error') => void
  /** Open the project-wide find sheet (this box only filters file names). */
  onOpenSearch: () => void
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
  'Main.hs',
  'main.dart',
  'main.jl',
  'Main.scala',
  'script.pl',
  'greet.r',
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
  onCreateFolder,
  onRenameFolder,
  onDeleteFolder,
  onDuplicateFolder,
  onMoveFile,
  onSetEntry,
  onNotify,
  onOpenSearch,
}: Props) {
  const [filter, setFilter] = useState('')
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())
  const [actionPath, setActionPath] = useState<string | null>(null)
  const [folderAction, setFolderAction] = useState<string | null>(null)
  const [newMenuOpen, setNewMenuOpen] = useState(false)
  const [newFileOpen, setNewFileOpen] = useState(false)
  const [newFileParent, setNewFileParent] = useState('')
  const [newFolderOpen, setNewFolderOpen] = useState(false)
  const [newFolderParent, setNewFolderParent] = useState('')
  const [renaming, setRenaming] = useState<string | null>(null)
  const [renamingFolder, setRenamingFolder] = useState<string | null>(null)
  const [moving, setMoving] = useState<string | null>(null)
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null)
  const [confirmFolderDelete, setConfirmFolderDelete] = useState<string | null>(null)

  // One shared project scan: which files are broken, and which folders hide
  // something broken inside them.
  const index = useProblemIndex(project.files)

  const folders = useMemo(() => project.folders ?? [], [project.folders])

  const tree = useMemo(() => {
    const query = filter.trim().toLowerCase()
    if (!query) return buildTree(project.files, folders)
    const paths = project.files
      .map((file) => file.path)
      .filter((path) => path.toLowerCase().includes(query))
    return buildTree(paths.map((path) => ({ path, content: '' })), folders)
  }, [project.files, folders, filter])

  const toggleFolder = (path: string) => {
    setCollapsed((prev) => {
      const next = new Set(prev)
      if (next.has(path)) next.delete(path)
      else next.add(path)
      return next
    })
  }

  const openNewFile = (parent: string | null) => {
    setNewFileParent(parent ?? '')
    setNewFileOpen(true)
    setNewMenuOpen(false)
    setFolderAction(null)
  }

  const openNewFolder = (parent: string | null) => {
    setNewFolderParent(parent ?? '')
    setNewFolderOpen(true)
    setNewMenuOpen(false)
    setFolderAction(null)
  }

  const renderNodes = (nodes: TreeNode[], depth = 0): ReactNode =>
    nodes.map((node) => {
      if (node.kind === 'folder') {
        const isCollapsed = collapsed.has(node.path)
        const inside = filesUnder(project.files, node.path)
        return (
          <div key={`dir:${node.path}`}>
            <div className="file-row-wrap folder-wrap">
              <button
                className="file-row folder-row"
                style={{ paddingLeft: 12 + depth * 14 }}
                onClick={() => toggleFolder(node.path)}
                aria-expanded={!isCollapsed}
              >
                <Icon name={isCollapsed ? 'folder' : 'folder-open'} size={16} />
                <ProblemMark problems={problemsAt(index, node.path)} path={node.path} />
                <span className="file-name">{node.name}</span>
                <span className="file-meta">{inside.length}</span>
                <Icon name={isCollapsed ? 'chevron-right' : 'chevron-down'} size={14} />
              </button>
              <button
                className="row-icon"
                aria-label={`Folder actions for ${node.path}`}
                onClick={(event) => {
                  event.stopPropagation()
                  setFolderAction(node.path)
                }}
              >
                <Icon name="more" size={18} />
              </button>
            </div>
            {!isCollapsed &&
              (node.children.length > 0 ? (
                renderNodes(node.children, depth + 1)
              ) : (
                <button
                  className="folder-empty"
                  style={{ paddingLeft: 26 + depth * 14 }}
                  onClick={() => openNewFile(node.path)}
                >
                  <Icon name="plus" size={13} /> Empty folder — add a file
                </button>
              ))}
          </div>
        )
      }

      const lang = languageForPath(node.path)
      const isEntry = runEntry === node.path || project.entry === node.path
      const isRunnable = lang.runtime !== 'none'
      return (
        <div
          key={`file:${node.path}`}
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
  const folderPath = folderAction
  const folderFiles = folderPath ? filesUnder(project.files, folderPath) : []
  const deletingFolderFiles = confirmFolderDelete ? filesUnder(project.files, confirmFolderDelete) : []
  const fileCount = project.files.length
  const folderCount = allFolders(project.files, folders).length
  const languageCount = new Set(project.files.map((file) => languageForPath(file.path).id)).size

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
        <button
          className="btn small ghost icon-only"
          onClick={onOpenSearch}
          aria-label="Find in files"
          title="Find in files (⌘⇧F)"
        >
          <Icon name="find" size={16} />
        </button>
        <button className="btn small ghost" onClick={() => setNewMenuOpen(true)}>
          <Icon name="plus" size={16} /> New
        </button>
      </div>

      <div className="file-list">
        {project.files.length === 0 && tree.length === 0 ? (
          <div className="empty-state">
            <Icon name="file" size={28} />
            <h3>No files yet</h3>
            <p>Create your first file or folder to start building.</p>
            <div className="row-gap">
              <button className="btn primary" onClick={() => openNewFile(null)}>
                <Icon name="plus" size={16} /> New file
              </button>
              <button className="btn ghost" onClick={() => openNewFolder(null)}>
                <Icon name="folder" size={16} /> New folder
              </button>
            </div>
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
          {fileCount} file{fileCount === 1 ? '' : 's'} · {folderCount} folder
          {folderCount === 1 ? '' : 's'} · {languageCount} language{languageCount === 1 ? '' : 's'}
        </span>
        {project.entry && (
          <button className="linkish" onClick={() => onOpenFile(project.entry!)}>
            entry: {fileName(project.entry)}
          </button>
        )}
      </div>

      {/* ---- new: file or folder ---------------------------------------- */}
      <Sheet open={newMenuOpen} title="Create" subtitle="Files live in folders — folders can be empty." onClose={() => setNewMenuOpen(false)}>
        <div className="action-list">
          <button className="action-item" onClick={() => openNewFile(null)}>
            <Icon name="file" size={18} />
            <span className="grow">New file</span>
            <span className="muted small">root</span>
          </button>
          <button className="action-item" onClick={() => openNewFolder(null)}>
            <Icon name="folder" size={18} />
            <span className="grow">New folder</span>
            <span className="muted small">root</span>
          </button>
        </div>
      </Sheet>

      {/* ---- new file ---------------------------------------------------- */}
      <PromptSheet
        open={newFileOpen}
        title="New file"
        subtitle={newFileParent ? `Inside ${newFileParent}/` : 'Type a path — folders are created automatically.'}
        label="File path"
        placeholder={newFileParent ? `${newFileParent}/file.js` : 'src/components/Card.tsx'}
        initialValue={newFileParent ? `${newFileParent}/` : ''}
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
          setNewFileOpen(false)
        }}
      >
        <div className="chip-row wrap">
          {QUICK_FILES.filter((name) => !project.files.some((file) => file.path === name)).map((name) => (
            <button
              key={name}
              className="chip"
              onClick={() => {
                onCreateFile(newFileParent ? `${newFileParent}/${fileName(name)}` : name)
                setNewFileOpen(false)
              }}
            >
              {name}
            </button>
          ))}
        </div>
      </PromptSheet>

      {/* ---- new folder -------------------------------------------------- */}
      <PromptSheet
        open={newFolderOpen}
        title="New folder"
        subtitle={newFolderParent ? `Inside ${newFolderParent}/` : 'Folders can be empty, or hold files and other folders.'}
        label="Folder path"
        placeholder={newFolderParent ? `${newFolderParent}/components` : 'src/components'}
        initialValue={newFolderParent ? `${newFolderParent}/` : ''}
        confirmLabel="Create folder"
        onClose={() => setNewFolderOpen(false)}
        onSubmit={(value) => {
          const path = normalizePath(value)
          if (!path) return
          onCreateFolder(path)
          setNewFolderOpen(false)
        }}
      />

      {/* ---- rename file ------------------------------------------------- */}
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
          setRenaming(null)
        }}
      />

      {/* ---- rename folder ----------------------------------------------- */}
      <PromptSheet
        open={Boolean(renamingFolder)}
        title="Rename folder"
        subtitle="Every file inside moves with it."
        label="New folder path"
        initialValue={renamingFolder ?? ''}
        confirmLabel="Rename folder"
        onClose={() => setRenamingFolder(null)}
        onSubmit={(value) => {
          if (!renamingFolder) return
          const path = normalizePath(value)
          if (!path) return
          onRenameFolder(renamingFolder, path)
          setRenamingFolder(null)
        }}
      />

      {/* ---- move file --------------------------------------------------- */}
      <PromptSheet
        open={Boolean(moving)}
        title="Move file"
        subtitle="Type a folder path. Leave empty for the project root."
        label="Destination folder"
        placeholder="src/components"
        initialValue={moving ? dirName(moving) : ''}
        confirmLabel="Move file"
        onClose={() => setMoving(null)}
        onSubmit={(value) => {
          if (!moving) return
          onMoveFile(moving, normalizePath(value))
          setMoving(null)
        }}
      />

      {/* ---- file actions ------------------------------------------------ */}
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
                setMoving(actionFile.path)
                setActionPath(null)
              }}
            >
              <Icon name="folder" size={18} />
              <span>Move to folder…</span>
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

      {/* ---- folder actions ---------------------------------------------- */}
      <Sheet
        open={Boolean(folderPath)}
        title={folderPath ? fileName(folderPath) : ''}
        subtitle={
          folderPath
            ? `${folderPath}/ · ${folderFiles.length} file${folderFiles.length === 1 ? '' : 's'}`
            : undefined
        }
        onClose={() => setFolderAction(null)}
      >
        {folderPath && (
          <div className="action-list">
            <button className="action-item" onClick={() => openNewFile(folderPath)}>
              <Icon name="file" size={18} />
              <span>New file here</span>
            </button>
            <button className="action-item" onClick={() => openNewFolder(folderPath)}>
              <Icon name="folder" size={18} />
              <span>New folder inside</span>
            </button>
            <button
              className="action-item"
              onClick={() => {
                setRenamingFolder(folderPath)
                setFolderAction(null)
              }}
            >
              <Icon name="pencil" size={18} />
              <span>Rename folder</span>
            </button>
            <button
              className="action-item"
              onClick={() => {
                onDuplicateFolder(folderPath)
                setFolderAction(null)
              }}
            >
              <Icon name="copy" size={18} />
              <span>Duplicate folder</span>
            </button>
            <button
              className="action-item"
              onClick={() => {
                toggleFolder(folderPath)
                setFolderAction(null)
              }}
            >
              <Icon name={collapsed.has(folderPath) ? 'chevron-down' : 'chevron-right'} size={18} />
              <span>{collapsed.has(folderPath) ? 'Expand folder' : 'Collapse folder'}</span>
            </button>
            <button
              className="action-item danger"
              onClick={() => {
                setConfirmFolderDelete(folderPath)
                setFolderAction(null)
              }}
            >
              <Icon name="trash" size={18} />
              <span>Delete folder</span>
            </button>
          </div>
        )}
      </Sheet>

      {/* ---- delete file ------------------------------------------------- */}
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

      {/* ---- delete folder ----------------------------------------------- */}
      <Sheet
        open={Boolean(confirmFolderDelete)}
        title="Delete folder?"
        subtitle={confirmFolderDelete ? `${confirmFolderDelete}/` : undefined}
        onClose={() => setConfirmFolderDelete(null)}
        footer={
          <div className="row-gap">
            <button className="btn ghost block" onClick={() => setConfirmFolderDelete(null)}>
              Cancel
            </button>
            <button
              className="btn danger block"
              onClick={() => {
                if (confirmFolderDelete) onDeleteFolder(confirmFolderDelete)
                setConfirmFolderDelete(null)
              }}
            >
              Delete folder
            </button>
          </div>
        }
      >
        <p className="muted">
          {deletingFolderFiles.length === 0
            ? 'This folder is empty, so nothing else will be lost.'
            : `This removes the folder and the ${deletingFolderFiles.length} file${
                deletingFolderFiles.length === 1 ? '' : 's'
              } inside it.`}
        </p>
        {deletingFolderFiles.length > 0 && (
          <ul className="delete-list">
            {deletingFolderFiles.slice(0, 6).map((file) => (
              <li key={file.path}>{file.path}</li>
            ))}
            {deletingFolderFiles.length > 6 && <li className="muted">+{deletingFolderFiles.length - 6} more</li>}
          </ul>
        )}
      </Sheet>
    </div>
  )
}
