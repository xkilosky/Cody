/**
 * Code actions — the lightbulb.
 *
 * Everything here is a pure function of the buffer, the caret and the rest of
 * the project: it returns text edits (applied in one transaction) or a named
 * command that only the app can run (creating a file, asking for a new name).
 * Keeping it pure is what lets the whole catalogue be unit-tested.
 */
import { stripLiterals } from '../editor/completions'
import { languageForPath } from './languages'
import { dirName, normalizePath } from './utils'
import type { ProjectFile } from '../types'

export type TextEdit = { from: number; to: number; insert: string }

export type ActionKind = 'quickfix' | 'import' | 'refactor' | 'create'

export type CodeAction = {
  id: string
  title: string
  kind: ActionKind
  /** One line of context under the title. */
  detail?: string
  edits: TextEdit[]
  /** Where to put the caret afterwards (absolute offset, post-edit). */
  cursor?: number
  /** Some actions need the app, not the buffer. */
  command?: { id: 'create-file'; path: string } | { id: 'rename-symbol'; name: string }
}

/**
 * Where the lightbulb belongs in the gutter: one per line that has something to
 * offer. `column` is where the caret should land when the bulb is tapped.
 */
export type ActionMarker = { line: number; column: number; count: number; hasFix: boolean }

export type ActionContext = {
  path: string
  content: string
  /** Caret offset in `content`. */
  pos: number
  /** Selected range, when there is one. */
  selection?: { from: number; to: number }
  files?: ProjectFile[]
}

const JS_LIKE = /\.(?:[cm]?[jt]sx?)$/i
const PYTHON = /\.py$/i
const CSS_LIKE = /\.(?:css|scss|sass|less)$/i
const MARKUP = /\.(?:html?|xml|svg)$/i

const GLOBALS = new Set([
  'React', 'console', 'window', 'document', 'Math', 'JSON', 'Object', 'Array', 'Promise', 'String',
  'Number', 'Boolean', 'Symbol', 'Date', 'Error', 'TypeError', 'Map', 'Set', 'WeakMap', 'RegExp',
  'parseInt', 'parseFloat', 'isNaN', 'setTimeout', 'setInterval', 'clearTimeout', 'clearInterval',
  'fetch', 'URL', 'Blob', 'File', 'FormData', 'localStorage', 'sessionStorage', 'navigator',
  'location', 'alert', 'require', 'module', 'exports', 'process', 'undefined', 'null', 'true',
  'false', 'this', 'self', 'globalThis', 'Intl', 'performance', 'crypto', 'structuredClone',
  'requestAnimationFrame', 'queueMicrotask', 'AbortController', 'TextEncoder', 'TextDecoder',
  'print', 'len', 'range', 'str', 'int', 'float', 'dict', 'list', 'set', 'tuple', 'super', 'type',
  'Exception', 'ValueError', 'KeyError', 'enumerate', 'zip', 'open', 'input', 'isinstance', '__name__',
])

const PY_KEYWORDS = new Set([
  'def', 'class', 'return', 'if', 'elif', 'else', 'for', 'while', 'break', 'continue', 'import',
  'from', 'as', 'with', 'try', 'except', 'finally', 'raise', 'lambda', 'yield', 'global', 'nonlocal',
  'assert', 'pass', 'in', 'is', 'not', 'and', 'or', 'None', 'True', 'False', 'async', 'await', 'del',
  'print',
])

/* ------------------------------------------------------------------------ */
/* position helpers                                                          */
/* ------------------------------------------------------------------------ */

type LineInfo = { start: number; end: number; text: string; index: number }

function lineAt(content: string, pos: number): LineInfo {
  const clamped = Math.max(0, Math.min(pos, content.length))
  const start = content.lastIndexOf('\n', Math.max(0, clamped - 1)) + 1
  const nextBreak = content.indexOf('\n', clamped)
  const end = nextBreak === -1 ? content.length : nextBreak
  const index = content.slice(0, start).split('\n').length - 1
  return { start, end, text: content.slice(start, end), index }
}

function wordAt(content: string, pos: number): { word: string; from: number; to: number } | null {
  const isWord = (char: string | undefined) => Boolean(char && /[\w$]/.test(char))
  if (!isWord(content[pos]) && !isWord(content[pos - 1])) return null
  let from = pos
  while (from > 0 && isWord(content[from - 1])) from -= 1
  let to = pos
  while (to < content.length && isWord(content[to])) to += 1
  const word = content.slice(from, to)
  return word ? { word, from, to } : null
}

function countOccurrences(haystack: string, needle: string): number {
  const re = new RegExp(`\\b${needle.replace(/[$]/g, '\\$')}\\b`, 'g')
  return (haystack.match(re) ?? []).length
}

/* ------------------------------------------------------------------------ */
/* import helpers                                                            */
/* ------------------------------------------------------------------------ */

function stripExtension(path: string): string {
  return path.replace(/\.(?:[cm]?[jt]sx?|py)$/i, '')
}

/** `src/main.tsx` → `src/lib/x.ts` gives `./lib/x`. */
export function importSpecifier(fromPath: string, toPath: string): string {
  const fromParts = dirName(fromPath).split('/').filter(Boolean)
  const toParts = stripExtension(toPath).split('/').filter(Boolean)
  let common = 0
  while (common < fromParts.length && common < toParts.length && fromParts[common] === toParts[common]) common += 1
  const up = fromParts.length - common
  const rest = toParts.slice(common)
  const parts = [...Array(up).fill('..'), ...rest]
  const joined = parts.join('/') || '.'
  if (fromPath.endsWith('.py')) return parts.length ? parts.join('.') : '.'
  return joined.startsWith('.') ? joined : `./${joined}`
}

type ExportInfo = { name: string; path: string; isDefault: boolean }

function projectExports(files: ProjectFile[], currentPath: string): ExportInfo[] {
  const out: ExportInfo[] = []
  for (const file of files) {
    if (file.path === currentPath) continue
    if (!JS_LIKE.test(file.path) && !PYTHON.test(file.path)) continue
    const masked = stripLiterals(file.content, PYTHON.test(file.path))
    const named = [
      /\bexport\s+(?:async\s+)?function\s+([\w$]+)/g,
      /\bexport\s+class\s+([\w$]+)/g,
      /\bexport\s+(?:const|let|var)\s+([\w$]+)/g,
      /\bexport\s+(?:type|interface|enum)\s+([\w$]+)/g,
      /^def\s+([\w]+)/gm,
      /^class\s+([\w]+)/gm,
    ]
    for (const re of named) {
      let match: RegExpExecArray | null
      while ((match = re.exec(masked))) out.push({ name: match[1], path: file.path, isDefault: false })
    }
    const defaults = [
      /\bexport\s+default\s+(?:async\s+)?function\s+([\w$]+)/,
      /\bexport\s+default\s+class\s+([\w$]+)/,
    ]
    for (const re of defaults) {
      const match = masked.match(re)
      if (match) out.push({ name: match[1], path: file.path, isDefault: true })
    }
  }
  return out
}

type ImportedName = { name: string; statementFrom: number; statementTo: number; specifier: string | null }

function importedNames(content: string, isPython: boolean): ImportedName[] {
  const found: ImportedName[] = []
  const masked = stripLiterals(content, isPython)

  if (!isPython) {
    const named = /\bimport\s+(?:type\s+)?\{([^}]*)\}\s*from\s*['"]([^'"]+)['"]/g
    let match: RegExpExecArray | null
    while ((match = named.exec(masked))) {
      const from = match.index
      for (const part of match[1].split(',')) {
        const name = part.trim().split(/\s+as\s+/).pop()?.trim()
        if (name) found.push({ name, statementFrom: from, statementTo: from + match[0].length, specifier: match[2] })
      }
    }
    const single = /\bimport\s+([\w$]+)(?:\s*,\s*\{([^}]*)\})?\s*from\s*['"]([^'"]+)['"]/g
    while ((match = single.exec(masked))) {
      const from = match.index
      found.push({ name: match[1], statementFrom: from, statementTo: from + match[0].length, specifier: match[3] })
      for (const part of (match[2] ?? '').split(',')) {
        const name = part.trim().split(/\s+as\s+/).pop()?.trim()
        if (name) found.push({ name, statementFrom: from, statementTo: from + match[0].length, specifier: match[3] })
      }
    }
    const namespace = /\bimport\s+\*\s+as\s+([\w$]+)\s*from\s*['"]([^'"]+)['"]/g
    while ((match = namespace.exec(masked))) {
      const from = match.index
      found.push({ name: match[1], statementFrom: from, statementTo: from + match[0].length, specifier: match[2] })
    }
  } else {
    const matchAll = /\bfrom\s+([\w.]+)\s+import\s+([^\n]+)/g
    let match: RegExpExecArray | null
    while ((match = matchAll.exec(masked))) {
      const from = match.index
      for (const part of match[2].split(',')) {
        const name = part.trim().split(/\s+as\s+/).pop()?.trim()
        if (name) found.push({ name, statementFrom: from, statementTo: from + match[0].length, specifier: match[1] })
      }
    }
    const plain = /^import\s+([\w.]+)(?:\s+as\s+(\w+))?/gm
    while ((match = plain.exec(masked))) {
      const from = match.index
      found.push({ name: match[2] ?? match[1].split('.')[0], statementFrom: from, statementTo: from + match[0].length, specifier: match[1] })
    }
  }
  return found
}

function importInsertionPoint(content: string): number {
  const lines = content.split('\n')
  let last = -1
  let offset = 0
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index].trim()
    if (/^(import\b|from\s+\S+\s+import\b)/.test(line)) last = index
    else if (line && !line.startsWith('//') && !line.startsWith('#') && !line.startsWith('/*') && last >= 0) break
    offset += lines[index].length + 1
  }
  if (last >= 0) {
    const upTo = lines.slice(0, last + 1).join('\n')
    return upTo.length + 1
  }
  return 0
}

/* ------------------------------------------------------------------------ */
/* the catalogue                                                            */
/* ------------------------------------------------------------------------ */

export function codeActionsFor(context: ActionContext): CodeAction[] {
  const { path, content, pos } = context
  const languageId = languageForPath(path).id
  const isPython = PYTHON.test(path)
  const isJs = JS_LIKE.test(path)
  const isCss = CSS_LIKE.test(path)
  const isMarkup = MARKUP.test(path)
  const line = lineAt(content, pos)
  const masked = stripLiterals(content, isPython)
  const actions: CodeAction[] = []
  const push = (action: CodeAction) => {
    if (!actions.some((existing) => existing.id === action.id)) actions.push(action)
  }

  /* ---- quick fixes ---------------------------------------------------- */

  if (isJs && /\bdebugger\b/.test(line.text)) {
    const from = Math.min(line.start, content.length)
    const to = Math.min(line.end + 1, content.length)
    push({
      id: 'remove-debugger',
      title: 'Remove the debugger statement',
      kind: 'quickfix',
      detail: `line ${line.index + 1}`,
      edits: [{ from, to, insert: '' }],
      cursor: from,
    })
  }

  if (isJs || isPython) {
    const condition = line.text.match(/^\s*(?:if|while|elif)\s*\(?([^):]*?)\)?\s*:?\s*\{?\s*$/)
    if (condition) {
      const body = condition[1]
      const single = body.match(/(^|[^=!<>])=([^=]|$)/)
      if (single && !body.includes('=>')) {
        const eqIndex = line.text.indexOf(body) + (single.index ?? 0) + single[1].length
        push({
          id: 'assignment-in-condition',
          title: isPython ? 'Use == for comparison' : 'Use === for comparison',
          kind: 'quickfix',
          detail: 'assignment inside a condition is probably a typo',
          edits: [{ from: line.start + eqIndex, to: line.start + eqIndex + 1, insert: isPython ? '==' : '===' }],
          cursor: line.start + eqIndex + (isPython ? 2 : 3),
        })
      }
    }
  }

  if (isPython) {
    const header = line.text.match(/^(\s*)(def|class|if|elif|else|for|while|try|except|finally|with|match|case)\b/)
    const trimmed = line.text.replace(/\s+$/, '')
    if (header && trimmed && !trimmed.endsWith(':') && !trimmed.endsWith('\\')) {
      push({
        id: 'python-colon',
        title: `Add the missing “:” after ${header[2]}`,
        kind: 'quickfix',
        detail: `line ${line.index + 1}`,
        edits: [{ from: line.start + trimmed.length, to: line.start + trimmed.length, insert: ':' }],
        cursor: line.start + trimmed.length + 1,
      })
    }
  }

  if (isCss) {
    const trimmed = line.text.replace(/\s+$/, '')
    const before = content.slice(0, line.start)
    const open = (before.match(/\{/g) ?? []).length > (before.match(/\}/g) ?? []).length
    if (open && trimmed.includes(':') && !trimmed.endsWith(';') && !trimmed.endsWith('{') && !trimmed.endsWith('}')) {
      push({
        id: 'css-semicolon',
        title: 'Add the missing “;”',
        kind: 'quickfix',
        detail: `line ${line.index + 1}`,
        edits: [{ from: line.start + trimmed.length, to: line.start + trimmed.length, insert: ';' }],
        cursor: line.start + trimmed.length + 1,
      })
    }
  }

  if (content.includes('\t')) {
    const tabbed = content.split('\n').filter((text) => /^\t+/.test(text)).length
    if (tabbed > 0) {
      push({
        id: 'tabs-to-spaces',
        title: 'Convert indentation to spaces',
        kind: 'quickfix',
        detail: `${tabbed} line${tabbed === 1 ? '' : 's'} indented with tabs`,
        edits: replaceLeadingTabs(content, '  '),
      })
    }
  }

  if (/([ \t]+)$/m.test(content)) {
    const edits: TextEdit[] = []
    let offset = 0
    for (const text of content.split('\n')) {
      const trailing = text.match(/[ \t]+$/)
      if (trailing) {
        edits.push({ from: offset + text.length - trailing[0].length, to: offset + text.length, insert: '' })
      }
      offset += text.length + 1
    }
    push({
      id: 'trim-trailing-whitespace',
      title: 'Trim trailing whitespace',
      kind: 'quickfix',
      detail: `${edits.length} line${edits.length === 1 ? '' : 's'}`,
      edits,
    })
  }

  /* ---- imports -------------------------------------------------------- */

  const fileMap = context.files ?? []
  const exports_ = projectExports(fileMap, path)
  const imported = importedNames(content, isPython)
  const importedSet = new Set(imported.map((item) => item.name))

  if (fileMap.length > 0 && (isJs || isPython)) {
    const tokens = new Set(masked.match(/[A-Za-z_$][\w$]*/g) ?? [])
    const missing: ExportInfo[] = []
    for (const token of tokens) {
      if (GLOBALS.has(token) || importedSet.has(token) || (isPython && PY_KEYWORDS.has(token))) continue
      if (isJs && /^(?:x{0,1}[A-Za-z_$][\w$]*)$/.test(token) && /[A-Za-z]/.test(token) === false) continue
      // property access or object key: not a global name to import
      if (new RegExp(`\\.\\s*${token}\\b`).test(masked)) continue
      if (new RegExp(`\\b${token}\\s*:`).test(masked)) continue
      const declaration = new RegExp(`\\b(?:const|let|var|function|class|def|type|interface|enum|struct|fn)\\s+${token}\\b`).test(masked)
      if (declaration) continue
      const hit = exports_.find((entry) => entry.name === token)
      if (!hit) continue
      if (missing.some((entry) => entry.name === token)) continue
      missing.push(hit)
      if (missing.length >= 4) break
    }

    for (const entry of missing) {
      const specifier = importSpecifier(path, entry.path)
      const statement = isPython
        ? `from ${specifier} import ${entry.name}`
        : entry.isDefault
          ? `import ${entry.name} from '${specifier}'`
          : `import { ${entry.name} } from '${specifier}'`
      const at = importInsertionPoint(content)
      const needsNewline = at === 0 ? content.length > 0 : false
      push({
        id: `import-${entry.name}`,
        title: `Import ${entry.name}`,
        kind: 'import',
        detail: `${statement}`,
        edits: [{ from: at, to: at, insert: needsNewline ? `${statement}\n\n` : `${statement}\n` }],
        cursor: nameUseOffset(masked, entry.name) ?? at + statement.length,
      })
    }
  }

  if (isJs || isPython) {
    const unused = imported.filter((item) => countOccurrences(masked, item.name) <= 1)
    if (unused.length > 0) {
      const edits: TextEdit[] = []
      const byStatement = new Map<string, ImportedName[]>()
      for (const item of unused) {
        const key = `${item.statementFrom}:${item.statementTo}`
        byStatement.set(key, [...(byStatement.get(key) ?? []), item])
      }
      for (const [key, items] of byStatement) {
        const [from, to] = key.split(':').map(Number)
        const statement = content.slice(from, to)
        const names = importedNames(statement, isPython)
        const remaining = names.filter((item) => !items.some((dropped) => dropped.name === item.name))
        if (remaining.length === 0) {
          const withBreak = content[to] === '\n' ? to + 1 : to
          edits.push({ from, to: withBreak, insert: '' })
        } else {
          // rewrite just the specifier list
          const replacement = isPython
            ? statement.replace(/\bimport\s+[^\n]+/, `import ${remaining.map((item) => item.name).join(', ')}`)
            : statement.replace(/\{[^}]*\}/, `{ ${remaining.map((item) => item.name).join(', ')} }`)
          edits.push({ from, to, insert: replacement })
        }
      }
      if (edits.length > 0) {
        push({
          id: 'remove-unused-imports',
          title: unused.length === 1 ? `Remove unused import ${unused[0].name}` : `Remove ${unused.length} unused imports`,
          kind: 'import',
          detail: unused.map((item) => item.name).join(', '),
          edits,
        })
      }
    }
  }

  /* ---- refactors ------------------------------------------------------ */

  if (isJs) {
    const decl = line.text.match(new RegExp(`\\b(let|var)\\s+([A-Za-z_$][\\w$]*)`))
    if (decl) {
      const [, keyword, name] = decl
      const keywordIndex = line.start + (line.text.indexOf(`${keyword} ${name}`))
      // count assignments to the name: the declaration itself is the first, so
      // anything beyond it means the variable really is reassigned
      const assignments = new RegExp(`\\b${name}\\s*(?:\\+\\+|--|\\+=|-=|\\*=|/=|=)(?!=)`, 'g')
      const reassigned = (masked.match(assignments) ?? []).length > 1
      if (keyword === 'let' && !reassigned) {
        push({
          id: 'let-to-const',
          title: `Make ${name} a const`,
          kind: 'refactor',
          detail: 'it is never reassigned',
          edits: [{ from: keywordIndex, to: keywordIndex + 3, insert: 'const' }],
        })
      }
      if (keyword === 'var') {
        push({
          id: 'var-to-let',
          title: `Use let instead of var for ${name}`,
          kind: 'refactor',
          detail: 'block scoping',
          edits: [{ from: keywordIndex, to: keywordIndex + 3, insert: 'let' }],
        })
      }
    }
  }

  if (isJs || isPython) {
    const quote = content[pos] === '"' || content[pos] === "'" ? content[pos] : content[pos - 1]
    if (quote === '"' || quote === "'") {
      const swapped = toggleQuotesAt(content, pos)
      if (swapped) {
        push({
          id: 'toggle-quotes',
          title: swapped.quote === "'" ? 'Use single quotes' : 'Use double quotes',
          kind: 'refactor',
          edits: swapped.edits,
        })
      }
    }
  }

  const selection = context.selection
  if (isJs && selection && selection.to > selection.from) {
    const text = content.slice(selection.from, selection.to)
    const singleLine = !text.includes('\n')
    if (singleLine && text.trim() && !/^\s*(?:import|export)\b/.test(text)) {
      const name = uniqueName(masked, 'extracted')
      const indent = line.text.match(/^\s*/)?.[0] ?? ''
      push({
        id: 'extract-variable',
        title: `Extract to a const named ${name}`,
        kind: 'refactor',
        detail: text.trim().slice(0, 40),
        edits: [
          { from: line.start, to: line.start, insert: `${indent}const ${name} = ${text.trim()}\n` },
          { from: selection.from, to: selection.to, insert: name },
        ],
      })
    }
  }

  const symbol = wordAt(content, pos)
  if (symbol && /^[A-Za-z_$][\w$]*$/.test(symbol.word) && !GLOBALS.has(symbol.word)) {
    const occurrences = countOccurrences(masked, symbol.word)
    if (occurrences > 1) {
      push({
        id: 'rename-symbol',
        title: `Rename ${symbol.word} everywhere`,
        kind: 'refactor',
        detail: `${occurrences} occurrence${occurrences === 1 ? '' : 's'} in this file`,
        edits: [],
        command: { id: 'rename-symbol', name: symbol.word },
      })
    }
  }

  if (isJs || isPython || isMarkup) {
    const missing = missingFiles(content, path, fileMap, isMarkup)
    for (const target of missing) {
      push({
        id: `create-${target}`,
        title: `Create ${target}`,
        kind: 'create',
        detail: 'the import points at a file that does not exist',
        edits: [],
        command: { id: 'create-file', path: target },
      })
    }
  }

  return actions
}

/* ------------------------------------------------------------------------ */
/* where the bulb goes                                                     */
/* ------------------------------------------------------------------------ */

/** Only the actions that belong to one line — used for the gutter bulb. */
const LINE_LOCAL = new Set([
  'remove-debugger',
  'assignment-in-condition',
  'python-colon',
  'css-semicolon',
  'let-to-const',
  'var-to-let',
])

/** A cheap pre-filter: the line *might* hold something worth offering. */
const CANDIDATE =
  /\b(?:debugger|let|var)\b|^\s*(?:def|class|if|elif|else|for|while|try|except|finally|with|match|case)\b|\b(?:if|elif|while)\s*\(/

/**
 * The lines that should show a small bulb, derived from the same catalogue the
 * sheet uses — never a second, drifting copy of the rules. The scan is bounded
 * (candidate lines only, one probe each) so it can run on every edit.
 */
export function actionMarkers(context: Omit<ActionContext, 'pos' | 'selection'>): ActionMarker[] {
  const { path, content } = context
  const isCss = CSS_LIKE.test(path)
  const found = new Map<number, { column: number; count: number; hasFix: boolean }>()

  const note = (offset: number, actions: CodeAction[]) => {
    if (actions.length === 0) return
    const line = lineAt(content, offset)
    const column = offset - line.start + 1
    const previous = found.get(line.index)
    found.set(line.index, {
      column: Math.min(previous?.column ?? column, column),
      count: (previous?.count ?? 0) + actions.length,
      hasFix: (previous?.hasFix ?? false) || actions.some((action) => action.kind === 'quickfix'),
    })
  }

  // One probe at the top of the file gets the whole-file offers (imports); their
  // own offsets say which line each one belongs to.
  const head = codeActionsFor({ ...context, pos: 0 })
  note(0, head.filter((action) => LINE_LOCAL.has(action.id)))
  for (const action of head) {
    if (action.id.startsWith('import-') && action.kind === 'import') {
      note(action.cursor ?? 0, [action])
    } else if (action.id === 'remove-unused-imports') {
      for (const edit of action.edits) note(edit.from, [action])
    }
  }

  let offset = 0
  for (const text of content.split('\n')) {
    const candidate = CANDIDATE.test(text) || (isCss && /:/.test(text) && !/[;{}]\s*$/.test(text))
    if (candidate && offset > 0) {
      const at = offset + Math.max(0, text.search(/\S/))
      const actions = codeActionsFor({ ...context, pos: at })
      note(at, actions.filter((action) => LINE_LOCAL.has(action.id)))
    }
    offset += text.length + 1
  }

  return [...found.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([index, info]) => ({ line: index + 1, column: info.column, count: info.count, hasFix: info.hasFix }))
}

/* ------------------------------------------------------------------------ */
/* helpers used by the catalogue                                            */
/* ------------------------------------------------------------------------ */

function replaceLeadingTabs(content: string, unit: string): TextEdit[] {
  const edits: TextEdit[] = []
  let offset = 0
  for (const text of content.split('\n')) {
    const match = text.match(/^\t+/)
    if (match) edits.push({ from: offset, to: offset + match[0].length, insert: unit.repeat(match[0].length) })
    offset += text.length + 1
  }
  return edits
}

function uniqueName(masked: string, base: string): string {
  if (!new RegExp(`\\b${base}\\b`).test(masked)) return base
  let index = 2
  while (new RegExp(`\\b${base}${index}\\b`).test(masked)) index += 1
  return `${base}${index}`
}

function nameUseOffset(masked: string, name: string): number | null {
  const re = new RegExp(`\\b${name}\\b`)
  const match = re.exec(masked)
  return match ? match.index : null
}

/** Swap the quotes of the string literal the caret is inside. */
function toggleQuotesAt(content: string, pos: number): { quote: string; edits: TextEdit[] } | null {
  const lineStart = content.lastIndexOf('\n', Math.max(0, pos - 1)) + 1
  const lineEnd = content.indexOf('\n', pos) === -1 ? content.length : content.indexOf('\n', pos)
  const line = content.slice(lineStart, lineEnd)
  const caret = pos - lineStart
  for (const quote of ['"', "'"]) {
    for (let start = line.indexOf(quote); start !== -1; start = line.indexOf(quote, start + 1)) {
      const end = line.indexOf(quote, start + 1)
      if (end === -1) break
      if (caret < start || caret > end + 1) continue
      const inner = line.slice(start + 1, end)
      const other = quote === '"' ? "'" : '"'
      if (inner.includes(other)) continue
      const swapped = `${other}${inner.replace(new RegExp(`\\\\${quote}`, 'g'), quote)}${other}`
      return {
        quote: other,
        edits: [{ from: lineStart + start, to: lineStart + end + 1, insert: swapped }],
      }
    }
  }
  return null
}

/** Relative imports and script srcs that point at files the project lacks. */
function missingFiles(content: string, path: string, files: ProjectFile[], isMarkup: boolean): string[] {
  if (files.length === 0) return []
  const known = new Set(files.map((file) => file.path))
  const directory = dirName(path)
  const candidates: string[] = []

  const specifiers = /(?:from\s*|require\(\s*|import\s*\(\s*)['"](\.\.?\/[^'"]+)['"]/g
  let match: RegExpExecArray | null
  while ((match = specifiers.exec(content))) candidates.push(match[1])
  if (isMarkup) {
    const srcs = /(?:src|href)\s*=\s*["'](\.\.?\/[^"']+)["']/g
    while ((match = srcs.exec(content))) candidates.push(match[1])
  }

  const missing: string[] = []
  for (const specifier of candidates) {
    const target = normalizePath(directory ? `${directory}/${specifier}` : specifier)
    if (!target || known.has(target)) continue
    const withExtension = ['.js', '.ts', '.tsx', '.jsx', '.mjs', '.css', '.json'].some((ext) => known.has(`${target}${ext}`))
    if (withExtension) continue
    if (missing.includes(target)) continue
    missing.push(target)
    if (missing.length >= 3) break
  }
  return missing
}

/* ------------------------------------------------------------------------ */
/* rename + apply                                                           */
/* ------------------------------------------------------------------------ */

/** Every whole-word occurrence of `from`, so a rename is one transaction. */
export function renameEdits(content: string, from: string, to: string): TextEdit[] {
  const edits: TextEdit[] = []
  const re = new RegExp(`\\b${from.replace(/[$]/g, '\\$')}\\b`, 'g')
  let match: RegExpExecArray | null
  while ((match = re.exec(content))) edits.push({ from: match.index, to: match.index + from.length, insert: to })
  return edits
}

