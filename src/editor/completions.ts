/**
 * Smart completions.
 *
 * The suggestion list has to be about *this* code: the variables, functions,
 * classes and members the file actually declares, the members of whatever is on
 * the left of the dot, and the exports of the other files in the project.
 *
 * There is no type checker in a phone-sized bundle, so the index is built from
 * a token scan of the source with literals and comments blanked out. That is the
 * same trade-off VS Code makes for its word-based suggestions: fast, offline and
 * always available, never wrong about spelling because it only reports names
 * that really appear in your code.
 */
import type { ProjectFile } from '../types'

export type SuggestionType =
  | 'variable'
  | 'function'
  | 'class'
  | 'property'
  | 'method'
  | 'keyword'
  | 'text'
  | 'type'
  | 'constant'
  | 'namespace'

export type Suggestion = {
  label: string
  type: SuggestionType
  /** Shown on the right of the row: a signature, a source path, a type. */
  detail?: string
  /** Longer description shown when the row is focused. */
  info?: string
  /** Higher sorts first. */
  boost?: number
}

export type SymbolIndex = {
  family: 'js' | 'python' | 'generic'
  /** Variables, functions, classes and types declared in the file. */
  declarations: Suggestion[]
  byName: Map<string, Suggestion>
  /** Members of object literals, keyed by the variable holding them. */
  objectMembers: Map<string, Suggestion[]>
  /** Members of classes, keyed by class name. */
  classMembers: Map<string, Suggestion[]>
  /** `const cart = new Cart()` → cart → Cart */
  instanceOf: Map<string, string>
  /** Primitive-ish shape guessed from the initialiser: string, array, number… */
  kindOf: Map<string, string>
  /** Class bodies, so `this.` can be resolved from the caret position. */
  classRanges: Array<{ name: string; from: number; to: number }>
  keywords: Suggestion[]
}

export type CompletionOptions = {
  languageId: string
  /** Other files in the project, for cross-file suggestions. */
  files?: ProjectFile[]
  /** Path of the file being edited. */
  path?: string
}

export type CompletionResult = { from: number; options: Suggestion[] }

const IDENT = '[A-Za-z_$][\\w$]*'
const CALLABLE = new Set<SuggestionType>(['function', 'method'])

/* ------------------------------------------------------------------------ */
/* blanking literals and comments                                            */
/* ------------------------------------------------------------------------ */

/**
 * Replace the *contents* of strings and comments with spaces, keeping every
 * offset intact (newlines included) so positions still line up with the source.
 * This is what stops `const name = "function fake() {}"` from being indexed.
 */
export function stripLiterals(code: string, hashComments = false): string {
  const out = code.split('')
  let index = 0
  const blank = (from: number, to: number) => {
    for (let i = from; i < to; i += 1) if (out[i] !== '\n') out[i] = ' '
  }
  while (index < code.length) {
    const char = code[index]
    const next = code[index + 1]

    if (char === '/' && next === '/') {
      const end = code.indexOf('\n', index)
      const stop = end === -1 ? code.length : end
      blank(index, stop)
      index = stop
      continue
    }
    if (char === '/' && next === '*') {
      const end = code.indexOf('*/', index + 2)
      const stop = end === -1 ? code.length : end + 2
      blank(index, stop)
      index = stop
      continue
    }
    if (hashComments && char === '#') {
      const end = code.indexOf('\n', index)
      const stop = end === -1 ? code.length : end
      blank(index, stop)
      index = stop
      continue
    }
    if (char === '"' || char === "'" || char === '`') {
      // Python's triple-quoted strings
      if (hashComments && code.startsWith(char.repeat(3), index)) {
        const end = code.indexOf(char.repeat(3), index + 3)
        const stop = end === -1 ? code.length : end + 3
        blank(index, stop)
        index = stop
        continue
      }
      let cursor = index + 1
      while (cursor < code.length) {
        if (code[cursor] === '\\') {
          cursor += 2
          continue
        }
        // a template literal may not span raw newlines safely, but a stray
        // quote never should: stop at the end of the line for ' and "
        if (code[cursor] === char) break
        if (char !== '`' && code[cursor] === '\n') break
        cursor += 1
      }
      blank(index + 1, cursor)
      index = cursor + 1
      continue
    }
    index += 1
  }
  return out.join('')
}

/* ------------------------------------------------------------------------ */
/* language families                                                         */
/* ------------------------------------------------------------------------ */

type Family = 'js' | 'python' | 'generic'

/**
 * Markup and data files already have excellent completions from their language
 * packages (tags, attributes, CSS properties). Our code index would only add
 * noise like `if`/`for` while you are typing a tag, so it stays out of the way.
 */
const LANGUAGE_HANDLES_ITSELF = new Set([
  'html', 'xml', 'css', 'scss', 'sass', 'less', 'json', 'jsonc', 'yaml', 'toml',
  'markdown', 'md', 'dockerfile', 'diff', 'text', 'plain', 'gitignore', 'env',
])

function familyOf(languageId: string): Family {
  if (['javascript', 'typescript', 'jsx', 'tsx', 'json'].includes(languageId)) return 'js'
  if (languageId === 'python') return 'python'
  return 'generic'
}

const KEYWORDS: Record<Family, string[]> = {
  js: [
    'const', 'let', 'var', 'function', 'return', 'if', 'else', 'for', 'while', 'do', 'switch', 'case',
    'break', 'continue', 'class', 'extends', 'super', 'new', 'this', 'try', 'catch', 'finally', 'throw',
    'typeof', 'instanceof', 'in', 'of', 'async', 'await', 'yield', 'import', 'export', 'default', 'from',
    'null', 'undefined', 'true', 'false', 'interface', 'type', 'enum', 'implements', 'readonly',
    'public', 'private', 'protected', 'static', 'get', 'set', 'void', 'never', 'unknown', 'any',
  ],
  python: [
    'def', 'class', 'return', 'if', 'elif', 'else', 'for', 'while', 'break', 'continue', 'import',
    'from', 'as', 'with', 'try', 'except', 'finally', 'raise', 'lambda', 'yield', 'global', 'nonlocal',
    'assert', 'pass', 'in', 'is', 'not', 'and', 'or', 'None', 'True', 'False', 'async', 'await', 'del',
  ],
  generic: [
    'if', 'else', 'for', 'while', 'return', 'break', 'continue', 'switch', 'case', 'default', 'class',
    'struct', 'enum', 'interface', 'func', 'fn', 'def', 'let', 'var', 'val', 'const', 'import', 'package',
    'public', 'private', 'protected', 'static', 'void', 'new', 'this', 'self', 'true', 'false', 'null',
    'nil', 'None', 'try', 'catch', 'finally', 'throw', 'raise', 'match', 'impl', 'trait', 'use', 'mod',
  ],
}

/* ------------------------------------------------------------------------ */
/* built-in members                                                          */
/* ------------------------------------------------------------------------ */

const member = (label: string, type: SuggestionType, detail?: string): Suggestion => ({ label, type, detail })

const stringMembers = [
  member('length', 'property', 'number'),
  member('charAt', 'method', '(index)'),
  member('includes', 'method', '(search)'),
  member('indexOf', 'method', '(search)'),
  member('lastIndexOf', 'method', '(search)'),
  member('slice', 'method', '(start, end)'),
  member('split', 'method', '(separator)'),
  member('replace', 'method', '(search, value)'),
  member('replaceAll', 'method', '(search, value)'),
  member('startsWith', 'method', '(search)'),
  member('endsWith', 'method', '(search)'),
  member('toUpperCase', 'method', '()'),
  member('toLowerCase', 'method', '()'),
  member('trim', 'method', '()'),
  member('padStart', 'method', '(length, pad)'),
  member('repeat', 'method', '(count)'),
]

const arrayMembers = [
  member('length', 'property', 'number'),
  member('push', 'method', '(item)'),
  member('pop', 'method', '()'),
  member('shift', 'method', '()'),
  member('unshift', 'method', '(item)'),
  member('map', 'method', '(fn)'),
  member('filter', 'method', '(fn)'),
  member('find', 'method', '(fn)'),
  member('findIndex', 'method', '(fn)'),
  member('forEach', 'method', '(fn)'),
  member('reduce', 'method', '(fn, initial)'),
  member('some', 'method', '(fn)'),
  member('every', 'method', '(fn)'),
  member('includes', 'method', '(item)'),
  member('indexOf', 'method', '(item)'),
  member('join', 'method', '(separator)'),
  member('slice', 'method', '(start, end)'),
  member('splice', 'method', '(start, count)'),
  member('sort', 'method', '(compare)'),
  member('reverse', 'method', '()'),
  member('flat', 'method', '()'),
]

const objectMembers = [
  member('keys', 'method', '(object)'),
  member('values', 'method', '(object)'),
  member('entries', 'method', '(object)'),
  member('assign', 'method', '(target, ...sources)'),
  member('freeze', 'method', '(object)'),
  member('fromEntries', 'method', '(entries)'),
]

const numberMembers = [member('toFixed', 'method', '(digits)'), member('toPrecision', 'method', '(digits)'), member('toString', 'method', '(radix)')]

const functionMembers = [member('call', 'method', '(this, ...args)'), member('apply', 'method', '(this, args)'), member('bind', 'method', '(this, ...args)'), member('name', 'property', 'string'), member('length', 'property', 'number')]

const promiseMembers = [
  member('then', 'method', '(onFulfilled)'),
  member('catch', 'method', '(onRejected)'),
  member('finally', 'method', '(onFinally)'),
  member('all', 'method', '(promises)'),
  member('race', 'method', '(promises)'),
  member('resolve', 'method', '(value)'),
  member('reject', 'method', '(reason)'),
]

const elementMembers = [
  member('addEventListener', 'method', '(type, listener)'),
  member('removeEventListener', 'method', '(type, listener)'),
  member('querySelector', 'method', '(selector)'),
  member('querySelectorAll', 'method', '(selector)'),
  member('classList', 'property', 'DOMTokenList'),
  member('dataset', 'property', 'DOMStringMap'),
  member('style', 'property', 'CSSStyleDeclaration'),
  member('textContent', 'property', 'string'),
  member('innerHTML', 'property', 'string'),
  member('innerText', 'property', 'string'),
  member('value', 'property', 'string'),
  member('children', 'property', 'HTMLCollection'),
  member('parentElement', 'property', 'Element'),
  member('append', 'method', '(...nodes)'),
  member('appendChild', 'method', '(node)'),
  member('remove', 'method', '()'),
  member('setAttribute', 'method', '(name, value)'),
  member('getAttribute', 'method', '(name)'),
  member('focus', 'method', '()'),
  member('closest', 'method', '(selector)'),
]

const consoleMembers = [
  member('log', 'method', '(...data)'),
  member('warn', 'method', '(...data)'),
  member('error', 'method', '(...data)'),
  member('info', 'method', '(...data)'),
  member('table', 'method', '(data)'),
  member('time', 'method', '(label)'),
  member('timeEnd', 'method', '(label)'),
  member('group', 'method', '(label)'),
  member('clear', 'method', '()'),
  member('debug', 'method', '(...data)'),
]

const mathMembers = [
  member('round', 'method', '(x)'),
  member('floor', 'method', '(x)'),
  member('ceil', 'method', '(x)'),
  member('random', 'method', '()'),
  member('max', 'method', '(...values)'),
  member('min', 'method', '(...values)'),
  member('abs', 'method', '(x)'),
  member('pow', 'method', '(base, exponent)'),
  member('sqrt', 'method', '(x)'),
  member('PI', 'constant', 'number'),
]

const jsonMembers = [member('parse', 'method', '(text)'), member('stringify', 'method', '(value, replacer, space)')]

const documentMembers = [
  member('querySelector', 'method', '(selector)'),
  member('querySelectorAll', 'method', '(selector)'),
  member('getElementById', 'method', '(id)'),
  member('createElement', 'method', '(tag)'),
  member('addEventListener', 'method', '(type, listener)'),
  member('body', 'property', 'HTMLElement'),
  member('head', 'property', 'HTMLElement'),
  member('title', 'property', 'string'),
  member('cookie', 'property', 'string'),
  member('location', 'property', 'Location'),
]

const GLOBAL_MEMBERS: Record<string, Suggestion[]> = {
  console: consoleMembers,
  Math: mathMembers,
  JSON: jsonMembers,
  document: documentMembers,
  window: [...documentMembers, ...consoleMembers],
  Object: objectMembers,
  Array: [...arrayMembers, member('isArray', 'method', '(value)'), member('from', 'method', '(iterable)')],
  Promise: promiseMembers,
  localStorage: [member('getItem', 'method', '(key)'), member('setItem', 'method', '(key, value)'), member('removeItem', 'method', '(key)'), member('clear', 'method', '()')],
  process: [member('argv', 'property', 'string[]'), member('env', 'property', 'object'), member('exit', 'method', '(code)')],
  os: [member('path', 'property', 'module'), member('environ', 'property', 'object'), member('getcwd', 'method', '()')],
  str: [member('upper', 'method', '()'), member('lower', 'method', '()'), member('strip', 'method', '()'), member('split', 'method', '(sep)'), member('replace', 'method', '(old, new)'), member('startswith', 'method', '(prefix)'), member('endswith', 'method', '(suffix)'), member('join', 'method', '(iterable)'), member('format', 'method', '(*args)')],
  list: [member('append', 'method', '(item)'), member('extend', 'method', '(iterable)'), member('pop', 'method', '(index)'), member('sort', 'method', '()'), member('reverse', 'method', '()'), member('index', 'method', '(value)'), member('count', 'method', '(value)')],
  dict: [member('keys', 'method', '()'), member('values', 'method', '()'), member('items', 'method', '()'), member('get', 'method', '(key, default)'), member('update', 'method', '(other)'), member('pop', 'method', '(key)')],
}

/** The same shapes, named the way Python's types are. */
const PY_KINDS: Record<string, string> = {
  string: 'str',
  array: 'list',
  dict: 'dict',
  number: 'number',
  function: 'function',
}

const KIND_MEMBERS: Record<string, Suggestion[]> = {
  str: GLOBAL_MEMBERS.str,
  list: GLOBAL_MEMBERS.list,
  dict: GLOBAL_MEMBERS.dict,
  string: stringMembers,
  array: arrayMembers,
  number: numberMembers,
  function: functionMembers,
  promise: promiseMembers,
  element: elementMembers,
  object: [],
}

/* ------------------------------------------------------------------------ */
/* indexing                                                                  */
/* ------------------------------------------------------------------------ */

/** Given `text` and the offset of an opening bracket, return the matching close. */
function matchBracket(text: string, openIndex: number): number {
  const open = text[openIndex]
  const close = open === '{' ? '}' : open === '(' ? ')' : open === '[' ? ']' : ''
  if (!close) return -1
  let depth = 0
  for (let index = openIndex; index < text.length; index += 1) {
    if (text[index] === open) depth += 1
    else if (text[index] === close) {
      depth -= 1
      if (depth === 0) return index
    }
  }
  return -1
}

function firstBracketAfter(text: string, from: number, limit = 400): number {
  for (let index = from; index < Math.min(text.length, from + limit); index += 1) {
    const char = text[index]
    if (char === '{') return index
    if (char === ';') return -1
  }
  return -1
}

function paramNames(raw: string): string[] {
  return raw
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => {
      // drop defaults, types and rest markers: `a: number = 1` → `a`
      const cleaned = part.replace(/^\.\.\./, '').replace(/[=:].*$/, '').trim()
      return cleaned.match(new RegExp(`^${IDENT}`))?.[0] ?? ''
    })
    .filter((name) => Boolean(name) && name !== 'self' && name !== 'this')
}

/** Top-level members of an object literal body. */
function objectLiteralMembers(body: string, owner: string): Suggestion[] {
  const found: Suggestion[] = []
  let depth = 0
  let lineStart = 0
  for (let index = 0; index <= body.length; index += 1) {
    const char = body[index]
    const atEnd = index === body.length
    const boundary = !atEnd && depth === 0 && (char === ',' || char === '\n')
    if (boundary || atEnd) {
      const entry = body.slice(lineStart, index).trim().replace(/,$/, '')
      lineStart = index + 1
      if (!entry) continue
      const methodMatch = entry.match(new RegExp(`^([\\w$]+)\\s*\\(([^)]*)\\)`))
      if (methodMatch) {
        found.push({
          label: methodMatch[1],
          type: 'method',
          detail: `(${paramNames(methodMatch[2]).join(', ')})`,
          info: `${owner}.${methodMatch[1]}()`,
          boost: 2,
        })
        continue
      }
      const keyMatch = entry.match(new RegExp(`^([\\w$]+)\\s*:`))
      if (keyMatch) {
        found.push({ label: keyMatch[1], type: 'property', detail: owner, boost: 2 })
        continue
      }
      const shorthand = entry.match(new RegExp(`^([\\w$]+)$`))
      if (shorthand) found.push({ label: shorthand[1], type: 'property', detail: owner, boost: 2 })
    }
  }
  return found
}

/** Members of a class body. */
function classBodyMembers(body: string, owner: string): Suggestion[] {
  const found: Suggestion[] = []
  const lines = body.split('\n')
  for (const rawLine of lines) {
    const line = rawLine.trim().replace(/^(?:public|private|protected|static|readonly|async|get|set|override|#|\*)\s*/g, '')
    if (!line || line.startsWith('//') || line.startsWith('constructor')) continue
    const methodMatch = line.match(new RegExp(`^(?:#)?(${IDENT})\\s*\\(([^)]*)\\)`))
    if (methodMatch) {
      found.push({
        label: methodMatch[1],
        type: 'method',
        detail: `(${paramNames(methodMatch[2]).join(', ')})`,
        info: `${owner}.${methodMatch[1]}()`,
        boost: 2,
      })
      continue
    }
    const fieldMatch = line.match(new RegExp(`^(?:#)?(${IDENT})\\s*[:=]`))
    if (fieldMatch && fieldMatch[1] !== 'return' && fieldMatch[1] !== 'if') {
      found.push({ label: fieldMatch[1], type: 'property', detail: owner, boost: 1 })
    }
  }
  // TypeScript constructor parameter properties
  const ctor = body.match(new RegExp(`constructor\\s*\\(([^)]*)\\)`))
  if (ctor) {
    for (const part of ctor[1].split(',')) {
      const property = part.trim().match(/^(?:public|private|protected|readonly)\s+(\w+)/)
      if (property) found.push({ label: property[1], type: 'property', detail: owner, boost: 1 })
    }
  }
  return found
}

export function indexSymbols(code: string, languageId: string): SymbolIndex {
  const family = familyOf(languageId)
  const code_ = stripLiterals(code, family === 'python')
  const declarations: Suggestion[] = []
  const objectMembers_ = new Map<string, Suggestion[]>()
  const classMembers_ = new Map<string, Suggestion[]>()
  const instanceOf = new Map<string, string>()
  const kindOf = new Map<string, string>()
  const classRanges: Array<{ name: string; from: number; to: number }> = []
  const seen = new Set<string>()

  const add = (suggestion: Suggestion) => {
    const key = `${suggestion.type}:${suggestion.label}`
    if (seen.has(key)) return
    seen.add(key)
    declarations.push(suggestion)
  }

  const noteKind = (name: string, tail: string) => {
    const head = tail.trim()
    if (/^(?:async\s*)?(?:function\b|\()/.test(head) || new RegExp(`^${IDENT}\\s*=>`).test(head)) {
      kindOf.set(name, 'function')
      return
    }
    if (/^['"`]/.test(head)) kindOf.set(name, 'string')
    else if (head.startsWith('[')) kindOf.set(name, 'array')
    else if (head.startsWith('{')) kindOf.set(name, 'object')
    else if (/^-?\d/.test(head)) kindOf.set(name, 'number')
    else if (/^(?:fetch|Promise\.|axios|\.then\()/.test(head)) kindOf.set(name, 'promise')
    else if (/^(?:document\.|window\.document|new\s+Element)/.test(head)) kindOf.set(name, 'element')
  }

  if (family === 'js') {
    // declarations ---------------------------------------------------------
    const declRe = new RegExp(`\\b(?:const|let|var)\\s+(${IDENT})(\\s*:\\s*[^=;\\n]+)?\\s*=`, 'g')
    let match: RegExpExecArray | null
    while ((match = declRe.exec(code_))) {
      const name = match[1]
      const eq = code_.indexOf('=', match.index + match[0].length - 1)
      const statementEnd = code_.slice(eq + 1).search(/[;\n]/)
      const tail = code_.slice(eq + 1, eq + 1 + (statementEnd === -1 ? 120 : Math.min(statementEnd, 400)))
      const arrow = tail.match(new RegExp(`^\\s*(?:async\\s*)?\\(([^)]*)\\)\\s*=>`)) ??
        tail.match(new RegExp(`^\\s*(?:async\\s*)?(${IDENT})\\s*=>`))
      if (arrow) {
        const params = arrow[1] && arrow[1] !== name ? paramNames(arrow[1]) : []
        add({ label: name, type: 'function', detail: `(${params.join(', ')})`, info: `function ${name}` })
        kindOf.set(name, 'function')
      } else {
        add({ label: name, type: 'variable', detail: match[2]?.replace(/^:\s*/, '').trim() })
        noteKind(name, tail)
        if (tail.trim().startsWith('{')) {
          const open = eq + 1 + tail.indexOf('{')
          const close = matchBracket(code_, open)
          if (close > open) objectMembers_.set(name, objectLiteralMembers(code_.slice(open + 1, close), name))
        }
      }
    }

    const fnRe = new RegExp(`\\bfunction\\s*\\*?\\s*(${IDENT})\\s*\\(([^)]*)\\)`, 'g')
    while ((match = fnRe.exec(code_))) {
      add({ label: match[1], type: 'function', detail: `(${paramNames(match[2]).join(', ')})`, info: `function ${match[1]}` })
      kindOf.set(match[1], 'function')
    }

    const classRe = new RegExp(`\\bclass\\s+(${IDENT})(?:[^{]*)\\{`, 'g')
    while ((match = classRe.exec(code_))) {
      const name = match[1]
      const open = match.index + match[0].length - 1
      const close = matchBracket(code_, open)
      add({ label: name, type: 'class', info: `class ${name}` })
      if (close > open) {
        classMembers_.set(name, classBodyMembers(code_.slice(open + 1, close), name))
        classRanges.push({ name, from: open, to: close })
      }
    }

    const typeRe = new RegExp(`\\b(?:interface|type|enum)\\s+(${IDENT})`, 'g')
    while ((match = typeRe.exec(code_))) add({ label: match[1], type: 'type' })

    const importRe = new RegExp(`\\bimport\\s+(?:(${IDENT})\\s*,?\\s*)?(?:\\{([^}]*)\\})?\\s*(?:\\*\\s*as\\s+(${IDENT}))?\\s*from`, 'g')
    while ((match = importRe.exec(code_))) {
      if (match[1]) add({ label: match[1], type: 'namespace', detail: 'import' })
      if (match[3]) add({ label: match[3], type: 'namespace', detail: 'import' })
      for (const part of (match[2] ?? '').split(',')) {
        const name = part.trim().split(/\s+as\s+/).pop()?.trim()
        if (name && new RegExp(`^${IDENT}$`).test(name)) add({ label: name, type: 'variable', detail: 'import' })
      }
    }

    const newRe = new RegExp(`\\b(${IDENT})\\s*=\\s*new\\s+(${IDENT})`, 'g')
    while ((match = newRe.exec(code_))) instanceOf.set(match[1], match[2])
  } else if (family === 'python') {
    const defRe = new RegExp(`^\\s*def\\s+(${IDENT})\\s*\\(([^)]*)\\)`, 'gm')
    let match: RegExpExecArray | null
    while ((match = defRe.exec(code_))) {
      add({ label: match[1], type: 'function', detail: `(${paramNames(match[2]).join(', ')})`, info: `def ${match[1]}` })
      kindOf.set(match[1], 'function')
    }
    const classRe = new RegExp(`^\\s*class\\s+(${IDENT})`, 'gm')
    while ((match = classRe.exec(code_))) add({ label: match[1], type: 'class', info: `class ${match[1]}` })

    const assignRe = new RegExp(`^\\s*(${IDENT})\\s*=\\s*(.+)$`, 'gm')
    while ((match = assignRe.exec(code_))) {
      const name = match[1]
      if (name === 'self') continue
      add({ label: name, type: 'variable' })
      const head = match[2].trim()
      if (/^['"]/.test(head)) kindOf.set(name, 'string')
      else if (head.startsWith('[')) kindOf.set(name, 'array')
      else if (head.startsWith('{')) kindOf.set(name, 'dict')
      else if (/^-?\d/.test(head)) kindOf.set(name, 'number')
      else if (head.startsWith('lambda') || head.startsWith('def ')) kindOf.set(name, 'function')
    }

    const importRe = new RegExp(`^\\s*(?:from\\s+([\\w.]+)\\s+)?import\\s+(.+)$`, 'gm')
    while ((match = importRe.exec(code_))) {
      for (const part of match[2].split(',')) {
        const name = part.trim().split(/\s+as\s+/).pop()?.trim()
        if (name && /^[A-Za-z_]\w*$/.test(name)) add({ label: name, type: 'namespace', detail: 'import' })
      }
    }

    const forRe = new RegExp(`\\bfor\\s+(${IDENT})(?:\\s*,\\s*(${IDENT}))?\\s+in\\b`, 'g')
    while ((match = forRe.exec(code_))) {
      add({ label: match[1], type: 'variable', detail: 'loop' })
      if (match[2]) add({ label: match[2], type: 'variable', detail: 'loop' })
    }
  } else {
    const fnPatterns = [
      new RegExp(`\\bfn\\s+(${IDENT})\\s*[(<]`, 'g'),
      new RegExp(`\\bfunc\\s+(?:\\([^)]*\\)\\s*)?(${IDENT})\\s*\\(`, 'g'),
      new RegExp(`\\bdef\\s+(${IDENT})\\s*\\(`, 'g'),
      new RegExp(`\\bsub\\s+(${IDENT})`, 'g'),
      new RegExp(`\\bfunction\\s+(${IDENT})\\s*\\(`, 'g'),
    ]
    for (const pattern of fnPatterns) {
      let match: RegExpExecArray | null
      while ((match = pattern.exec(code_))) add({ label: match[1], type: 'function', info: `${match[1]}()` })
    }
    const varPatterns = [
      new RegExp(`\\b(?:let|var|val|const|auto|final|mut)\\s+(${IDENT})`, 'g'),
      new RegExp(`^\\s*(?:[A-Za-z_][\\w<>\\[\\],.*&:]*)\\s+(${IDENT})\\s*(?:=|;)`, 'gm'),
    ]
    for (const pattern of varPatterns) {
      let match: RegExpExecArray | null
      while ((match = pattern.exec(code_))) {
        const name = match[1]
        if (KEYWORDS.generic.includes(name)) continue
        add({ label: name, type: 'variable' })
      }
    }
    const typeRe = new RegExp(`\\b(?:class|struct|interface|enum|trait|type)\\s+(${IDENT})`, 'g')
    let match: RegExpExecArray | null
    while ((match = typeRe.exec(code_))) add({ label: match[1], type: 'class' })
  }

  const byName = new Map<string, Suggestion>()
  for (const suggestion of declarations) if (!byName.has(suggestion.label)) byName.set(suggestion.label, suggestion)

  return {
    family,
    declarations,
    byName,
    objectMembers: objectMembers_,
    classMembers: classMembers_,
    instanceOf,
    kindOf,
    classRanges,
    keywords: KEYWORDS[family].map((label) => ({ label, type: 'keyword' as SuggestionType, boost: -2 })),
  }
}

/* ------------------------------------------------------------------------ */
/* cross-file exports                                                        */
/* ------------------------------------------------------------------------ */

export function exportedSymbols(files: ProjectFile[], currentPath?: string): Suggestion[] {
  const found: Suggestion[] = []
  const seen = new Set<string>()
  for (const file of files) {
    if (file.path === currentPath) continue
    if (!/\.(?:[cm]?[jt]sx?|py)$/i.test(file.path)) continue
    if (file.content.length > 120_000) continue
    const code = stripLiterals(file.content, file.path.endsWith('.py'))
    const patterns: Array<{ re: RegExp; type: SuggestionType }> = [
      { re: new RegExp(`\\bexport\\s+(?:default\\s+)?(?:async\\s+)?function\\s+(${IDENT})`, 'g'), type: 'function' },
      { re: new RegExp(`\\bexport\\s+(?:default\\s+)?class\\s+(${IDENT})`, 'g'), type: 'class' },
      { re: new RegExp(`\\bexport\\s+(?:const|let|var)\\s+(${IDENT})`, 'g'), type: 'variable' },
      { re: new RegExp(`\\bexport\\s+(?:type|interface|enum)\\s+(${IDENT})`, 'g'), type: 'type' },
      { re: new RegExp(`^def\\s+(${IDENT})`, 'gm'), type: 'function' },
      { re: new RegExp(`^class\\s+(${IDENT})`, 'gm'), type: 'class' },
    ]
    for (const { re, type } of patterns) {
      let match: RegExpExecArray | null
      while ((match = re.exec(code))) {
        const label = match[1]
        if (seen.has(label)) continue
        seen.add(label)
        found.push({ label, type, detail: `./${file.path}`, boost: -1 })
      }
    }
  }
  return found
}

/* ------------------------------------------------------------------------ */
/* position-aware suggestions                                                */
/* ------------------------------------------------------------------------ */

let cachedIndex: { code: string; languageId: string; index: SymbolIndex } | null = null

/** The scan is the expensive part; a keystroke re-runs it, so keep the last one. */
function indexFor(code: string, languageId: string): SymbolIndex {
  if (cachedIndex && cachedIndex.code === code && cachedIndex.languageId === languageId) return cachedIndex.index
  const index = indexSymbols(code, languageId)
  cachedIndex = { code, languageId, index }
  return index
}

function isInsideLiteralOrComment(code: string, pos: number, family: Family): boolean {
  const stripped = stripLiterals(code, family === 'python')
  for (let index = Math.max(0, pos - 1); index >= 0 && index > pos - 80; index -= 1) {
    if (code[index] === '\n') return false
    if (code[index] !== stripped[index]) return true
  }
  return false
}

/** Everything that could be on the left-hand side of a `.` before `pos`. */
function receiverBefore(code: string, dotIndex: number, family: Family): { name: string; kind: 'name' | 'this' | 'literal' } | null {
  let end = dotIndex
  while (end > 0 && /\s/.test(code[end - 1])) end -= 1
  const before = code.slice(Math.max(0, end - 200), end)

  if (before.endsWith(')')) {
    // a call: use the callee name so `getUser().` can still resolve
    let depth = 0
    let index = before.length - 1
    for (; index >= 0; index -= 1) {
      if (before[index] === ')') depth += 1
      else if (before[index] === '(') {
        depth -= 1
        if (depth === 0) break
      }
    }
    const callee = before.slice(0, index).match(new RegExp(`(${IDENT}(?:\\.${IDENT})*)\\s*$`))?.[1]
    return callee ? { name: callee.split('.').pop()!, kind: 'name' } : null
  }
  if (before.endsWith(']')) return null
  if (/['"`]$/.test(before)) return { name: before.slice(-1), kind: 'literal' }
  const chain = before.match(new RegExp(`(${IDENT}(?:\\.${IDENT})*)\\s*$`))?.[1]
  if (!chain) return null
  if (chain === 'this' || chain === 'self') return { name: chain, kind: 'this' }
  return { name: chain.split('.').pop()!, kind: 'name' }
}

function membersForReceiver(
  receiver: { name: string; kind: 'name' | 'this' | 'literal' },
  index: SymbolIndex,
  pos: number,
): Suggestion[] {
  if (receiver.kind === 'this') {
    const inside = index.classRanges.find((range) => pos >= range.from && pos <= range.to)
    if (!inside) return []
    return index.classMembers.get(inside.name) ?? []
  }
  if (receiver.kind === 'literal') {
    return receiver.name === '`' ? stringMembers : stringMembers
  }

  const name = receiver.name
  const builtin = GLOBAL_MEMBERS[name]
  if (builtin && !index.objectMembers.has(name) && !index.classMembers.has(name)) return builtin

  const objectShape = index.objectMembers.get(name)
  if (objectShape) return objectShape

  const className = index.instanceOf.get(name)
  if (className) {
    const members = index.classMembers.get(className) ?? []
    if (members.length > 0) return members
  }
  if (index.byName.get(name)?.type === 'class') {
    const members = index.classMembers.get(name) ?? []
    if (members.length > 0) return members
  }

  const rawKind = index.kindOf.get(name)
  const kind = rawKind && index.family === 'python' ? PY_KINDS[rawKind] ?? rawKind : rawKind
  if (kind && KIND_MEMBERS[kind]) {
    const members = KIND_MEMBERS[kind]
    if (members.length > 0) return members
  }

  // Unknown receiver (a parameter, a return value…): offer every member the
  // file declares, tagged with the class it came from.
  const all: Suggestion[] = []
  for (const [owner, members] of index.classMembers) {
    for (const suggestion of members) all.push({ ...suggestion, detail: suggestion.detail ?? owner, boost: (suggestion.boost ?? 0) - 3 })
  }
  for (const members of index.objectMembers.values()) all.push(...members)
  return dedupe(all)
}

function dedupe(list: Suggestion[]): Suggestion[] {
  const seen = new Set<string>()
  const out: Suggestion[] = []
  for (const item of list) {
    if (seen.has(item.label)) continue
    seen.add(item.label)
    out.push(item)
  }
  return out
}

function rank(list: Suggestion[], word: string): Suggestion[] {
  const lower = word.toLowerCase()
  return list
    .filter((item) => !word || item.label.toLowerCase().startsWith(lower))
    .sort((a, b) => {
      const exactA = word && a.label.startsWith(word) ? 1 : 0
      const exactB = word && b.label.startsWith(word) ? 1 : 0
      if (exactA !== exactB) return exactB - exactA
      const boost = (b.boost ?? 0) - (a.boost ?? 0)
      if (boost !== 0) return boost
      if (a.label.length !== b.label.length) return a.label.length - b.label.length
      return a.label.localeCompare(b.label)
    })
}

/**
 * The pure half of the completion source: given the whole document and a caret
 * offset, return the range to replace and the ranked options.
 */
export function suggest(code: string, pos: number, options: CompletionOptions): CompletionResult | null {
  if (LANGUAGE_HANDLES_ITSELF.has(options.languageId)) return null
  const family = familyOf(options.languageId)
  if (isInsideLiteralOrComment(code, pos, family)) return null

  const lineStart = code.lastIndexOf('\n', Math.max(0, pos - 1)) + 1
  const before = code.slice(lineStart, pos)
  const word = before.match(/[\w$]*$/)?.[0] ?? ''
  const from = pos - word.length
  const head = before.slice(0, before.length - word.length)
  const dotBefore = head.trimEnd().endsWith('.')

  const index = indexFor(code, options.languageId)

  if (dotBefore) {
    const dotIndex = lineStart + head.trimEnd().length - 1
    const receiver = receiverBefore(code, dotIndex, family)
    if (!receiver) return null
    const members = membersForReceiver(receiver, index, pos)
    const ranked = rank(members, word)
    return ranked.length > 0 ? { from, options: ranked.slice(0, 80) } : null
  }

  const pool: Suggestion[] = [...index.declarations, ...index.keywords]
  if (options.files && options.files.length > 0) pool.push(...exportedSymbols(options.files, options.path))
  const ranked = rank(dedupe(pool), word)
  if (ranked.length === 0) return null
  return { from, options: ranked.slice(0, 80) }
}

/* ------------------------------------------------------------------------ */
/* CodeMirror glue                                                           */
/* ------------------------------------------------------------------------ */

export type CmCompletionSource = (context: {
  state: { doc: { toString(): string } }
  pos: number
  explicit: boolean
}) => { from: number; options: Array<Record<string, unknown>>; validFor?: RegExp } | null

export function createCompletionSource(getOptions: () => CompletionOptions): CmCompletionSource {
  return (context) => {
    const options = getOptions()
    const result = suggest(context.state.doc.toString(), context.pos, options)
    if (!result) return null
    return {
      from: result.from,
      options: result.options.map((suggestion) => ({
        label: suggestion.label,
        type: suggestion.type,
        detail: suggestion.detail,
        info: suggestion.info,
        boost: CALLABLE.has(suggestion.type) ? 1 : 0,
      })),
      validFor: /^[\w$]*$/,
    }
  }
}
