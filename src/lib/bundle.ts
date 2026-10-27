import { transform } from 'sucrase'
import type { Project, ProjectFile } from '../types'
import { extensionOf, languageForPath } from './languages'
import { dirName, escapeHtml, fileName, normalizePath } from './utils'

/** Canonical, remappable specifier namespace for project-internal modules. */
const MOD = 'https://cody.local/'

/** Curated bare-specifier → CDN map (esm.sh serves browser-ready ESM). */
const CDN = 'https://esm.sh/'
const BARE_IMPORTS: Record<string, string> = {
  react: `${CDN}react@18.3.1`,
  'react/': `${CDN}react@18.3.1/`,
  'react-dom': `${CDN}react-dom@18.3.1`,
  'react-dom/': `${CDN}react-dom@18.3.1/`,
  'react/jsx-runtime': `${CDN}react@18.3.1/jsx-runtime`,
  'react/jsx-dev-runtime': `${CDN}react@18.3.1/jsx-dev-runtime`,
  three: `${CDN}three@0.169.0`,
  'chart.js': `${CDN}chart.js@4.4.4`,
  lodash: `${CDN}lodash-es@4.17.21`,
  dayjs: `${CDN}dayjs@1.11.13`,
  zod: `${CDN}zod@3.23.8`,
  uuid: `${CDN}uuid@10.0.0`,
  nanoid: `${CDN}nanoid@5.0.7`,
  marked: `${CDN}marked@14.1.2`,
  dompurify: `${CDN}dompurify@3.1.6`,
  'canvas-confetti': `${CDN}canvas-confetti@1.9.3`,
  gsap: `${CDN}gsap@3.12.5`,
  d3: `${CDN}d3@7.9.0`,
  preact: `${CDN}preact@10.24.3`,
  htm: `${CDN}htm@3.1.1`,
  vue: `${CDN}vue@3.5.12`,
  svelte: `${CDN}svelte@5.0.0`,
  'matter-js': `${CDN}matter-js@0.20.0`,
  tone: `${CDN}tone@15.0.4`,
}

export type BundleResult = {
  html: string
  entry: string
  warnings: string[]
  cleanup: () => void
  modules: string[]
  runtime: string
}

export type BundleOptions = {
  /** Entry file path; defaults to the project entry / best guess. */
  entry?: string
  /** Show the console bridge (always on for run view). */
  bridge?: boolean
}

const SCRIPT_TYPES = new Set(['', 'text/javascript', 'module', 'application/javascript'])

function moduleType(path: string): string {
  const lang = languageForPath(path)
  return lang.id
}

function isHtml(path: string) {
  return extensionOf(path) === '.html' || extensionOf(path) === '.htm'
}

function isCss(path: string) {
  return ['.css', '.scss', '.less'].includes(extensionOf(path))
}

function isJson(path: string) {
  return extensionOf(path) === '.json'
}

/** Best-guess entry file for a project. */
export function resolveEntry(project: Project, requested?: string): string | undefined {
  const paths = project.files.map((f) => f.path)
  if (requested && paths.includes(requested)) return requested
  if (project.entry && paths.includes(project.entry)) return project.entry
  const preferred = ['index.html', 'src/index.html', 'public/index.html']
  for (const p of preferred) if (paths.includes(p)) return p
  const html = paths.find((p) => isHtml(p))
  if (html) return html
  const mains = ['src/index.tsx', 'src/main.tsx', 'src/index.ts', 'src/main.ts', 'index.js', 'src/index.js', 'app.js', 'main.py', 'main.c', 'main.cpp', 'main.go', 'Main.java', 'main.rs', 'index.php', 'main.rb', 'script.sh']
  for (const p of mains) if (paths.includes(p)) return p
  return paths.find((p) => languageForPath(p).runtime !== 'none')
}

export function findEntryForFile(project: Project, filePath: string): string | undefined {
  if (isHtml(filePath)) return filePath
  const entry = resolveEntry(project)
  const lang = languageForPath(filePath)
  // If the tapped file is runnable on its own and no HTML app exists, favor it.
  if (!entry) return filePath
  if (lang.runtime !== 'web' && lang.runtime !== 'none') return filePath
  if (isHtml(entry)) return entry
  return filePath
}

/* ------------------------------------------------------------------ */
/* Specifier rewriting                                                 */
/* ------------------------------------------------------------------ */

const SPECIFIER_RE = /(\bfrom\s*|\bimport\s*|\bimport\(\s*|\bexport\s*\*\s*from\s*|\brequire\(\s*)(['"])([^'"\n]+)\2/g

function resolveSpecifier(files: Map<string, ProjectFile>, fromPath: string, spec: string): string | null {
  if (!spec.startsWith('.') && !spec.startsWith('/')) return null
  const base = spec.startsWith('/') ? normalizePath(spec) : normalizePath(`${dirName(fromPath)}/${spec}`)
  const candidates = [base]
  if (!extensionOf(base)) {
    for (const ext of ['.js', '.ts', '.tsx', '.jsx', '.mjs', '.json', '.css']) candidates.push(base + ext)
    for (const ext of ['.js', '.ts', '.tsx', '.jsx', '.mjs', '.json']) candidates.push(`${base}/index${ext}`)
  }
  for (const candidate of candidates) if (files.has(candidate)) return candidate
  return null
}

function rewriteSpecifiers(
  code: string,
  fromPath: string,
  files: Map<string, ProjectFile>,
  mapping: Map<string, string>,
  warnings: string[],
): string {
  return code.replace(SPECIFIER_RE, (match, prefix: string, quote: string, spec: string) => {
    const trimmed = spec.trim()
    if (!trimmed) return match
    if (/^(https?:|data:|blob:|\/\/)/.test(trimmed)) return match
    const resolved = resolveSpecifier(files, fromPath, trimmed)
    if (resolved) {
      mapping.set(trimmed, resolved)
      return `${prefix}${quote}${MOD}${resolved}${quote}`
    }
    if (trimmed.startsWith('.') || trimmed.startsWith('/')) {
      warnings.push(`Missing module "${trimmed}" imported by ${fromPath}`)
      return match
    }
    // Bare specifier → CDN
    return `${prefix}${quote}${cdnUrlFor(trimmed)}${quote}`
  })
}

function cdnUrlFor(spec: string): string {
  if (BARE_IMPORTS[spec]) return BARE_IMPORTS[spec]
  const [name, ...rest] = spec.split('/')
  if (BARE_IMPORTS[name]) return `${BARE_IMPORTS[name].replace(/\/$/, '')}/${rest.join('/')}`
  for (const key of Object.keys(BARE_IMPORTS)) {
    if (spec.startsWith(key.endsWith('/') ? key : `${key}/`)) {
      return BARE_IMPORTS[key].replace(/\/$/, '') + spec.slice(key.replace(/\/$/, '').length)
    }
  }
  const at = name.startsWith('@') ? 2 : 1
  const parts = spec.split('/')
  const tail = parts.slice(at).join('/')
  return `${CDN}${parts.slice(0, at).join('/')}${tail ? `/${tail}` : ''}`
}

/* ------------------------------------------------------------------ */
/* Transpilation                                                       */
/* ------------------------------------------------------------------ */

export function transpile(code: string, path: string): { code: string; error?: string } {
  const lang = languageForPath(path).id
  const needsTs = lang === 'typescript' || lang === 'tsx'
  const needsJsx = lang === 'tsx' || lang === 'jsx'
  if (!needsTs && !needsJsx) return { code }
  try {
    const transforms: Array<'typescript' | 'jsx'> = []
    if (needsTs) transforms.push('typescript')
    if (needsJsx) transforms.push('jsx')
    const out = transform(code, {
      transforms,
      jsxRuntime: 'automatic',
      jsxImportSource: 'react',
      production: true,
      filePath: path,
      preserveDynamicImport: true,
    })
    return { code: out.code }
  } catch (error) {
    return { code, error: error instanceof Error ? error.message : String(error) }
  }
}

/* ------------------------------------------------------------------ */
/* HTML document builder                                               */
/* ------------------------------------------------------------------ */

const BRIDGE = `<script>(function(){
var fmt=function(v){try{
if(v===undefined)return 'undefined';if(v===null)return 'null';
if(typeof v==='string')return v;
if(typeof v==='number'||typeof v==='boolean')return String(v);
if(typeof v==='function')return '[function '+(v.name||'anonymous')+']';
if(v instanceof Error)return v.stack||(v.name+': '+v.message);
if(typeof Element!=='undefined'&&v instanceof Element)return '<'+v.tagName.toLowerCase()+(v.id?'#'+v.id:'')+'>';
if(Array.isArray(v))return '['+v.map(fmt).join(', ')+']';
if(typeof v==='object'){try{var s=JSON.stringify(v);if(s&&s!=='{}')return s}catch(e){}return Object.prototype.toString.call(v)}
return String(v)}catch(e){return '[value]'}};
var send=function(level,parts){try{parent.postMessage({__cody:true,kind:'console',level:level,text:parts.map(fmt).join(' '),time:Date.now()},'*')}catch(e){}};
['log','info','warn','error','debug'].forEach(function(level){
var orig=console[level]?console[level].bind(console):function(){};
console[level]=function(){send(level==='debug'?'log':level,Array.prototype.slice.call(arguments));orig.apply(null,arguments)};
});
var done=false;
var ready=function(){if(done)return;done=true;try{parent.postMessage({__cody:true,kind:'ready',title:document.title},'*')}catch(e){}};
window.addEventListener('error',function(e){send('error',[e.message||'Script error',(e.filename?(' at '+e.filename):'')+(e.lineno?(':'+e.lineno+':'+e.colno):'')])});
window.addEventListener('unhandledrejection',function(e){var r=e.reason;send('error',['Unhandled rejection: '+(r&&r.message?r.message:String(r))])});
document.addEventListener('DOMContentLoaded',ready);
window.addEventListener('load',ready);
setTimeout(ready,1200);
})();</script>`

const BASE_CSS = `<style>
:root{color-scheme:light dark}
*{box-sizing:border-box}
html,body{margin:0}
body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;line-height:1.5}
</style>`

function dataUrlFor(path: string, content: string): string | null {
  const ext = extensionOf(path)
  if (ext === '.svg') return `data:image/svg+xml;utf8,${encodeURIComponent(content)}`
  if (ext === '.json') return `data:application/json;charset=utf-8,${encodeURIComponent(content)}`
  return null
}

class Bundler {
  files: Map<string, ProjectFile>
  warnings: string[] = []
  urls: string[] = []
  importMap = new Map<string, string>()
  built = new Set<string>()

  constructor(files: ProjectFile[]) {
    this.files = new Map(files.map((f) => [f.path, f]))
  }

  blob(content: string, type: string): string {
    const url = URL.createObjectURL(new Blob([content], { type }))
    this.urls.push(url)
    return url
  }

  moduleUrl(path: string): string {
    const existing = this.importMap.get(path)
    if (existing) return existing
    const file = this.files.get(path)
    if (!file) return ''
    this.built.add(path)

    if (isCss(path)) {
      const css = this.inlineCss(file.content, path)
      const injector = `const s=document.createElement('style');s.dataset.codyFile=${JSON.stringify(
        path,
      )};s.textContent=${JSON.stringify(css)};document.head.appendChild(s);export default s;`
      const url = this.blob(injector, 'text/javascript')
      this.importMap.set(path, url)
      return url
    }

    if (isJson(path)) {
      let literal = 'null'
      try {
        literal = JSON.stringify(JSON.parse(file.content))
      } catch {
        this.warnings.push(`Invalid JSON in ${path}`)
        literal = 'null'
      }
      const url = this.blob(`export default ${literal};`, 'text/javascript')
      this.importMap.set(path, url)
      return url
    }

    const { code: transpiled, error } = transpile(file.content, path)
    if (error) this.warnings.push(`${path}: ${error}`)
    const rewritten = rewriteSpecifiers(transpiled, path, this.files, new Map(), this.warnings)
    const url = this.blob(`${rewritten}\n//# sourceURL=cody:///${path}`, 'text/javascript')
    this.importMap.set(path, url)
    return url
  }

  inlineCss(css: string, path: string): string {
    return css.replace(/@import\s+(?:url\()?['"]?([^'")\s]+)['"]?\)?\s*;/g, (match, spec: string) => {
      const resolved = resolveSpecifier(this.files, path, spec)
      if (!resolved) return match
      const file = this.files.get(resolved)
      return file ? this.inlineCss(file.content, resolved) : match
    })
  }

  /** Walk the module graph so every local import ends up in the import map. */
  crawl(path: string, seen = new Set<string>()) {
    if (seen.has(path)) return
    seen.add(path)
    const file = this.files.get(path)
    if (!file) return
    if (isCss(path) || isJson(path)) {
      this.moduleUrl(path)
      return
    }
    const { code } = transpile(file.content, path)
    this.moduleUrl(path)
    for (const match of code.matchAll(SPECIFIER_RE)) {
      const spec = match[3]
      const resolved = resolveSpecifier(this.files, path, spec)
      if (resolved) this.crawl(resolved, seen)
    }
  }

  assetUrl(path: string): string | null {
    const file = this.files.get(path)
    if (!file) return null
    return dataUrlFor(path, file.content)
  }

  /** Inline <link> and <script src> tags that point at project files. */
  inlineHtml(html: string, htmlPath: string): string {
    let out = html

    out = out.replace(
      /<link\b[^>]*rel=["']?stylesheet["']?[^>]*>/gi,
      (tag) => {
        const href = /href=["']([^"']+)["']/i.exec(tag)?.[1]
        if (!href) return tag
        const resolved = resolveSpecifier(this.files, htmlPath, href)
        if (!resolved) return tag
        const file = this.files.get(resolved)
        if (!file) return tag
        return `<style data-cody-file="${escapeHtml(resolved)}">\n${this.inlineCss(file.content, resolved)}\n</style>`
      },
    )

    out = out.replace(/<script\b([^>]*)\bsrc=["']([^"']+)["']([^>]*)>\s*<\/script>/gi, (tag, pre, src, post) => {
      const attrs = `${pre} ${post}`.trim()
      const resolved = resolveSpecifier(this.files, htmlPath, src)
      if (!resolved) return tag
      const file = this.files.get(resolved)
      if (!file) return tag
      const isModule = /type=["']?module/i.test(attrs)
      if (isModule) {
        const url = this.moduleUrl(resolved)
        const kept = attrs.replace(/\bsrc=["'][^"']*["']/i, '').trim()
        return `<script type="module" ${kept} src="${url}"></script>`
      }
      const safe = file.content.replace(/<\/script>/gi, '<\\/script>')
      return `<script ${attrs.replace(/\bsrc=["'][^"']*["']/i, '').trim()} data-cody-file="${escapeHtml(
        resolved,
      )}">\n${safe}\n</script>`
    })

    // Inline module scripts can import project files too.
    out = out.replace(/<script\b([^>]*type=["']module["'][^>]*)>([\s\S]*?)<\/script>/gi, (tag, attrs, body: string) => {
      if (!body.trim()) return tag
      const { code } = transpile(body, htmlPath)
      const rewritten = rewriteSpecifiers(code, htmlPath, this.files, new Map(), this.warnings)
      for (const match of rewritten.matchAll(SPECIFIER_RE)) {
        const resolved = resolveSpecifier(this.files, htmlPath, match[3])
        if (resolved) this.crawl(resolved)
      }
      return `<script ${attrs}>\n${rewritten}\n</script>`
    })

    // Local images / svg assets.
    out = out.replace(/(src|href)=["']([^"']+)["']/gi, (match, attr: string, value: string) => {
      const resolved = resolveSpecifier(this.files, htmlPath, value)
      if (!resolved) return match
      const url = this.assetUrl(resolved)
      return url ? `${attr}="${url}"` : match
    })

    return out
  }

  importMapTag(): string {
    const imports: Record<string, string> = {}
    for (const [path, url] of this.importMap) imports[`${MOD}${path}`] = url
    for (const [spec, target] of Object.entries(BARE_IMPORTS)) {
      if (spec.endsWith('/')) continue
      imports[spec] = target
    }
    if (Object.keys(imports).length === 0) return ''
    return `<script type="importmap">${JSON.stringify({ imports })}</script>`
  }

  inject(head: string, extra: string): string {
    const tags = `${this.importMapTag()}${extra}`
    if (/<head[^>]*>/i.test(head)) return head.replace(/<head[^>]*>/i, (m) => `${m}\n${tags}`)
    if (/<html[^>]*>/i.test(head)) return head.replace(/<html[^>]*>/i, (m) => `${m}\n<head>${tags}</head>`)
    return `${tags}\n${head}`
  }
}

export function bundleProject(project: Project, options: BundleOptions = {}): BundleResult | null {
  const entry = resolveEntry(project, options.entry)
  if (!entry) return null
  const bundler = new Bundler(project.files)
  const cleanup = () => {
    for (const url of bundler.urls) URL.revokeObjectURL(url)
    bundler.urls = []
  }

  if (isHtml(entry)) {
    const file = bundler.files.get(entry)
    if (!file) return null
    const inlined = bundler.inlineHtml(file.content, entry)
    const html = bundler.inject(inlined, `${BASE_CSS}${options.bridge === false ? '' : BRIDGE}`)
    return {
      html,
      entry,
      warnings: bundler.warnings,
      cleanup,
      modules: [...bundler.importMap.keys()],
      runtime: 'browser',
    }
  }

  const lang = languageForPath(entry)
  const { code, error } = transpile(bundler.files.get(entry)?.content ?? '', entry)
  if (error) bundler.warnings.push(`${entry}: ${error}`)
  bundler.crawl(entry)
  const rewrittenEntry = rewriteSpecifiers(code, entry, bundler.files, new Map(), bundler.warnings)
  const entryUrl = bundler.blob(`${rewrittenEntry}\n//# sourceURL=cody:///${entry}`, 'text/javascript')
  bundler.importMap.set(entry, entryUrl)

  const isReact = ['tsx', 'jsx'].includes(lang.id)
  const body = isReact
    ? '<div id="root"></div>'
    : `<div id="cody-run" style="font-family:ui-monospace,SFMono-Regular,Menlo,monospace;padding:18px;font-size:13px;line-height:1.6"><div style="opacity:.55;margin-bottom:10px">Running <b>${escapeHtml(
        fileName(entry),
      )}</b> — console output is streamed below.</div></div>`

  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
<title>${escapeHtml(project.name)} · ${escapeHtml(fileName(entry))}</title>
${bundler.importMapTag()}
${options.bridge === false ? '' : BRIDGE}
${BASE_CSS}
<style>
  :root{color-scheme:dark}
  body{background:#0e1116;color:#e8ecf3;margin:0;min-height:100dvh}
</style>
</head>
<body>
${body}
<script type="module">
try { await import(${JSON.stringify(`${MOD}${entry}`)}) } catch (error) { console.error(error) }
</script>
</body>
</html>`

  return {
    html,
    entry,
    warnings: bundler.warnings,
    cleanup,
    modules: [...bundler.importMap.keys()],
    runtime: isReact ? 'react (esm.sh)' : 'browser',
  }
}

/** Build a standalone HTML string for download / new tab preview. */
export function htmlForDownload(bundle: BundleResult): Blob {
  return new Blob([bundle.html], { type: 'text/html;charset=utf-8' })
}
