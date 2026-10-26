import { StreamLanguage, type LanguageSupport } from '@codemirror/language'
import type { Extension } from '@codemirror/state'

export type Runtime = 'web' | 'js' | 'python' | 'cloud' | 'none'

export type LanguageDef = {
  id: string
  label: string
  exts: string[]
  filenames?: string[]
  runtime: Runtime
  /** Language id/aliases used by the Piston cloud runner. */
  cloud?: string
  monacoLike?: string
}

export const LANGUAGES: LanguageDef[] = [
  { id: 'javascript', label: 'JavaScript', exts: ['.js', '.mjs', '.cjs'], runtime: 'web', cloud: 'javascript' },
  { id: 'typescript', label: 'TypeScript', exts: ['.ts'], runtime: 'web', cloud: 'typescript' },
  { id: 'tsx', label: 'TypeScript JSX', exts: ['.tsx'], runtime: 'web' },
  { id: 'jsx', label: 'JavaScript JSX', exts: ['.jsx'], runtime: 'web' },
  { id: 'html', label: 'HTML', exts: ['.html', '.htm'], runtime: 'web' },
  { id: 'css', label: 'CSS', exts: ['.css', '.scss', '.less'], runtime: 'web' },
  { id: 'json', label: 'JSON', exts: ['.json'], runtime: 'none' },
  { id: 'markdown', label: 'Markdown', exts: ['.md', '.mdx'], runtime: 'none' },
  { id: 'python', label: 'Python', exts: ['.py'], runtime: 'python', cloud: 'python' },
  { id: 'sql', label: 'SQL', exts: ['.sql'], runtime: 'cloud', cloud: 'sqlite3' },
  { id: 'xml', label: 'XML / SVG', exts: ['.xml', '.svg'], runtime: 'web', cloud: 'xml' },
  { id: 'yaml', label: 'YAML', exts: ['.yaml', '.yml'], runtime: 'none' },
  { id: 'toml', label: 'TOML', exts: ['.toml'], runtime: 'none' },
  { id: 'shell', label: 'Shell', exts: ['.sh', '.bash', '.zsh'], filenames: ['.bashrc', '.zshrc'], runtime: 'cloud', cloud: 'bash' },
  { id: 'c', label: 'C', exts: ['.c', '.h'], runtime: 'cloud', cloud: 'c' },
  { id: 'cpp', label: 'C++', exts: ['.cpp', '.cc', '.cxx', '.hpp'], runtime: 'cloud', cloud: 'c++' },
  { id: 'java', label: 'Java', exts: ['.java'], runtime: 'cloud', cloud: 'java' },
  { id: 'csharp', label: 'C#', exts: ['.cs'], runtime: 'cloud', cloud: 'csharp' },
  { id: 'go', label: 'Go', exts: ['.go'], runtime: 'cloud', cloud: 'go' },
  { id: 'rust', label: 'Rust', exts: ['.rs'], runtime: 'cloud', cloud: 'rust' },
  { id: 'php', label: 'PHP', exts: ['.php'], runtime: 'cloud', cloud: 'php' },
  { id: 'ruby', label: 'Ruby', exts: ['.rb'], runtime: 'cloud', cloud: 'ruby' },
  { id: 'lua', label: 'Lua', exts: ['.lua'], runtime: 'cloud', cloud: 'lua' },
  { id: 'swift', label: 'Swift', exts: ['.swift'], runtime: 'cloud', cloud: 'swift' },
  { id: 'kotlin', label: 'Kotlin', exts: ['.kt', '.kts'], runtime: 'cloud', cloud: 'kotlin' },
  { id: 'dockerfile', label: 'Dockerfile', exts: ['.dockerfile'], filenames: ['Dockerfile'], runtime: 'none' },
  { id: 'diff', label: 'Diff', exts: ['.diff', '.patch'], runtime: 'none' },
  { id: 'text', label: 'Plain text', exts: ['.txt', '.env', '.gitignore'], filenames: ['.env', '.gitignore', 'LICENSE'], runtime: 'none' },
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

function clikeMode(load: () => Promise<Record<string, unknown>>, name: string) {
  return async () => {
    const mod = await load()
    const language = (mod.cLike as (config: unknown) => unknown)(mod[name])
    return StreamLanguage.define(language as never)
  }
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
  csharp: clikeMode(() => import('@codemirror/legacy-modes/mode/clike'), 'csharp'),
  kotlin: clikeMode(() => import('@codemirror/legacy-modes/mode/clike'), 'kotlin'),
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
