/**
 * DOM smoke test: mounts the real App in jsdom and walks the primary flows
 * (boot → open project → run → create project → add file → editor → build).
 */
import { JSDOM } from 'jsdom'

const dom = new JSDOM('<!doctype html><html><head></head><body><div id="root"></div></body></html>', {
  url: 'https://cody.test/',
  pretendToBeVisual: true,
})

const g = globalThis as unknown as Record<string, unknown>
g.window = dom.window
g.document = dom.window.document
Object.defineProperty(g, 'navigator', { value: dom.window.navigator, configurable: true })
g.HTMLElement = dom.window.HTMLElement
g.Element = dom.window.Element
g.Node = dom.window.Node
g.Event = dom.window.Event
g.CustomEvent = dom.window.CustomEvent
g.KeyboardEvent = dom.window.KeyboardEvent
g.MouseEvent = dom.window.MouseEvent
g.getComputedStyle = dom.window.getComputedStyle
g.requestAnimationFrame = (cb: FrameRequestCallback) => setTimeout(() => cb(Date.now()), 16)
g.cancelAnimationFrame = (id: number) => clearTimeout(id)
g.localStorage = dom.window.localStorage
g.Blob = dom.window.Blob
g.File = dom.window.File
const mmStub = () => ({ matches: false, addEventListener() {}, removeEventListener() {}})
g.matchMedia = mmStub
dom.window.matchMedia = mmStub as never
g.URL.createObjectURL = () => 'blob:cody-test'
g.URL.revokeObjectURL = () => undefined
g.indexedDB = undefined
g.structuredClone = (value: unknown) => JSON.parse(JSON.stringify(value))
g.MutationObserver = dom.window.MutationObserver
g.ResizeObserver = class {
  observe() {}
  unobserve() {}
  disconnect() {}
}
g.IntersectionObserver = class {
  observe() {}
  unobserve() {}
  disconnect() {}
}
g.DOMRect = dom.window.DOMRect
g.Range = dom.window.Range
g.HTMLInputElement = dom.window.HTMLInputElement
g.HTMLTextAreaElement = dom.window.HTMLTextAreaElement
g.DOMParser = dom.window.DOMParser
g.Window = dom.window.Window
g.HTMLDocument = dom.window.HTMLDocument
g.ShadowRoot = dom.window.ShadowRoot
dom.window.ResizeObserver = g.ResizeObserver as never
dom.window.IntersectionObserver = g.IntersectionObserver as never
g.IS_REACT_ACT_ENVIRONMENT = false

const errors: string[] = []
const seen = new Set<string>()
const originalError = console.error
console.error = (...args: unknown[]) => {
  const message = args.map(String).join(' ')
  if (/not wrapped in act|Warning: /.test(message)) return
  if (/getClientRects is not a function|ResizeObserver/.test(message)) return
  if (!seen.has(message)) {
    seen.add(message)
    errors.push(message)
    originalError(...args)
  }
}
dom.window.addEventListener('error', (event) => {
  const message = `window error: ${event.message}`
  // jsdom has no layout engine; CodeMirror's measuring APIs are unavailable there.
  if (/getClientRects is not a function|Not implemented/.test(message)) return
  errors.push(message)
})

function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function text() {
  return dom.window.document.body.textContent ?? ''
}

function buttons(): HTMLElement[] {
  return [...dom.window.document.querySelectorAll('button')] as HTMLElement[]
}

function findByText(label: string): HTMLElement | null {
  const all = buttons()
  return (
    all.find((node) => (node.textContent ?? '').trim() === label) ??
    all.find((node) => (node.textContent ?? '').includes(label)) ??
    null
  )
}

function findByLabel(label: string): HTMLElement | null {
  return dom.window.document.querySelector<HTMLElement>(`[aria-label="${label}"]`)
}

async function clickLabel(label: string) {
  const node = findByLabel(label)
  if (!node) throw new Error(`Element not found by aria-label: ${label}`)
  node.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true, cancelable: true }))
  await wait(80)
}

async function click(text_: string) {
  const node = findByText(text_)
  if (!node) throw new Error(`Button not found: ${text_}`)
  node.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true, cancelable: true }))
  await wait(120)
}

async function typeInto(selector: string, value: string) {
  const input = dom.window.document.querySelector<HTMLInputElement>(selector)
  if (!input) throw new Error(`Input not found: ${selector}`)
  // React tracks the DOM value; go through the native setter so onChange fires.
  const setter = Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype, 'value')?.set
  setter?.call(input, value)
  input.dispatchEvent(new dom.window.Event('input', { bubbles: true }))
  await wait(80)
}

async function main() {
  const { createRoot } = await import('react-dom/client')
  const { createElement } = await import('react')
  const App = (await import('../src/App')).default

  const root = createRoot(dom.window.document.getElementById('root')!)
  root.render(createElement(App))
  await wait(700)

  const checks: Array<[string, boolean, string?]> = []
  const check = (label: string, ok: boolean, extra?: string) => checks.push([label, ok, extra])

  // Cold boot with empty storage: the editor must be first paint.
  check('boots straight into a workspace', text().includes('Untitled'))
  check('editor mounted on first paint', Boolean(dom.window.document.querySelector('.cm-editor')))
  check('no landing page copy', !text().includes('from your phone') && !text().includes('Start from a template'))
  check('file chip shows the entry file', text().includes('index.html'))
  check('scratch project is runnable', Boolean(findByLabel('Run project')))

  await clickLabel('Run project')
  await wait(600)
  const iframe = dom.window.document.querySelector<HTMLIFrameElement>('iframe.preview-frame')
  const srcdoc = iframe?.getAttribute('srcdoc') ?? ''
  check('preview iframe mounted', Boolean(iframe))
  check('preview inlined the stylesheet', srcdoc.includes('data-cody-file="styles.css"'))
  check('preview inlined the script', srcdoc.includes('pings') && srcdoc.includes('id="ping"'))
  check('preview has console bridge', srcdoc.includes('__cody'))

  await click('Output')
  check('console recorded the run', text().includes('module') || text().includes('Browser'))

  // --- workspace switcher: create a project from a template -------------
  await clickLabel('Switch workspace')
  await wait(250)
  check('switcher opened', text().includes('Workspaces'))
  check('current workspace marked', text().includes('Untitled'))

  await click('New')
  await wait(200)
  check('template list shown', text().includes('React + TypeScript'))

  await click('Web app')
  await wait(250)
  check('template prompt opened', text().includes('New Web app project'))
  await typeInto('.sheet input.text-input', 'Smoke app')
  await click('Create')
  await wait(600)
  check('new project opened', text().includes('Smoke app'))
  check('switcher closed after create', !text().includes('Workspaces'))
  check('new project has index.html', text().includes('index.html'))

  // the switcher reopens on the list and keeps the previous workspace
  await clickLabel('Switch workspace')
  await wait(250)
  check('switcher reopens on the list', text().includes('Untitled') && text().includes('Smoke app'))

  // --- a React workspace transpiles + import-maps in the preview ---------
  await click('New')
  await wait(200)
  await click('React + TypeScript')
  await wait(250)
  await typeInto('.sheet input.text-input', 'React smoke')
  await click('Create')
  await wait(600)
  check('react workspace opened', text().includes('React smoke'))
  await clickLabel('Run project')
  await wait(600)
  const reactDoc =
    dom.window.document.querySelector<HTMLIFrameElement>('iframe.preview-frame')?.getAttribute('srcdoc') ?? ''
  check('react preview has an import map', reactDoc.includes('type="importmap"'))
  check('react preview maps project modules', reactDoc.includes('https://cody.local/src/main.tsx'))
  check('react preview transpiled JSX', !reactDoc.includes('useState<Item[]>'))

  // --- add a nested file ------------------------------------------------
  await click('Files')
  await click('New')
  await wait(150)
  check('new file sheet opened', text().includes('Type a path'))
  await typeInto('.sheet input.text-input', 'src/util/helper.js')
  await click('Create file')
  await wait(300)
  check('nested file created', text().includes('helper.js'))
  check('folder node created', text().includes('util'))

  // --- editor mounts for the active file --------------------------------
  await click('Code')
  await wait(400)
  check('code editor mounted', Boolean(dom.window.document.querySelector('.cm-editor')))
  check('editor toolbar present', Boolean(findByLabel('Undo') && findByLabel('Find')))

  // --- build assist -----------------------------------------------------
  await click('Build')
  await wait(200)
  check('snippet library visible', text().includes('Tap-friendly button'))
  check('project stats visible', text().includes('runnable'))

  // --- snippet insert lands in the editor ------------------------------
  await click('Insert')
  await wait(700)
  const cmContent = dom.window.document.querySelector('.cm-content')?.textContent ?? ''
  check('snippet inserted into editor', cmContent.includes('async function load') || cmContent.length > 40, cmContent.slice(0, 60))
  check('editor tab active after insert', Boolean(dom.window.document.querySelector('.editor-toolbar')))

  // --- switch files through the chip menu -------------------------------
  const chip = dom.window.document.querySelector<HTMLElement>('.file-chip')
  chip?.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true, cancelable: true }))
  await wait(150)
  await click('index.html')
  await wait(300)
  const mergedContent = dom.window.document.querySelector('.cm-content')?.textContent ?? ''
  check('file switch remounts editor', Boolean(dom.window.document.querySelector('.cm-editor')))
  check('switched file content loaded', mergedContent.includes('<main') || mergedContent.includes('doctype'), mergedContent.slice(0, 40))

  // --- settings sheet ---------------------------------------------------
  await clickLabel('Project menu')
  await wait(150)
  await click('App settings')
  await wait(200)
  check('settings opened', text().includes('Runner') && text().includes('Piston'))
  await clickLabel('Close')

  let failures = 0
  for (const [label, ok, extra] of checks) {
    if (ok) console.log('  ok  ', label)
    else {
      failures += 1
      console.log('  FAIL', label, extra ?? '')
    }
  }

  if (errors.length > 0) {
    failures += errors.length
    console.log('\nRuntime errors:')
    for (const message of errors.slice(0, 10)) console.log('  ✗', message.slice(0, 300))
  }

  root.unmount()
  console.log(failures === 0 ? '\nAll app smoke checks passed' : `\n${failures} app smoke checks failed`)
  process.exit(failures === 0 ? 0 : 1)
}

main().catch((error) => {
  console.log('FAILED', error)
  process.exit(1)
})
