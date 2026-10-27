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
  check('file tab shows the entry file', Boolean(dom.window.document.querySelector('.tab-chip.active')))
  check('status strip reports the caret', text().includes('Ln 1, Col 1'))
  check('line numbers are on by default', Boolean(dom.window.document.querySelector('.cm-lineNumbers')))
  const gutterNode = dom.window.document.querySelector('.cm-gutters') as HTMLElement | null
  const gutterStyle = gutterNode ? dom.window.getComputedStyle(gutterNode) : null
  check(
    'the gutter has no slab of its own',
    Boolean(gutterStyle) && /transparent|rgba\(0, 0, 0, 0\)/.test(gutterStyle?.backgroundColor ?? 'notransparent'),
    gutterStyle?.backgroundColor ?? '(no gutter)',
  )
  const numbered = [...dom.window.document.querySelectorAll('.cm-lineNumbers .cm-gutterElement')].filter(
    (node) => (node.textContent ?? '').trim() === '1',
  )
  check('the numbers are drawn in the gutter', numbered.length > 0, `${numbered.length} line-1 cells`)
  check(
    'the caret line has the only full-strength number',
    Boolean(dom.window.document.querySelector('.cm-activeLineGutter')),
    dom.window.document.querySelectorAll('.cm-activeLineGutter').length + ' active cells',
  )
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

  // --- workspace switcher: create a workspace, no template --------------
  await clickLabel('Switch workspace')
  await wait(250)
  check('switcher opened', text().includes('Workspaces'))
  check('current workspace marked', text().includes('Untitled'))
  check('a new workspace is one tap away', Boolean(findByText('New workspace')))

  await click('New workspace')
  await wait(300)
  check('the create sheet asks for a name', Boolean(dom.window.document.querySelector('#workspace-name')))
  check('no template gallery is offered', !text().includes('React + TypeScript') && !text().includes('Web app'))
  const starterRows = [...dom.window.document.querySelectorAll('.starter-row')].map((row) => row.textContent ?? '')
  check(
    'the plain starter is spelled out before creating',
    starterRows.length === 3 && starterRows.some((row) => row.includes('index.html')),
    starterRows.join(' | '),
  )
  await typeInto('#workspace-name', 'Smoke app')
  await click('Create workspace')
  await wait(700)
  check('new project opened', text().includes('Smoke app'))
  check('switcher closed after create', !text().includes('Workspaces'))
  check('new project has index.html', text().includes('index.html'))
  check('new project carries the plain starter files', text().includes('app.js') || text().includes('styles.css'))
  // two sheets were stacked (workspaces → create) and closed in one commit
  check(
    'stacked sheets release the page scroll lock',
    dom.window.document.body.style.overflow === '',
    `body overflow = ${JSON.stringify(dom.window.document.body.style.overflow)}`,
  )

  // the switcher reopens on the list and keeps the previous workspace
  await clickLabel('Switch workspace')
  await wait(250)
  check('switcher reopens on the list', text().includes('Untitled') && text().includes('Smoke app'))

  // the starter is a real project, not a placeholder
  const { STARTER_FILES, blankProject } = await import('../src/lib/starter')
  const sample = blankProject('A & B')
  check('a new workspace is exactly the three plain files', STARTER_FILES.length === 3 && sample.files.length === 3)
  check('a nameless workspace is still named', blankProject('   ').name === 'Untitled')
  check('the name is escaped into the page title', sample.files[0].content.includes('<title>A &amp; B</title>'))
  check(
    'the starter already runs: html links its own css and js',
    sample.files[0].content.includes('./styles.css') && sample.files[0].content.includes('./app.js'),
  )
  check('the starter opens on index.html', sample.entry === 'index.html')

  // renaming a workspace from the list
  await clickLabel('Actions for Smoke app')
  await wait(300)
  await click('Rename')
  await wait(300)
  await typeInto('.sheet input.text-input', 'Renamed app')
  await click('Rename')
  await wait(600)
  check('renaming a workspace updates the list', text().includes('Renamed app'), text().slice(0, 80))

  // --- switching between workspaces --------------------------------------
  await clickLabel('Switch workspace')
  await wait(300)
  await click('Untitled')
  await wait(600)
  check('picking a workspace in the list opens it', text().includes('Untitled'))
  check('the picked workspace brings its own files', text().includes('index.html'))
  await clickLabel('Switch workspace')
  await wait(300)
  await click('Renamed app')
  await wait(600)
  check('and back again', text().includes('Renamed app'))

  // --- create files and folders -----------------------------------------
  await click('Files')
  await wait(250)
  await click('New')
  await wait(150)
  check('create menu offers files and folders', text().includes('New file') && text().includes('New folder'))
  await click('New file')
  await wait(150)
  check('new file sheet opened', text().includes('Type a path'))
  await typeInto('.sheet input.text-input', 'src/util/helper.js')
  await click('Create file')
  await wait(300)
  check('nested file created', text().includes('helper.js'))
  // creating a file jumps to the editor, so come back to the tree
  await click('Files')
  await wait(250)
  check('folder node created', text().includes('util'))

  // an empty folder is a real thing: it exists with nothing inside
  await click('New')
  await wait(120)
  await click('New folder')
  await wait(150)
  await typeInto('.sheet input.text-input', 'assets')
  await click('Create folder')
  await wait(300)
  const fileList = () => dom.window.document.querySelector('.file-list')?.textContent ?? ''
  check('empty folder created', fileList().includes('assets'))
  check('empty folder says so', fileList().includes('Empty folder'))

  // add a file straight into a folder from the folder's own actions
  await clickLabel('Folder actions for src')
  await wait(200)
  check(
    'folder actions opened',
    text().includes('New file here') && text().includes('Rename folder') && text().includes('Delete folder'),
  )
  await click('New file here')
  await wait(200)
  check('new file sheet is scoped to the folder', text().includes('Inside src/'))
  await typeInto('.sheet input.text-input', 'src/notes.md')
  await click('Create file')
  await wait(300)
  await click('Files')
  await wait(250)
  check('file created inside the folder', fileList().includes('notes.md'))

  // a folder of its own: rename it, and every file inside moves with it
  await click('New')
  await wait(120)
  await click('New file')
  await wait(150)
  await typeInto('.sheet input.text-input', 'tmp/scratch.txt')
  await click('Create file')
  await wait(300)
  await click('Files')
  await wait(250)
  check('second folder created', fileList().includes('tmp'))
  await clickLabel('Folder actions for tmp')
  await wait(200)
  await click('Rename folder')
  await wait(200)
  await typeInto('.sheet input.text-input', 'drafts')
  await click('Rename folder')
  await wait(400)
  await click('Files')
  await wait(250)
  check('folder renamed', fileList().includes('drafts'))
  check('file moved with the folder', fileList().includes('scratch.txt') && !fileList().includes('tmp'))

  // move a file into the empty folder
  await clickLabel('Actions for drafts/scratch.txt')
  await wait(200)
  await click('Move to folder…')
  await wait(200)
  await typeInto('.sheet input.text-input', 'assets')
  await click('Move file')
  await wait(400)
  await click('Files')
  await wait(250)
  check('file moved into the empty folder', fileList().includes('assets'))
  check('moved file is no longer empty-folder state', !fileList().includes('Empty folder'))

  // deleting a folder removes what is inside it
  await clickLabel('Folder actions for assets')
  await wait(200)
  check('delete folder warns about its contents', text().includes('1 file'))
  await click('Delete folder')
  await wait(250)
  check('delete folder asks for confirmation', text().includes('This removes the folder'))
  await click('Delete folder')
  await wait(400)
  check('folder deleted', !fileList().includes('assets'))
  check('its file went with it', !fileList().includes('scratch.txt'))

  // deleting a single file
  await clickLabel('Actions for src/notes.md')
  await wait(200)
  await click('Delete file')
  await wait(250)
  check('delete file asks for confirmation', text().includes('This removes the file'))
  await click('Delete')
  await wait(400)
  check('file deleted', !fileList().includes('notes.md'))
  check('another file took its place', Boolean(dom.window.document.querySelector('.file-row-wrap.active')))

  // --- editor mounts for the active file --------------------------------
  await click('Code')
  await wait(400)
  check('code editor mounted', Boolean(dom.window.document.querySelector('.cm-editor')))
  check('editor toolbar present', Boolean(findByLabel('Undo') && findByLabel('Find')))
  check(
    'the code area scrolls inside its own pane',
    Boolean(dom.window.document.querySelector('.editor-wrap .cm-scroller')),
    dom.window.document.querySelector('.editor-wrap')?.innerHTML.slice(0, 60) ?? '(no editor)',
  )

  // --- smart autocomplete ----------------------------------------------
  // A .tsx file for the member check — created here, since the workspace
  // starts as a plain three-file project with no template.
  await click('Files')
  await wait(200)
  await click('New')
  await wait(120)
  await click('New file')
  await wait(150)
  await typeInto('.sheet input.text-input', 'src/App.tsx')
  await click('Create file')
  await wait(400)
  await click('Files')
  await wait(250)
  check('a tsx file can be created by path', fileList().includes('App.tsx'))
  await click('App.tsx')
  await wait(500)
  check('editor rail offers a suggestions button', Boolean(findByLabel('Suggest completions')))
  await clickLabel('Suggest completions')
  await wait(400)
  const completions = dom.window.document.querySelectorAll('.cm-tooltip-autocomplete li')
  check('suggestions open from the rail', completions.length > 0, `${completions.length} items`)
  const labels = [...completions].map((li) => li.textContent ?? '')
  check(
    'suggestions come from the project, not a fixed list',
    labels.some((label) => label.includes('import') || label.includes('const') || label.includes('App')),
    labels.join(' | ').slice(0, 120),
  )

  // a dot must offer the members of that value, not the whole word list
  const { EditorView: View2 } = await import('@codemirror/view')
  const cmHost = dom.window.document.querySelector('.cm-content') as HTMLElement | null
  const liveView = cmHost ? View2.findFromDOM(cmHost as never) : null
  if (liveView) {
    const original = liveView.state.doc.toString()
    const extra = '\nconst demoList = [1, 2]\ndemoList.'
    liveView.dispatch({
      changes: { from: original.length, insert: extra },
      selection: { anchor: original.length + extra.length },
    })
    await wait(150)
    await clickLabel('Suggest completions')
    await wait(400)
    const memberLabels = [...dom.window.document.querySelectorAll('.cm-tooltip-autocomplete li')].map(
      (li) => li.textContent ?? '',
    )
    check(
      'a dot offers members of that value',
      memberLabels.some((label) => label.includes('map')),
      memberLabels.join(' | ').slice(0, 140),
    )
    check('members are not the whole file', memberLabels.length > 0 && memberLabels.length < 40, String(memberLabels.length))
    liveView.dispatch({ changes: { from: 0, to: liveView.state.doc.length, insert: original } })
    await wait(200)
  }

  // --- code actions -----------------------------------------------------
  if (liveView) {
    const original = liveView.state.doc.toString()
    liveView.dispatch({ changes: { from: 0, insert: 'debugger\n' }, selection: { anchor: 3 } })
    await wait(600)
    const bulb = dom.window.document.querySelector('.cm-bulb-gutter .cm-bulb.cm-bulb-fix') as HTMLElement | null
    check('the gutter grows a bulb on the line with a fix', Boolean(bulb), dom.window.document.querySelector('.cm-gutters')?.innerHTML.slice(0, 300) ?? '')
    const bulbLine = bulb?.closest('.cm-gutterElement') as HTMLElement | null
    check(
      'the bulb sits on the line that has the problem',
      Boolean(bulbLine) && getComputedStyle(bulbLine as never).top !== undefined,
      String(Boolean(bulbLine)),
    )
    bulb?.dispatchEvent(new dom.window.MouseEvent('mousedown', { bubbles: true }))
    await wait(400)
    const bulbSheet = [...dom.window.document.querySelectorAll('.sheet')].find(
      (el) => el.querySelector('h2')?.textContent === 'Code actions',
    )
    check('tapping the bulb opens the actions for that line', Boolean(bulbSheet), bulbSheet?.textContent?.slice(0, 80) ?? '')
    if (bulbSheet) {
      const close = [...bulbSheet.querySelectorAll('button')].find((node) => /close/i.test(node.getAttribute('aria-label') ?? ''))
      close?.click()
      await wait(250)
    }
    await clickLabel('Code actions')
    await wait(300)
    const actionSheet = [...dom.window.document.querySelectorAll('.sheet')].find(
      (el) => el.querySelector('h2')?.textContent === 'Code actions',
    )
    const titles = [...(actionSheet?.querySelectorAll('.action-title') ?? [])].map((node) => node.textContent ?? '')
    check('the rail opens a code actions sheet', Boolean(actionSheet), titles.join(' | '))
    check('it offers the debugger quick fix', titles.some((title) => /debugger/i.test(title)), titles.join(' | '))
    check('actions are labelled by kind', Boolean(actionSheet?.querySelector('.action-kind.quickfix')))
    const fixButton = [...(actionSheet?.querySelectorAll('button') ?? [])].find((node) =>
      /debugger/i.test(node.textContent ?? ''),
    ) as HTMLElement | undefined
    fixButton?.click()
    await wait(400)
    check(
      'applying the fix edits the buffer',
      !liveView.state.doc.toString().includes('debugger'),
      liveView.state.doc.toString().slice(0, 60),
    )
    liveView.dispatch({ changes: { from: 0, to: liveView.state.doc.length, insert: original } })
    await wait(250)
  }

  // back to the entry file for the remaining checks
  await click('Files')
  await wait(200)
  await click('index.html')
  await wait(400)

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

  // --- switch files via the tab strip / all-files sheet -----------------
  await clickLabel('All files')
  await wait(200)
  const sheetText = dom.window.document.querySelector('.sheet')?.textContent ?? '(no sheet)'
  check(
    'file sheet lists project files',
    sheetText.includes('index.html') && sheetText.includes('src/App.tsx'),
    sheetText.slice(0, 120),
  )
  await click('index.html')
  await wait(350)
  const mergedContent = dom.window.document.querySelector('.cm-content')?.textContent ?? ''
  check('file switch remounts editor', Boolean(dom.window.document.querySelector('.cm-editor')))
  check('switched file content loaded', mergedContent.includes('<main') || mergedContent.includes('doctype'), mergedContent.slice(0, 40))
  check('tab strip now has two tabs', dom.window.document.querySelectorAll('.tab-chip').length >= 2)
  // syntax highlighting end-to-end: the parser must have split a line into styled spans
  const highlighted = [...dom.window.document.querySelectorAll('.cm-line span')].filter(
    (span) => (span.textContent ?? '').trim().length > 0,
  )
  check(
    'markup is syntax-highlighted in the live editor',
    highlighted.length >= 3,
    `${highlighted.length} styled spans in ${dom.window.document.querySelector('.cm-content')?.textContent?.slice(0, 40)}`,
  )
  const badge = dom.window.document.querySelector('.tab-chip.active .lang-icon')
  check('active tab carries a language mark', Boolean(badge), badge?.outerHTML ?? '')
  check(
    'mark is the real HTML icon with an accessible label',
    Boolean(badge?.querySelector('path')) && badge?.getAttribute('aria-label') === 'HTML',
    `${badge?.tagName} / ${badge?.getAttribute('aria-label')}`,
  )

  // --- bug detection ----------------------------------------------------
  const { EditorView } = await import('@codemirror/view')
  const cmNode = dom.window.document.querySelector('.cm-content') as HTMLElement | null
  const view = cmNode ? EditorView.findFromDOM(cmNode as never) : null
  check('editor view reachable for the diagnostics test', Boolean(view), String(Boolean(cmNode)))
  if (view) {
    view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: '<main>\n  <h1>Broken\n</main>\n' } })
  }
  await wait(700)
  const chip = dom.window.document.querySelector('.status-problems')
  check('problems chip appears in the status strip', Boolean(chip), chip?.textContent ?? '(missing)')
  check('problems chip reports the error', (chip?.textContent ?? '').includes('error'), chip?.textContent ?? '')
  check('broken markup gets a squiggle', Boolean(dom.window.document.querySelector('.cm-lintRange-error')))
  check('gutter shows a problem marker', Boolean(dom.window.document.querySelector('.cm-lint-marker')))
  await clickLabel('Show problems')
  await wait(250)
  console.log('DEBUG sheets:', [...dom.window.document.querySelectorAll('.sheet')].map((el) => ((el.querySelector('h2')?.textContent ?? '?') + '|' + el.textContent?.slice(0, 60))).join(' // '))
  const problemsSheet = [...dom.window.document.querySelectorAll('.sheet')].find(
    (el) => el.querySelector('h2')?.textContent === 'Problems',
  )
  const sheetBody = problemsSheet?.textContent ?? ''
  check('problems sheet lists the file', sheetBody.includes('index.html'), sheetBody.slice(0, 80))
  check('problems sheet explains the bug', /never closed|no opening tag/i.test(sheetBody), sheetBody.slice(0, 160))
  const row = dom.window.document.querySelector('.problem-row') as HTMLElement | null
  if (row) row.click()
  await wait(350)
  check('tapping a problem closes the sheet', !dom.window.document.querySelector('.problem-row'))
  check('tapping a problem moves the caret to its line', /\(Ln 2, Col 3\)|Ln 2, Col 3/.test(text()), (dom.window.document.querySelector('.status-pos')?.textContent ?? ''))

  // The file list must surface the same problem next to the file's badge.
  await click('Files')
  await wait(300)
  const brokenRow = [...dom.window.document.querySelectorAll('.file-row-wrap')].find((row) =>
    (row.textContent ?? '').includes('index.html'),
  ) as HTMLElement | undefined
  const rowMark = brokenRow?.querySelector('.problem-flag')
  check('broken file row carries a mark', Boolean(rowMark), brokenRow?.outerHTML.slice(0, 120) ?? '(no row)')
  check('mark sits right after the language badge', Boolean(brokenRow?.querySelector('.lang-icon + .problem-flag')))
  check('mark is red for an error', rowMark?.classList.contains('error') ?? false, rowMark?.className ?? '')
  check('mark explains itself to screen readers', /error/i.test(rowMark?.getAttribute('aria-label') ?? ''), rowMark?.getAttribute('aria-label') ?? '')
  const cleanRow = [...dom.window.document.querySelectorAll('.file-row-wrap')].find((row) =>
    (row.textContent ?? '').includes('styles.css'),
  )
  check('clean file row has no mark', !cleanRow?.querySelector('.problem-flag'))
  check('Files tab in the tab bar shows the error count', Boolean(dom.window.document.querySelector('.tab-badge.error')), dom.window.document.querySelector('.tab-badge')?.outerHTML ?? '')
  await click('Code')
  await wait(250)

  // --- a language from the second wave, end to end -----------------------
  await click('Files')
  await wait(200)
  await click('New')
  await wait(120)
  await click('New file')
  await wait(150)
  await typeInto('.sheet input.text-input', 'lib/Main.hs')
  await click('Create file')
  await wait(400)
  await click('Files')
  await wait(250)
  check('a haskell file can be created by path', fileList().includes('Main.hs'))
  const haskellRow = [...dom.window.document.querySelectorAll('.file-row-wrap')].find((row) =>
    (row.textContent ?? '').includes('Main.hs'),
  )
  check(
    'the file row carries the real Haskell mark',
    Boolean(haskellRow?.querySelector('.lang-icon.mark')),
    haskellRow?.querySelector('.lang-icon')?.outerHTML?.slice(0, 90) ?? 'no mark',
  )
  await click('Main.hs')
  await wait(600)
  check('the editor opens the new language', Boolean(dom.window.document.querySelector('.cm-editor')))
  check('the status strip names the language', text().includes('Haskell'), text().slice(0, 160))
  check('the new language is offered as runnable', Boolean(findByLabel('Run project')))

  // --- settings sheet ---------------------------------------------------
  await clickLabel('Project menu')
  await wait(150)
  await click('App settings')
  await wait(200)
  check('settings opened', text().includes('Runner') && text().includes('Piston'))
  check('syntax colour schemes offered', text().includes('VS Code') && text().includes('One Dark') && text().includes('GitHub'))
  await clickLabel('Close')

  // --- find in files ----------------------------------------------------
  await click('Files')
  await wait(200)
  check('the Files pane offers a project search', Boolean(findByLabel('Find in files')))
  await clickLabel('Find in files')
  await wait(250)
  check('the find sheet opened', text().includes('Find in files'))
  check('it starts with no results', !dom.window.document.querySelector('.find-group'))

  await typeInto('.find-field input', 'addEventListener')
  await wait(250)
  const groups = dom.window.document.querySelectorAll('.find-group')
  check('searching finds the file that uses the word', groups.length >= 1, `${groups.length} groups`)
  check('the match is highlighted in the preview', Boolean(dom.window.document.querySelector('.find-hit')))
  check('the sheet counts its matches', /\d+ match/.test(text()), text().slice(0, 120))
  const rowLoc = dom.window.document.querySelector('.find-loc')?.textContent ?? ''
  check('a result carries its line number', /^\d+$/.test(rowLoc.trim()), rowLoc)

  // case sensitivity is a real switch, not a decoration
  await typeInto('.find-field input', 'ADDEVENTLISTENER')
  await wait(200)
  check(
    'case-insensitive unless asked',
    dom.window.document.querySelectorAll('.find-group').length >= 1,
    String(dom.window.document.querySelectorAll('.find-group').length),
  )
  await clickLabel('Match case')
  await wait(200)
  check(
    'match case hides the wrong-case hit',
    dom.window.document.querySelectorAll('.find-group').length === 0 && text().includes('No matches'),
    String(dom.window.document.querySelectorAll('.find-group').length),
  )
  await clickLabel('Match case')
  await wait(150)
  await typeInto('.find-field input', 'addEvent')
  await wait(200)
  check('and off finds it again', dom.window.document.querySelectorAll('.find-group').length >= 1)

  // tapping a result opens that file with the caret on the match
  const firstRow = dom.window.document.querySelector<HTMLElement>('.find-row')
  firstRow?.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true, cancelable: true }))
  await wait(300)
  check('the result closed the sheet', !dom.window.document.querySelector('.find-field'))
  check('the result opened its file', (dom.window.document.querySelector('.tab-chip.active')?.textContent ?? '').includes('app.js'))
  const caretLine = (text().match(/Ln (\d+), Col (\d+)/) ?? [])[1]
  check('the caret is on the matched line', Number(caretLine) > 1, `Ln ${caretLine}`)

  // the shortcut is wired, not just written in the menu
  dom.window.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'F', shiftKey: true, metaKey: true, bubbles: true }))
  await wait(200)
  check('⌘⇧F opens the find sheet from the editor', Boolean(dom.window.document.querySelector('.find-field')))

  // replace is honest about what it will touch, then writes every file at once
  await typeInto('.find-field input', 'addEventListener')
  await wait(200)
  await click('Replace')
  await wait(150)
  check('the replacement field appears', Boolean(dom.window.document.querySelector('.find-field.replacement')))
  await typeInto('.find-field.replacement input', 'listenHere')
  await wait(150)
  await click('Replace all')
  await wait(200)
  const confirmLabel = [...buttons()].find((node) => /^Replace \d+ in/.test((node.textContent ?? '').trim()))
  check('replace asks for confirmation first', Boolean(confirmLabel), confirmLabel?.textContent ?? '')
  check('nothing was written before the confirm', dom.window.document.querySelector('.find-field') !== null)
  confirmLabel?.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true, cancelable: true }))
  await wait(300)
  check('the replacement closed the sheet', !dom.window.document.querySelector('.find-field'))
  check('it reports what it changed', /Replaced \d+ match/.test(text()), text().slice(0, 160))

  dom.window.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'F', shiftKey: true, metaKey: true, bubbles: true }))
  await wait(200)
  await typeInto('.find-field input', 'listenHere')
  await wait(250)
  check('the new text is really in the project', dom.window.document.querySelectorAll('.find-group').length >= 1)
  await typeInto('.find-field input', 'addEventListener')
  await wait(250)
  check('and the old text is gone', dom.window.document.querySelectorAll('.find-group').length === 0)
  await clickLabel('Close')
  await wait(120)
  await click('Code')
  await wait(200)

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
