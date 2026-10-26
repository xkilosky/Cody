/**
 * Find in files.
 *
 * Everything here is pure and offline: give it the project's files and a query,
 * get back matches grouped by file (with the line, the column and a short
 * preview), or the new contents after a replace. No index, no worker — a
 * project is a handful of small text files, so a single pass is faster than
 * keeping anything in sync.
 *
 * The two rules that keep it predictable on a phone:
 *  - it never walks a zero-length match (an empty pattern would otherwise hang),
 *  - it stops early, so a query that matches everywhere still paints instantly.
 */
import type { ProjectFile } from '../types'

export type FindOptions = {
  caseSensitive?: boolean
  regex?: boolean
}

export type FindMatch = {
  /** 1-based line and column, the way the editor talks about positions. */
  line: number
  column: number
  /** Absolute offsets in the file, for future selection-driven jumps. */
  start: number
  end: number
  /** The line, trimmed to a window around the match (tabs kept as text). */
  before: string
  match: string
  after: string
}

export type FindFile = {
  path: string
  matches: FindMatch[]
}

export type FindResult = {
  files: FindFile[]
  /** Every match found (may be fewer than exist when `truncated` is true). */
  total: number
  fileCount: number
  truncated: boolean
  /** Set when the query looks like a regular expression but is not valid. */
  error: string | null
}

export const MAX_MATCHES = 200
export const MAX_PER_FILE = 40
/** Characters of context kept on either side of a match in the preview. */
const CONTEXT = 44

const EMPTY: FindResult = { files: [], total: 0, fileCount: 0, truncated: false, error: null }

export function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/** The compiled query, or null when there is nothing to look for. */
export function matcherFor(query: string, options: FindOptions = {}): RegExp | null {
  if (query.length === 0) return null
  const source = options.regex ? query : escapeRegExp(query)
  return new RegExp(source, options.caseSensitive ? 'g' : 'gi')
}

/** Compile-safe matcher: also reports why a pattern could not be used. */
export function compile(query: string, options: FindOptions = {}): { matcher: RegExp | null; error: string | null } {
  if (query.length === 0) return { matcher: null, error: null }
  try {
    return { matcher: matcherFor(query, options), error: null }
  } catch {
    return { matcher: null, error: 'That pattern is not a valid regular expression' }
  }
}

function preview(
  text: string,
  lineStart: number,
  lineEnd: number,
  start: number,
  end: number,
): { before: string; match: string; after: string } {
  const raw = text.slice(lineStart, lineEnd)
  const from = start - lineStart
  const to = end - lineStart
  // Start at the first non-space character when the match is near the indent,
  // so a deeply nested line still shows its code instead of four dots.
  const indent = raw.length - raw.trimStart().length
  const windowStart = Math.max(from - CONTEXT, 0)
  const left = windowStart <= indent ? indent : windowStart
  const windowEnd = Math.min(to + CONTEXT, raw.length)
  // An ellipsis only when real code is hidden — not when we merely dropped indent.
  return {
    before: (left > indent ? '…' : '') + raw.slice(left, from),
    match: raw.slice(from, to),
    after: raw.slice(to, windowEnd) + (windowEnd < raw.length ? '…' : ''),
  }
}

export function findMatches(text: string, query: string, options: FindOptions = {}): FindMatch[] {
  return scan(text, query, options, MAX_PER_FILE)
}

/** Internal: finds at most `limit` matches, so the caller can ask for one extra
 *  and learn whether the file holds more. */
function scan(text: string, query: string, options: FindOptions, limit: number): FindMatch[] {
  const matcher = matcherFor(query, options)
  if (!matcher) return []
  const matches: FindMatch[] = []
  let line = 1
  let lineStart = 0
  let cursor = 0

  const seek = (index: number) => {
    for (let at = cursor; at < index; at += 1) {
      if (text.charCodeAt(at) === 10) {
        line += 1
        lineStart = at + 1
      }
    }
    cursor = index
  }

  matcher.lastIndex = 0
  let found = matcher.exec(text)
  while (found && matches.length < limit) {
    if (found[0].length === 0) {
      // An empty pattern matches everywhere; step over it instead of looping.
      matcher.lastIndex = found.index + 1
      found = matcher.exec(text)
      continue
    }
    seek(found.index)
    const lineEnd = text.indexOf('\n', found.index)
    const end = lineEnd === -1 ? text.length : lineEnd
    const parts = preview(text, lineStart, end, found.index, found.index + found[0].length)
    matches.push({
      line,
      column: found.index - lineStart + 1,
      start: found.index,
      end: found.index + found[0].length,
      ...parts,
    })
    matcher.lastIndex = found.index + found[0].length
    found = matcher.exec(text)
  }
  return matches
}

export function searchProject(files: ProjectFile[], query: string, options: FindOptions = {}): FindResult {
  if (query.length === 0) return EMPTY
  const { matcher, error } = compile(query, options)
  if (!matcher) return { ...EMPTY, error }

  const result: FindFile[] = []
  let total = 0
  let truncated = false

  for (const file of files) {
    if (total >= MAX_MATCHES) {
      truncated = true
      break
    }
    const matches = scan(file.content, query, options, MAX_PER_FILE + 1)
    if (matches.length === 0) continue
    const room = Math.min(MAX_PER_FILE, MAX_MATCHES - total)
    const kept = matches.length > room ? matches.slice(0, room) : matches
    if (matches.length > room) truncated = true
    result.push({ path: file.path, matches: kept })
    total += kept.length
  }

  // Files with the most hits first, then alphabetically — the place you are
  // looking for is usually where the symbol lives most often.
  result.sort((a, b) => b.matches.length - a.matches.length || a.path.localeCompare(b.path))
  return { files: result, total, fileCount: result.length, truncated, error: null }
}

export type Replacement = { path: string; content: string; count: number }

/**
 * Replace every non-empty match. The replacement is inserted literally (no `$1`
 * expansion) so a stray `$` in what you typed cannot turn into a group.
 */
export function replaceAll(
  text: string,
  query: string,
  replacement: string,
  options: FindOptions = {},
): { text: string; count: number } {
  const { matcher } = compile(query, options)
  if (!matcher) return { text, count: 0 }

  const pieces: string[] = []
  let last = 0
  let count = 0
  matcher.lastIndex = 0
  let found = matcher.exec(text)
  while (found) {
    if (found[0].length === 0 || count >= 5000) {
      matcher.lastIndex = found.index + 1
      found = matcher.exec(text)
      continue
    }
    pieces.push(text.slice(last, found.index), replacement)
    last = found.index + found[0].length
    count += 1
    matcher.lastIndex = last
    found = matcher.exec(text)
  }
  if (count === 0) return { text, count: 0 }
  pieces.push(text.slice(last))
  return { text: pieces.join(''), count }
}

export function replaceProject(
  files: ProjectFile[],
  query: string,
  replacement: string,
  options: FindOptions = {},
): { changes: Replacement[]; total: number } {
  if (query.length === 0) return { changes: [], total: 0 }
  const changes: Replacement[] = []
  let total = 0
  for (const file of files) {
    const { text, count } = replaceAll(file.content, query, replacement, options)
    if (count === 0) continue
    changes.push({ path: file.path, content: text, count })
    total += count
  }
  return { changes, total }
}
