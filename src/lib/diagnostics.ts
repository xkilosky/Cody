/**
 * Cody's bug detector.
 *
 * Everything here runs on the phone, offline, with no server: real parsers where
 * the bundle already has one (Sucrase for JS/TS/JSX/TSX, JSON.parse for JSON),
 * plus structural checks that apply to every other language — unbalanced
 * brackets, unterminated strings and comments, HTML/XML tag matching, Python
 * block indentation — and project-wide checks that catch the bugs a parser
 * cannot see, like an import pointing at a file that does not exist.
 *
 * The rule is simple: only report things that are *wrong*, never style
 * preferences, and never guess. A false alarm on a phone is worse than a missed
 * warning, because it teaches people to ignore the squiggles.
 */
import { transform } from 'sucrase'
import { languageForPath } from './languages'
import { dirName, normalizePath } from './utils'
import { extensionOf } from './languages'
import type { ProjectFile } from '../types'

export type Severity = 'error' | 'warning'

export type Diagnostic = {
  path: string
  /** 1-based */
  line: number
  /** 1-based; used for the squiggle start */
  column: number
  /** 1-based, exclusive end column on the same line */
  endColumn: number
  severity: Severity
  message: string
  /** Short machine-ish id, shown in the problems sheet. */
  rule: string
}

const MAX_REPORTED = 60

/* ------------------------------------------------------------------ */
/* helpers                                                             */
/* ------------------------------------------------------------------ */

function lineStarts(text: string): number[] {
  const starts = [0]
  for (let i = 0; i < text.length; i += 1) if (text[i] === '\n') starts.push(i + 1)
  return starts
}

/** Offset -> { line, column } (both 1-based). */
function positionAt(text: string, offset: number): { line: number; column: number } {
  const starts = lineStarts(text)
  let low = 0
  let high = starts.length - 1
  while (low < high) {
    const mid = Math.ceil((low + high) / 2)
    if (starts[mid] <= offset) low = mid
    else high = mid - 1
  }
  return { line: low + 1, column: offset - starts[low] + 1 }
}

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value))

function make(
  path: string,
  line: number,
  column: number,
  message: string,
  rule: string,
  severity: Severity = 'error',
  endColumn?: number,
  lineText?: string,
): Diagnostic {
  const width = lineText ? Math.max(1, lineText.trimEnd().length - column + 1) : 1
  return {
    path,
    line,
    column: Math.max(1, column),
    endColumn: Math.max(Math.max(1, column) + 1, endColumn ?? (lineText ? column + width : column + 1)),
    severity,
    message,
    rule,
  }
}

/* ------------------------------------------------------------------ */
/* language syntax table                                               */
/* ------------------------------------------------------------------ */

type SyntaxConfig = {
  line: string[]
  block: [string, string][]
  quotes: string[]
}

const C_LIKE: SyntaxConfig = {
  line: ['//'],
  block: [['/*', '*/']],
  quotes: ["'", '"', '`'],
}

const SYNTAX: Record<string, SyntaxConfig> = {
  javascript: C_LIKE,
  typescript: C_LIKE,
  tsx: C_LIKE,
  jsx: C_LIKE,
  c: { line: ['//'], block: [['/*', '*/']], quotes: ["'", '"'] },
  cpp: { line: ['//'], block: [['/*', '*/']], quotes: ["'", '"'] },
  java: { line: ['//'], block: [['/*', '*/']], quotes: ["'", '"'] },
  csharp: { line: ['//'], block: [['/*', '*/']], quotes: ["'", '"'] },
  go: { line: ['//'], block: [['/*', '*/']], quotes: ['"', '`'] },
  // Rust has lifetimes ('a), so a lone quote is not a string.
  rust: { line: ['//'], block: [['/*', '*/']], quotes: ['"'] },
  swift: { line: ['//'], block: [['/*', '*/']], quotes: ['"'] },
  kotlin: { line: ['//'], block: [['/*', '*/']], quotes: ['"'] },
  php: { line: ['//', '#'], block: [['/*', '*/']], quotes: ["'", '"'] },
  python: { line: ['#'], block: [], quotes: ["'", '"'] },
  ruby: { line: ['#'], block: [], quotes: ["'", '"'] },
  shell: { line: ['#'], block: [], quotes: ["'", '"'] },
  lua: { line: ['--'], block: [['--[[', ']]']], quotes: ["'", '"'] },
  sql: { line: ['--'], block: [['/*', '*/']], quotes: ["'", '"'] },
  css: { line: [], block: [['/*', '*/']], quotes: ["'", '"'] },
  json: { line: [], block: [], quotes: ['"'] },
  yaml: { line: ['#'], block: [], quotes: [] },
  toml: { line: ['#'], block: [], quotes: [] },
  dockerfile: { line: ['#'], block: [], quotes: [] },
  markdown: { line: [], block: [], quotes: [] },
  diff: { line: [], block: [], quotes: [] },
  text: { line: [], block: [], quotes: [] },
  html: { line: [], block: [['<!--', '-->']], quotes: [] },
  xml: { line: [], block: [['<!--', '-->']], quotes: [] },
}

const PAIRS: Record<string, string> = { '(': ')', '[': ']', '{': '}' }
const OPENERS: Record<string, string> = { ')': '(', ']': '[', '}': '{' }

/** Strips comments and strings so bracket counting cannot be fooled by prose. */
function stripLiterals(text: string, config: SyntaxConfig): { clean: string; unterminated?: { offset: number; what: string } } {
  const out: string[] = []
  let i = 0
  let unterminated: { offset: number; what: string } | undefined

  outer: while (i < text.length) {
    for (const [open, close] of config.block) {
      if (text.startsWith(open, i)) {
        const end = text.indexOf(close, i + open.length)
        if (end === -1) {
          unterminated = { offset: i, what: `Unterminated comment — missing ${close}` }
          out.push(' '.repeat(Math.max(0, text.length - i)))
          break outer
        }
        const chunk = text.slice(i, end + close.length).replace(/[^\n]/g, ' ')
        out.push(chunk)
        i = end + close.length
        continue outer
      }
    }
    for (const marker of config.line) {
      if (text.startsWith(marker, i) && (i === 0 || text[i - 1] !== '\\')) {
        const end = text.indexOf('\n', i)
        if (end === -1) {
          out.push(' '.repeat(text.length - i))
          i = text.length
        } else {
          out.push(' '.repeat(end - i))
          i = end
        }
        continue outer
      }
    }
    for (const quote of config.quotes) {
      if (text[i] === quote) {
        let j = i + 1
        let closed = false
        while (j < text.length) {
          if (text[j] === '\\') {
            j += 2
            continue
          }
          if (text[j] === quote) {
            closed = true
            break
          }
          // single/double quoted strings end at the line break in every
          // language we support; backticks do not
          if (text[j] === '\n' && quote !== '`') break
          j += 1
        }
        if (!closed && quote !== '`' && text[j] !== quote) {
          // only complain when the quote runs to the end of the file: a
          // multi-line string is much more likely than a typo mid-file
          if (j >= text.length - 1) unterminated ??= { offset: i, what: `Unterminated string — missing closing ${quote}` }
        }
        const end = Math.min(j + 1, text.length)
        out.push(text.slice(i, end).replace(/[^\n]/g, ' '))
        i = end
        continue outer
      }
    }
    out.push(text[i])
    i += 1
  }

  return { clean: out.join(''), unterminated }
}

function checkBrackets(path: string, content: string, languageId: string): Diagnostic[] {
  const config = SYNTAX[languageId]
  if (!config) return []
  const { clean, unterminated } = stripLiterals(content, config)
  const found: Diagnostic[] = []
  const lines = content.split('\n')

  if (unterminated) {
    const { line, column } = positionAt(content, unterminated.offset)
    found.push(make(path, line, column, unterminated.what, 'unterminated', 'error', undefined, lines[line - 1]))
  }

  const stack: { char: string; offset: number }[] = []
  for (let i = 0; i < clean.length; i += 1) {
    const char = clean[i]
    if (PAIRS[char]) {
      stack.push({ char, offset: i })
    } else if (OPENERS[char]) {
      const top = stack[stack.length - 1]
      if (!top) {
        const { line, column } = positionAt(content, i)
        found.push(make(path, line, column, `Unexpected “${char}” with nothing open`, 'brackets', 'error', undefined, lines[line - 1]))
      } else if (top.char !== OPENERS[char]) {
        const { line, column } = positionAt(content, i)
        const opened = positionAt(content, top.offset)
        found.push(
          make(
            path,
            line,
            column,
            `“${char}” closes the “${top.char}” opened on line ${opened.line}`,
            'brackets',
            'error',
            undefined,
            lines[line - 1],
          ),
        )
        stack.pop()
      } else {
        stack.pop()
      }
    }
  }
  for (const left of stack) {
    const { line, column } = positionAt(content, left.offset)
    found.push(
      make(path, line, column, `“${left.char}” is never closed — missing “${PAIRS[left.char]}”`, 'brackets', 'error', undefined, lines[line - 1]),
    )
  }
  return found
}

/* ------------------------------------------------------------------ */
/* JavaScript / TypeScript (real parser)                               */
/* ------------------------------------------------------------------ */

const SUCraseTransforms = {
  javascript: [] as const,
  jsx: ['jsx'] as const,
  typescript: ['typescript'] as const,
  tsx: ['typescript', 'jsx'] as const,
}

function checkScript(path: string, content: string, languageId: string): Diagnostic[] {
  const found: Diagnostic[] = []
  const lines = content.split('\n')
  const transforms = [...(SUCransformsFor(languageId) as unknown as string[])] as never[]

  try {
    transform(content, { transforms: transforms as never, disableESTransforms: true })
  } catch (error) {
    const err = error as Error & { loc?: { line: number; column: number } }
    const message = err.message.replace(/\s*\(\d+:\d+\)\s*$/, '')
    const line = clamp(err.loc?.line ?? 1, 1, Math.max(1, lines.length))
    const column = clamp(err.loc?.column ?? 1, 1, Math.max(1, (lines[line - 1] ?? '').length))
    found.push(make(path, line, column, message, 'syntax', 'error', undefined, lines[line - 1]))
    // one parser error is enough: later ones are usually cascades
    return found
  }

  // A parser is happy with these, but they are still almost always mistakes.
  lines.forEach((text, index) => {
    const line = index + 1
    if (/^\s*debugger\b/.test(text)) {
      found.push(make(path, line, text.indexOf('debugger') + 1, 'Leftover “debugger” statement will pause the app', 'debugger', 'warning'))
    }
    const assignment = conditionOf(text)
    if (assignment && /(^|[^=!<>+\-*/%&|^])=([^=]|$)/.test(assignment) && !assignment.includes('=>')) {
      found.push(
        make(path, line, text.indexOf('=') + 1, 'Assignment inside a condition — did you mean “===”?', 'condition-assignment', 'warning'),
      )
    }
  })

  return found
}

/** The text between the parens of `if (...)` / `while (...)`, string literals removed. */
function conditionOf(line: string): string | null {
  const start = line.match(/^\s*(?:if|while)\s*\(/)
  if (!start) return null
  const from = start.index! + start[0].length
  let depth = 1
  let end = -1
  for (let i = from; i < line.length; i += 1) {
    if (line[i] === '(') depth += 1
    else if (line[i] === ')') {
      depth -= 1
      if (depth === 0) {
        end = i
        break
      }
    }
  }
  const body = end === -1 ? line.slice(from) : line.slice(from, end)
  return body.replace(/'[^']*'|"[^"]*"|`[^`]*`/g, "''")
}

function SUCransformsFor(languageId: string) {
  return SUCraseTransforms[languageId as keyof typeof SUCraseTransforms] ?? []
}

/* ------------------------------------------------------------------ */
/* JSON                                                                */
/* ------------------------------------------------------------------ */

function checkJson(path: string, content: string): Diagnostic[] {
  if (!content.trim()) return []
  const lines = content.split('\n')
  try {
    JSON.parse(content)
    return []
  } catch (error) {
    const message = (error as Error).message
    const offset = Number(message.match(/position (\d+)/)?.[1] ?? 0)
    const { line, column } = positionAt(content, clamp(offset, 0, Math.max(0, content.length - 1)))
    const cleaned = message.replace(/\s+in JSON at position \d+.*$/, '').replace(/^JSON\.parse: /, '')
    return [make(path, line, column, cleaned, 'json', 'error', undefined, lines[line - 1])]
  }
}

/* ------------------------------------------------------------------ */
/* HTML / XML                                                          */
/* ------------------------------------------------------------------ */

const VOID_TAGS = new Set([
  'area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'param', 'source', 'track', 'wbr',
])

/** Tags whose end may legally be omitted in HTML. */
const OPTIONAL_END = new Set([
  'p', 'li', 'dt', 'dd', 'tr', 'td', 'th', 'thead', 'tbody', 'tfoot', 'option', 'optgroup', 'colgroup', 'rt', 'rp',
])

const TAG_RE =
  /<!--[\s\S]*?-->|<!\[CDATA\[[\s\S]*?\]\]>|<\?[\s\S]*?\?>|<![a-zA-Z][^>]*>|<\/([a-zA-Z][\w:.-]*)\s*>|<([a-zA-Z][\w:.-]*)((?:"[^"]*"|'[^']*'|[^>"'])*)>/g

function checkMarkup(path: string, content: string, languageId: string): Diagnostic[] {
  const found: Diagnostic[] = []
  const lines = content.split('\n')
  const stack: { name: string; offset: number }[] = []
  const html = languageId === 'html'
  let match: RegExpExecArray | null

  TAG_RE.lastIndex = 0
  while ((match = TAG_RE.exec(content))) {
    const [raw, closing, opening, attrs] = match
    if (raw.startsWith('<!') || raw.startsWith('<?')) continue

    if (closing) {
      const name = closing.toLowerCase()
      const index = [...stack].reverse().findIndex((entry) => entry.name === name)
      if (index === -1) {
        const { line, column } = positionAt(content, match.index)
        found.push(make(path, line, column, `Closing </${closing}> has no opening tag`, 'tags', 'error', undefined, lines[line - 1]))
        continue
      }
      const distance = index + 1
      while (stack.length > 0 && stack[stack.length - 1].name !== name) {
        const unclosed = stack.pop()!
        if (html && OPTIONAL_END.has(unclosed.name)) continue
        const at = positionAt(content, unclosed.offset)
        found.push(
          make(
            path,
            at.line,
            at.column,
            `<${unclosed.name}> is never closed (found </${closing}> on line ${positionAt(content, match.index).line})`,
            'tags',
            'error',
            undefined,
            lines[at.line - 1],
          ),
        )
      }
      if (stack.length > 0) stack.pop()
      void distance
      continue
    }

    if (!opening) continue
    const name = opening.toLowerCase()
    const isSelfClosing = /\/\s*$/.test(attrs ?? '')
    if (isSelfClosing || (html && VOID_TAGS.has(name))) continue
    stack.push({ name, offset: match.index })

    if (html && (name === 'script' || name === 'style')) {
      const close = content.toLowerCase().indexOf(`</${name}`, TAG_RE.lastIndex)
      if (close !== -1) {
        const end = content.indexOf('>', close)
        if (end !== -1) {
          TAG_RE.lastIndex = end + 1
          stack.pop()
        }
      }
    }
  }

  for (const unclosed of stack) {
    if (html && OPTIONAL_END.has(unclosed.name)) continue
    const at = positionAt(content, unclosed.offset)
    found.push(make(path, at.line, at.column, `<${unclosed.name}> is never closed`, 'tags', 'error', undefined, lines[at.line - 1]))
  }

  return found
}

/* ------------------------------------------------------------------ */
/* CSS                                                                 */
/* ------------------------------------------------------------------ */

function checkCss(path: string, content: string): Diagnostic[] {
  const found = checkBrackets(path, content, 'css')
  if (found.length > 0) return found
  const lines = content.split('\n')
  lines.forEach((text, index) => {
    const trimmed = text.trim()
    // `color: red` without a semicolon before `}` silently merges declarations
    if (trimmed && !/[;{}:,]\s*$/.test(trimmed) && !trimmed.startsWith('//') && !trimmed.startsWith('*') && !trimmed.startsWith('@')) {
      const next = (lines[index + 1] ?? '').trim()
      if (next && /^[a-zA-Z-]+\s*:/.test(next) && /^[a-zA-Z-]+\s*:/.test(trimmed)) {
        found.push(make(path, index + 1, text.length, 'Missing semicolon — the next declaration will swallow this one', 'css-semicolon', 'warning'))
      }
    }
  })
  return found
}

/* ------------------------------------------------------------------ */
/* Python                                                              */
/* ------------------------------------------------------------------ */

const PY_BLOCK = /^\s*(def|class|if|elif|else|for|while|try|except|finally|with|match|case)\b/

function checkPython(path: string, content: string): Diagnostic[] {
  const found = checkBrackets(path, content, 'python')
  const lines = content.split('\n')
  let depth = 0

  // TabError is about consistency across the file, not within one line.
  const indentStyles = lines
    .map((text, index) => ({ index, indent: text.match(/^[ \t]*/)?.[0] ?? '', body: text.trim() }))
    .filter((entry) => entry.body && entry.indent)
  const usesTabs = indentStyles.some((entry) => entry.indent.includes('\t'))
  const usesSpaces = indentStyles.some((entry) => !entry.indent.includes('\t') && entry.indent.includes(' '))
  if (usesTabs && usesSpaces) {
    const firstTab = indentStyles.find((entry) => entry.indent.includes('\t'))!
    const text = lines[firstTab.index]
    found.push(
      make(path, firstTab.index + 1, 1, 'Indented with tabs while the rest of the file uses spaces — Python raises TabError', 'indentation', 'error', undefined, text),
    )
  }

  lines.forEach((text, index) => {
    const line = index + 1
    const trimmed = text.trim()
    const indent = text.match(/^[ \t]*/)?.[0] ?? ''

    if (indent.includes('\t') && indent.includes(' ')) {
      found.push(make(path, line, 1, 'Mixed tabs and spaces — Python will raise TabError', 'indentation', 'error', undefined, text))
    }

    const beforeComment = text.replace(/#.*$/, '')
    const stripped = beforeComment.trim()

    if (depth === 0 && PY_BLOCK.test(beforeComment) && stripped && !stripped.endsWith(':') && !stripped.endsWith(',') && !stripped.endsWith('\\')) {
      const keyword = stripped.match(PY_BLOCK)![1]
      found.push(
        make(path, line, beforeComment.length, `“${keyword}” block is missing its “:”`, 'python-colon', 'error', undefined, text),
      )
    }

    if (/^\s*(if|elif|while)\b/.test(beforeComment)) {
      const condition = beforeComment.replace(/^\s*(if|elif|while)\b/, '').replace(/:\s*$/, '')
      if (/(^|[^=!<>+\-*/%&|^:])=([^=]|$)/.test(condition) && !condition.includes('==')) {
        found.push(
          make(path, line, text.indexOf('=') + 1, 'Assignment inside a condition — did you mean “==”?', 'condition-assignment', 'warning'),
        )
      }
    }

    for (const char of beforeComment) {
      if (PAIRS[char]) depth += 1
      else if (OPENERS[char]) depth = Math.max(0, depth - 1)
    }
  })

  return found
}

/* ------------------------------------------------------------------ */
/* project-wide checks                                                 */
/* ------------------------------------------------------------------ */

const SPECIFIER_RE = /(?:\bfrom\s*|\bimport\s*|\bimport\(\s*|\brequire\(\s*|\brequire_once\s*)(['"])([^'"\n]+)\1/g
const HTML_SRC_RE = /\b(?:src|href)\s*=\s*(['"])([^'"]+)\1/g
const CSS_IMPORT_RE = /@import\s+(?:url\(\s*)?(['"])([^'"]+)\1/g

function resolveIn(files: Map<string, ProjectFile>, fromPath: string, spec: string): string | null {
  if (!spec.startsWith('.')) return null
  const base = normalizePath(`${dirName(fromPath)}/${spec}`)
  const candidates = [base]
  if (!extensionOf(base)) {
    for (const ext of ['.js', '.ts', '.tsx', '.jsx', '.mjs', '.json', '.css']) candidates.push(base + ext)
    for (const ext of ['.js', '.ts', '.tsx', '.jsx', '.mjs', '.json']) candidates.push(`${base}/index${ext}`)
  }
  for (const candidate of candidates) if (files.has(candidate)) return candidate
  return null
}

function checkImports(files: Map<string, ProjectFile>, path: string, content: string, languageId: string): Diagnostic[] {
  const found: Diagnostic[] = []
  const lines = content.split('\n')
  const test =
    languageId === 'html' || languageId === 'xml'
      ? HTML_SRC_RE
      : languageId === 'css'
        ? CSS_IMPORT_RE
        : languageId === 'javascript' || languageId === 'typescript' || languageId === 'tsx' || languageId === 'jsx'
          ? SPECIFIER_RE
          : null
  if (!test) return found

  const seen = new Set<string>()
  test.lastIndex = 0
  let match: RegExpExecArray | null
  while ((match = test.exec(content))) {
    const spec = match[2].trim()
    if (!spec || /^(https?:|data:|blob:|\/\/|#|mailto:)/.test(spec)) continue
    if (languageId === 'html' && !/\.(m?[jt]sx?|css|json|svg|png|jpe?g|gif|webp|txt)$/i.test(spec)) continue
    const key = `${spec}@${match.index}`
    if (seen.has(key)) continue
    seen.add(key)
    if (resolveIn(files, path, spec)) continue
    const { line, column } = positionAt(content, match.index)
    found.push(
      make(
        path,
        line,
        column + Math.max(0, lines[line - 1].indexOf(spec)),
        `“${spec}” does not match any file in this project`,
        'missing-import',
        'error',
        undefined,
        lines[line - 1],
      ),
    )
  }
  return found
}

/* ------------------------------------------------------------------ */
/* public API                                                          */
/* ------------------------------------------------------------------ */

/** Bugs in a single file. `files` enables cross-file checks (missing imports). */
export function analyzeFile(path: string, content: string, files?: ProjectFile[]): Diagnostic[] {
  const languageId = languageForPath(path).id
  const map = files ? new Map(files.map((file) => [file.path, file])) : new Map<string, ProjectFile>([[path, { path, content }]])
  let found: Diagnostic[] = []

  switch (languageId) {
    case 'javascript':
    case 'typescript':
    case 'tsx':
    case 'jsx':
      found = checkScript(path, content, languageId)
      break
    case 'json':
      found = checkJson(path, content)
      break
    case 'html':
    case 'xml':
      found = checkMarkup(path, content, languageId)
      break
    case 'css':
      found = checkCss(path, content)
      break
    case 'python':
      found = checkPython(path, content)
      break
    default:
      found = checkBrackets(path, content, languageId)
  }

  const imports = checkImports(map, path, content, languageId)
  const known = new Set(found.map((d) => `${d.line}:${d.column}:${d.rule}`))
  for (const diagnostic of imports) {
    if (!known.has(`${diagnostic.line}:${diagnostic.column}:${diagnostic.rule}`)) found.push(diagnostic)
  }

  return found
    .sort((a, b) => a.line - b.line || a.column - b.column)
    .slice(0, MAX_REPORTED)
}

/** Bugs across the whole project, most severe first. */
export function analyzeProject(files: ProjectFile[]): Diagnostic[] {
  const found: Diagnostic[] = []
  for (const file of files) {
    if (file.content.length > 400_000) continue
    found.push(...analyzeFile(file.path, file.content, files))
  }
  const order = (d: Diagnostic) => (d.severity === 'error' ? 0 : 1)
  return found.sort((a, b) => order(a) - order(b) || a.path.localeCompare(b.path) || a.line - b.line)
}

export function countBySeverity(diagnostics: Diagnostic[]): { errors: number; warnings: number } {
  return diagnostics.reduce(
    (total, diagnostic) => {
      if (diagnostic.severity === 'error') total.errors += 1
      else total.warnings += 1
      return total
    },
    { errors: 0, warnings: 0 },
  )
}
