/**
 * One project scan, shared by every surface.
 *
 * The problems list, the file tree, the tabs and the tab bar all need to know
 * which files are broken. Analysing per component would run the parsers once
 * per mount, so the scan is memoised against the `files` array identity and
 * shared through a hook.
 */
import { useDeferredValue, useMemo } from 'react'
import { analyzeProject, type Diagnostic, type Severity } from './diagnostics'
import type { ProjectFile } from '../types'

export type ProblemIndex = {
  /** Every problem, errors first, then by path and line. */
  list: Diagnostic[]
  /** Problems for one exact file path. */
  byPath: Map<string, Diagnostic[]>
  /** Problems for everything inside a folder prefix. */
  byFolder: Map<string, Diagnostic[]>
  errors: number
  warnings: number
  total: number
  filesWithProblems: number
}

const severityRank: Record<Severity, number> = { error: 0, warning: 1 }

export function buildProblemIndex(files: ProjectFile[]): ProblemIndex {
  const list = analyzeProject(files).sort(
    (a, b) =>
      severityRank[a.severity] - severityRank[b.severity] ||
      a.path.localeCompare(b.path) ||
      a.line - b.line ||
      a.column - b.column,
  )

  const byPath = new Map<string, Diagnostic[]>()
  const byFolder = new Map<string, Diagnostic[]>()
  let errors = 0
  let warnings = 0

  for (const problem of list) {
    if (problem.severity === 'error') errors += 1
    else warnings += 1

    const forFile = byPath.get(problem.path)
    if (forFile) forFile.push(problem)
    else byPath.set(problem.path, [problem])

    // roll the problem up every ancestor folder so a collapsed tree still
    // shows that something inside is broken
    const parts = problem.path.split('/')
    for (let depth = 1; depth < parts.length; depth += 1) {
      const folder = parts.slice(0, depth).join('/')
      const forFolder = byFolder.get(folder)
      if (forFolder) forFolder.push(problem)
      else byFolder.set(folder, [problem])
    }
  }

  return {
    list,
    byPath,
    byFolder,
    errors,
    warnings,
    total: list.length,
    filesWithProblems: byPath.size,
  }
}

const cache = new WeakMap<ProjectFile[], ProblemIndex>()

/** Memoised scan for a given files array (same array in → same index out). */
export function problemIndexFor(files: ProjectFile[]): ProblemIndex {
  const hit = cache.get(files)
  if (hit) return hit
  const index = buildProblemIndex(files)
  cache.set(files, index)
  return index
}

export function problemsAt(index: ProblemIndex, path: string): Diagnostic[] {
  return index.byPath.get(path) ?? index.byFolder.get(path) ?? []
}

/** The worst severity at a path — a file or a folder — or null when clean. */
export function severityAt(index: ProblemIndex, path: string): Severity | null {
  const found = problemsAt(index, path)
  if (found.length === 0) return null
  return found.some((problem) => problem.severity === 'error') ? 'error' : 'warning'
}

/**
 * Project-wide problems for the current files. Deferred so a keystroke never
 * waits on the full scan; the open file is still linted live by the editor.
 */
export function useProblemIndex(files: ProjectFile[]): ProblemIndex {
  const deferred = useDeferredValue(files)
  return useMemo(() => problemIndexFor(deferred), [deferred])
}
