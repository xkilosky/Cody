import type { ProjectFile } from '../types'
import { dirName, fileName, normalizePath } from './utils'

/**
 * Folders are real things in Cody, not just prefixes.
 *
 * A folder exists when something lives in it *or* when the project declares it
 * (`project.folders`), which is what lets you create an empty folder and drop
 * files into it later.
 */
export type FileNode = { kind: 'file'; name: string; path: string }
export type FolderNode = { kind: 'folder'; name: string; path: string; children: TreeNode[] }
export type TreeNode = FileNode | FolderNode

/** `src/lib/x.ts` → `['src', 'src/lib']` */
export function ancestorFolders(path: string): string[] {
  const parts = normalizePath(path).split('/')
  const out: string[] = []
  for (let index = 1; index < parts.length; index += 1) out.push(parts.slice(0, index).join('/'))
  return out
}

/** Every folder that exists in the project, sorted. */
export function allFolders(files: ProjectFile[], declared: string[] = []): string[] {
  const set = new Set<string>()
  for (const folder of declared) {
    const clean = normalizePath(folder)
    if (!clean) continue
    for (const ancestor of ancestorFolders(clean)) set.add(ancestor)
    set.add(clean)
  }
  for (const file of files) for (const ancestor of ancestorFolders(file.path)) set.add(ancestor)
  return [...set].sort((a, b) => a.localeCompare(b))
}

/** Files directly in a folder (or anywhere below it when `deep`). */
export function filesUnder(files: ProjectFile[], folder: string, deep = true): ProjectFile[] {
  const clean = normalizePath(folder)
  if (!clean) return files
  const prefix = `${clean}/`
  return files.filter((file) => (deep ? file.path.startsWith(prefix) : dirName(file.path) === clean))
}

/** Immediate child folders of `folder`. */
export function childFolders(folders: string[], folder: string): string[] {
  const clean = normalizePath(folder)
  return folders.filter((candidate) => dirName(candidate) === clean)
}

/** Every folder under `folder`, including itself. */
export function foldersUnder(folders: string[], folder: string): string[] {
  const clean = normalizePath(folder)
  if (!clean) return folders
  const prefix = `${clean}/`
  return folders.filter((candidate) => candidate === clean || candidate.startsWith(prefix))
}

/** Nested tree for the Files pane, including declared-but-empty folders. */
export function buildTree(files: ProjectFile[], declared: string[] = []): TreeNode[] {
  const root: FolderNode = { kind: 'folder', name: '', path: '', children: [] }

  const ensure = (path: string): FolderNode => {
    let cursor = root
    const parts = normalizePath(path).split('/').filter(Boolean)
    parts.forEach((part, index) => {
      const nextPath = parts.slice(0, index + 1).join('/')
      let folder = cursor.children.find(
        (child): child is FolderNode => child.kind === 'folder' && child.name === part,
      )
      if (!folder) {
        folder = { kind: 'folder', name: part, path: nextPath, children: [] }
        cursor.children.push(folder)
      }
      cursor = folder
    })
    return cursor
  }

  for (const folder of allFolders(files, declared)) ensure(folder)
  for (const file of files) ensure(dirName(file.path)).children.push({ kind: 'file', name: fileName(file.path), path: file.path })

  const sortNodes = (nodes: TreeNode[]) => {
    nodes.sort((a, b) => {
      if (a.kind !== b.kind) return a.kind === 'folder' ? -1 : 1
      return a.name.localeCompare(b.name)
    })
    for (const node of nodes) if (node.kind === 'folder') sortNodes(node.children)
  }
  sortNodes(root.children)
  return root.children
}
