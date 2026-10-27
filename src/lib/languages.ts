import { StreamLanguage, type LanguageSupport } from '@codemirror/language'
import type { Extension } from '@codemirror/state'

export type Runtime = 'web' | 'js' | 'python' | 'cloud' | 'none'

export type LanguageDef = {
  id: string
  label: string
  /** Two-to-four character monogram drawn in the file icon. */
  glyph: string
  exts: string[]
  filenames?: string[]
  runtime: Runtime
  /** Language id/aliases used by the Piston cloud runner. */
  cloud?: string
  monacoLike?: string
}

export const LANGUAGES: LanguageDef[] = [
  { id: 'javascript', label: 'JavaScript', glyph: 'js', exts: ['.js', '.mjs', '.cjs'], runtime: 'web', cloud: 'javascript' },
  { id: 'typescript', label: 'TypeScript', glyph: 'ts', exts: ['.ts'], runtime: 'web', cloud: 'typescript' },
  { id: 'tsx', label: 'TypeScript JSX', glyph: 'tsx', exts: ['.tsx'], runtime: 'web' },
  { id: 'jsx', label: 'JavaScript JSX', glyph: 'jsx', exts: ['.jsx'], runtime: 'web' },
  { id: 'html', label: 'HTML', glyph: '<>', exts: ['.html', '.htm'], runtime: 'web' },
  { id: 'css', label: 'CSS', glyph: '#', exts: ['.css', '.scss', '.less'], runtime: 'web' },
  { id: 'json', label: 'JSON', glyph: '{}', exts: ['.json'], runtime: 'none' },
  { id: 'markdown', label: 'Markdown', glyph: 'md', exts: ['.md', '.mdx'], runtime: 'none' },
  { id: 'python', label: 'Python', glyph: 'py', exts: ['.py'], runtime: 'python', cloud: 'python' },
  { id: 'sql', label: 'SQL', glyph: 'sql', exts: ['.sql'], runtime: 'cloud', cloud: 'sqlite3' },
  { id: 'xml', label: 'XML / SVG', glyph: 'xml', exts: ['.xml', '.svg'], runtime: 'web', cloud: 'xml' },
  { id: 'yaml', label: 'YAML', glyph: 'yml', exts: ['.yaml', '.yml'], runtime: 'none' },
  { id: 'toml', label: 'TOML', glyph: 'toml', exts: ['.toml'], runtime: 'none' },
  { id: 'shell', label: 'Shell', glyph: '$', exts: ['.sh', '.bash', '.zsh'], filenames: ['.bashrc', '.zshrc'], runtime: 'cloud', cloud: 'bash' },
  { id: 'c', label: 'C', glyph: 'c', exts: ['.c', '.h'], runtime: 'cloud', cloud: 'c' },
  { id: 'cpp', label: 'C++', glyph: 'c++', exts: ['.cpp', '.cc', '.cxx', '.hpp'], runtime: 'cloud', cloud: 'c++' },
  { id: 'java', label: 'Java', glyph: 'java', exts: ['.java'], runtime: 'cloud', cloud: 'java' },
  { id: 'csharp', label: 'C#', glyph: 'c#', exts: ['.cs'], runtime: 'cloud', cloud: 'csharp' },
  { id: 'go', label: 'Go', glyph: 'go', exts: ['.go'], runtime: 'cloud', cloud: 'go' },
  { id: 'rust', label: 'Rust', glyph: 'rs', exts: ['.rs'], runtime: 'cloud', cloud: 'rust' },
  { id: 'php', label: 'PHP', glyph: 'php', exts: ['.php'], runtime: 'cloud', cloud: 'php' },
  { id: 'ruby', label: 'Ruby', glyph: 'rb', exts: ['.rb'], runtime: 'cloud', cloud: 'ruby' },
  { id: 'lua', label: 'Lua', glyph: 'lua', exts: ['.lua'], runtime: 'cloud', cloud: 'lua' },
  { id: 'swift', label: 'Swift', glyph: 'swift', exts: ['.swift'], runtime: 'cloud', cloud: 'swift' },
  { id: 'kotlin', label: 'Kotlin', glyph: 'kt', exts: ['.kt', '.kts'], runtime: 'cloud', cloud: 'kotlin' },
  { id: 'dockerfile', label: 'Dockerfile', glyph: 'docker', exts: ['.dockerfile'], filenames: ['Dockerfile'], runtime: 'none' },
  { id: 'diff', label: 'Diff', glyph: '±', exts: ['.diff', '.patch'], runtime: 'none' },
  // --- second wave: more syntaxes, more runtimes -----------------------
  { id: 'dart', label: 'Dart', glyph: 'dart', exts: ['.dart'], runtime: 'cloud', cloud: 'dart' },
  { id: 'haskell', label: 'Haskell', glyph: 'hs', exts: ['.hs', '.lhs'], runtime: 'cloud', cloud: 'haskell' },
  { id: 'erlang', label: 'Erlang', glyph: 'erl', exts: ['.erl', '.hrl'], runtime: 'cloud', cloud: 'erlang' },
  { id: 'julia', label: 'Julia', glyph: 'jl', exts: ['.jl'], runtime: 'cloud', cloud: 'julia' },
  { id: 'ocaml', label: 'OCaml', glyph: 'ml', exts: ['.ml', '.mli'], runtime: 'cloud', cloud: 'ocaml' },
  { id: 'fsharp', label: 'F#', glyph: 'fs', exts: ['.fs', '.fsi', '.fsx'], runtime: 'cloud', cloud: 'fsharp.net' },
  { id: 'perl', label: 'Perl', glyph: 'pl', exts: ['.pl', '.pm'], runtime: 'cloud', cloud: 'perl' },
  { id: 'r', label: 'R', glyph: 'r', exts: ['.r'], runtime: 'cloud', cloud: 'rscript' },
  { id: 'scala', label: 'Scala', glyph: 'scala', exts: ['.scala', '.sc'], runtime: 'cloud', cloud: 'scala' },
  { id: 'groovy', label: 'Groovy', glyph: 'gvy', exts: ['.groovy', '.gvy'], runtime: 'cloud', cloud: 'groovy' },
  { id: 'clojure', label: 'Clojure', glyph: 'clj', exts: ['.clj', '.cljs', '.cljc', '.edn'], runtime: 'cloud', cloud: 'clojure' },
  { id: 'elm', label: 'Elm', glyph: 'elm', exts: ['.elm'], runtime: 'cloud', cloud: 'elm' },
  { id: 'd', label: 'D', glyph: 'd', exts: ['.d'], runtime: 'cloud', cloud: 'd' },
  { id: 'pascal', label: 'Pascal', glyph: 'pas', exts: ['.pas', '.pp'], runtime: 'cloud', cloud: 'pascal' },
  { id: 'fortran', label: 'Fortran', glyph: 'f90', exts: ['.f90', '.f95', '.f03', '.for'], runtime: 'cloud', cloud: 'fortran' },
  { id: 'cobol', label: 'COBOL', glyph: 'cob', exts: ['.cob', '.cbl'], runtime: 'cloud', cloud: 'cobol' },
  { id: 'octave', label: 'Octave / MATLAB', glyph: 'm', exts: ['.m'], runtime: 'cloud', cloud: 'octave' },
  { id: 'text', label: 'Plain text', glyph: 'txt', exts: ['.txt', '.env', '.gitignore'], filenames: ['.env', '.gitignore', 'LICENSE'], runtime: 'none' },
]

const BY_EXT = new Map<string, LanguageDef>()
const BY_NAME = new Map<string, LanguageDef>()
for (const lang of LANGUAGES) {
  for (const ext of lang.exts) BY_EXT.set(ext, lang)
  for (const name of lang.filenames ?? []) BY_NAME.set(name.toLowerCase(), lang)
}

export function baseName(path: string): string {
  return path.split('/').pop() ?? path
}

export function extensionOf(path: string): string {
  const name = baseName(path)
  const idx = name.lastIndexOf('.')
  return idx <= 0 ? '' : name.slice(idx).toLowerCase()
}

export function languageForPath(path: string): LanguageDef {
  const name = baseName(path).toLowerCase()
  const byName = BY_NAME.get(name)
  if (byName) return byName
  const dotLang = LANGUAGES.find((l) => l.id === extensionOf(path).slice(1))
  if (dotLang) return dotLang
  return BY_EXT.get(extensionOf(path)) ?? LANGUAGES[LANGUAGES.length - 1]
}

export function languageForId(id: string): LanguageDef {
  return LANGUAGES.find((l) => l.id === id) ?? LANGUAGES[LANGUAGES.length - 1]
}

/* ------------------------------------------------------------------ */
/* CodeMirror language extensions                                      */
/* ------------------------------------------------------------------ */

type Loader = () => Promise<Extension | LanguageSupport>

function lazy(fn: () => Promise<Extension>): () => Promise<Extension> {
  let cached: Promise<Extension> | null = null
  return () => {
    if (!cached) cached = fn()
    return cached
  }
}

const legacy = (load: () => Promise<Record<string, unknown>>, key: string) => async () => {
  const mod = await load()
  return StreamLanguage.define(mod[key] as never)
}

const LOADERS: Record<string, () => Promise<Extension>> = {
  javascript: lazy(async () => (await import('@codemirror/lang-javascript')).javascript()),
  jsx: lazy(async () => (await import('@codemirror/lang-javascript')).javascript({ jsx: true })),
  typescript: lazy(async () => (await import('@codemirror/lang-javascript')).javascript({ typescript: true })),
  tsx: lazy(async () =>
    (await import('@codemirror/lang-javascript')).javascript({ typescript: true, jsx: true }),
  ),
  html: lazy(async () => (await import('@codemirror/lang-html')).html()),
  css: lazy(async () => (await import('@codemirror/lang-css')).css()),
  json: lazy(async () => (await import('@codemirror/lang-json')).json()),
  markdown: lazy(async () => (await import('@codemirror/lang-markdown')).markdown()),
  python: lazy(async () => (await import('@codemirror/lang-python')).python()),
  sql: lazy(async () => (await import('@codemirror/lang-sql')).sql()),
  xml: lazy(async () => (await import('@codemirror/lang-xml')).xml()),
  java: lazy(async () => (await import('@codemirror/lang-java')).java()),
  cpp: lazy(async () => (await import('@codemirror/lang-cpp')).cpp()),
  c: lazy(async () => (await import('@codemirror/lang-cpp')).cpp()),
  go: lazy(async () => (await import('@codemirror/lang-go')).go()),
  rust: lazy(async () => (await import('@codemirror/lang-rust')).rust()),
  php: lazy(async () => (await import('@codemirror/lang-php')).php()),
  yaml: legacy(() => import('@codemirror/legacy-modes/mode/yaml'), 'yaml'),
  toml: legacy(() => import('@codemirror/legacy-modes/mode/toml'), 'toml'),
  shell: legacy(() => import('@codemirror/legacy-modes/mode/shell'), 'shell'),
  ruby: legacy(() => import('@codemirror/legacy-modes/mode/ruby'), 'ruby'),
  lua: legacy(() => import('@codemirror/legacy-modes/mode/lua'), 'lua'),
  swift: legacy(() => import('@codemirror/legacy-modes/mode/swift'), 'swift'),
  dockerfile: legacy(() => import('@codemirror/legacy-modes/mode/dockerfile'), 'dockerFile'),
  diff: legacy(() => import('@codemirror/legacy-modes/mode/diff'), 'diff'),
  csharp: legacy(() => import('@codemirror/legacy-modes/mode/clike'), 'csharp'),
  kotlin: legacy(() => import('@codemirror/legacy-modes/mode/clike'), 'kotlin'),
  // second wave — all stream grammars, so each stays in its own tiny chunk
  dart: legacy(() => import('@codemirror/legacy-modes/mode/clike'), 'dart'),
  scala: legacy(() => import('@codemirror/legacy-modes/mode/clike'), 'scala'),
  haskell: legacy(() => import('@codemirror/legacy-modes/mode/haskell'), 'haskell'),
  erlang: legacy(() => import('@codemirror/legacy-modes/mode/erlang'), 'erlang'),
  julia: legacy(() => import('@codemirror/legacy-modes/mode/julia'), 'julia'),
  ocaml: legacy(() => import('@codemirror/legacy-modes/mode/mllike'), 'oCaml'),
  fsharp: legacy(() => import('@codemirror/legacy-modes/mode/mllike'), 'fSharp'),
  perl: legacy(() => import('@codemirror/legacy-modes/mode/perl'), 'perl'),
  r: legacy(() => import('@codemirror/legacy-modes/mode/r'), 'r'),
  groovy: legacy(() => import('@codemirror/legacy-modes/mode/groovy'), 'groovy'),
  clojure: legacy(() => import('@codemirror/legacy-modes/mode/clojure'), 'clojure'),
  elm: legacy(() => import('@codemirror/legacy-modes/mode/elm'), 'elm'),
  d: legacy(() => import('@codemirror/legacy-modes/mode/d'), 'd'),
  pascal: legacy(() => import('@codemirror/legacy-modes/mode/pascal'), 'pascal'),
  fortran: legacy(() => import('@codemirror/legacy-modes/mode/fortran'), 'fortran'),
  cobol: legacy(() => import('@codemirror/legacy-modes/mode/cobol'), 'cobol'),
  octave: legacy(() => import('@codemirror/legacy-modes/mode/octave'), 'octave'),
}

export function loadLanguageExtension(languageId: string): Promise<Extension> {
  const loader = LOADERS[languageId]
  if (!loader) return Promise.resolve([])
  return loader().catch(() => [])
}

/** Rough check whether a language can execute somewhere. */
export function runtimeLabel(runtime: Runtime): string {
  switch (runtime) {
    case 'web':
      return 'Browser'
    case 'js':
      return 'JavaScript'
    case 'python':
      return 'Python · Pyodide'
    case 'cloud':
      return 'Cloud sandbox'
    default:
      return 'Not runnable'
  }
}

export const RUNNABLE_EXTENSIONS = new Set(
  LANGUAGES.filter((l) => l.runtime !== 'none').flatMap((l) => l.exts),
)
