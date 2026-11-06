import { renderToString } from 'react-dom/server'
import ProjectSwitcher from '../src/components/ProjectSwitcher'
import ProjectView from '../src/components/ProjectView'
import SettingsSheet from '../src/components/SettingsSheet'
import FilesPane from '../src/components/FilesPane'
import SearchSheet from '../src/components/SearchSheet'
import RunPanel from '../src/components/RunPanel'
import CodyPanel from '../src/components/CodyPanel'
import { DEFAULT_SETTINGS, type Project, type ProjectMeta } from '../src/types'
import { AI_DEFAULTS } from '../src/lib/ai/config'
import AiSettingsSheet from '../src/components/ai/AiSettingsSheet'
import BuildAiPane from '../src/components/ai/BuildAiPane'
import Markdown, { inlineNodes, markdownBlocks } from '../src/components/ai/Markdown'
import { TEMPLATES, projectFromTemplate } from './fixtures/templates'
import { createRef } from 'react'

const noop = () => {}
const notify = () => {}
const template = TEMPLATES.find((t) => t.id === 'web-starter')!
const project: Project = projectFromTemplate(template, 'Demo project')
const meta: ProjectMeta = {
  id: project.id,
  name: project.name,
  description: project.description,
  templateId: project.templateId,
  fileCount: project.files.length,
  createdAt: project.createdAt,
  updatedAt: project.updatedAt,
}

let failures = 0
function render(name: string, node: JSX.Element) {
  try {
    const html = renderToString(node)
    if (html.length < 20) throw new Error('empty output')
    console.log('  ok  ', name, `(${html.length} bytes)`)
  } catch (error) {
    failures += 1
    console.log('  FAIL', name, (error as Error).message)
  }
}

const editorRef = { current: null }

const emptySession = {
  mode: 'chat' as const,
  setMode: noop,
  turns: [],
  activity: [],
  running: false,
  status: null,
  error: null,
  summary: null,
  approval: null,
  respondToApproval: noop,
  canRevert: false,
  send: async () => {},
  stop: noop,
  clear: noop,
  revert: async () => {},
  resetError: noop,
}

render(
  'ProjectSwitcher (open)',
  <ProjectSwitcher
    open
    currentId={project.id}
    projects={[meta]}
    settings={DEFAULT_SETTINGS}
    onClose={noop}
    onCreate={noop}
    onOpen={noop}
    onDelete={noop}
    onDuplicate={noop}
    onImport={async () => {}}
    onOpenSettings={noop}
    onNotify={notify}
    onToggleTheme={noop}
  />,
)

render(
  'ProjectSwitcher (empty)',
  <ProjectSwitcher
    open
    currentId={null}
    projects={[]}
    settings={DEFAULT_SETTINGS}
    onClose={noop}
    onCreate={noop}
    onOpen={noop}
    onDelete={noop}
    onDuplicate={noop}
    onImport={async () => {}}
    onOpenSettings={noop}
    onNotify={notify}
    onToggleTheme={noop}
  />,
)

const baseProps = {
  project,
  settings: DEFAULT_SETTINGS,
  projects: [meta],
  activePath: project.files[0].path,
  activeLanguage: 'HTML',
  runState: { kind: 'idle' as const, runId: 0 },
  runEntry: project.entry ?? null,
  logs: [],
  stdin: '',
  setStdin: noop,
  savedAt: Date.now(),
  unsaved: false,
  recentPaths: ['index.html'],
  onCloseTab: noop,
  onOpenSwitcher: noop,
  onOpenFile: noop,
  onRunFile: noop,
  onChangeFile: noop,
  onCreateFile: noop,
  onRenameFile: noop,
  onDeleteFile: noop,
  onDuplicateFile: noop,
  onSetEntry: noop,
  onRun: noop,
  onStop: noop,
  onClearLogs: noop,
  onSetRunEntry: noop,
  onInsertSnippet: noop,
  onRenameProject: noop,
  onUpdateDescription: noop,
  onOpenSettings: noop,
  onNotify: notify,
  onOpenProject: noop,
  onImportProject: noop,
  onDeleteProject: noop,
  editorRef: editorRef as never,
  onReplaceFiles: noop,
  aiConfig: { ...AI_DEFAULTS, roles: { ...AI_DEFAULTS.roles } },
  aiKeys: {},
  aiSession: { ...emptySession },
  onOpenAiSettings: noop,
  onSaveNow: noop,
  onUpdateSettings: noop,
}

/* ---- markdown in the AI transcript ---------------------------------- */

function html(node: JSX.Element): string {
  return renderToString(node)
}

function checkMarkdown(name: string, ok: boolean, detail = '') {
  if (ok) console.log('  ok  ', name)
  else {
    failures += 1
    console.log('  FAIL', name, detail)
  }
}

{
  const bold = html(<Markdown text="Here are the **current** workspaces" />)
  checkMarkdown('bold renders as <strong>', bold.includes('<strong>current</strong>') && !bold.includes('**'), bold)

  const bullets = html(<Markdown text={'Intro\n\n- **Core.ai** – 0 files\n- Second item'} />)
  checkMarkdown(
    'bullets render as a list',
    bullets.includes('<ul>') && bullets.includes('<li>') && bullets.includes('<strong>Core.ai</strong>') && !bullets.includes('- **'),
    bullets,
  )

  const numbered = html(<Markdown text={'1. first\n2. second'} />)
  checkMarkdown('numbered lines render as <ol>', numbered.includes('<ol>') && numbered.includes('<li>first</li>'), numbered)

  const fence = html(<Markdown text={'Try this:\n\n```js\nconst a = 1\n```'} />)
  checkMarkdown('a fenced block renders as <pre><code>', fence.includes('<pre><code>') && fence.includes('const a = 1'), fence)

  const inlineCode = html(<Markdown text="Run `npm test` first" />)
  checkMarkdown('inline code renders as <code>', inlineCode.includes('<code>npm test</code>') && !inlineCode.includes('`'), inlineCode)

  const link = html(<Markdown text="See [the docs](https://docs.xkiro.com/)" />)
  checkMarkdown(
    'a link becomes an anchor',
    link.includes('href="https://docs.xkiro.com/"') && link.includes('the docs') && link.includes('rel="noreferrer"'),
    link,
  )

  const unsafe = html(<Markdown text="Try [this](javascript:alert(1)) instead" />)
  checkMarkdown('a javascript: link is not made clickable', !unsafe.includes('href="javascript'), unsafe)

  const entity = html(<Markdown text={'<img src=x onerror="alert(1)">'} />)
  checkMarkdown('raw html is escaped, not executed', !entity.includes('<img') && entity.includes('&lt;img'), entity)

  const snake = html(<Markdown text="the file_name_here variable" />)
  checkMarkdown('snake_case is not italicised', !snake.includes('<em>'), snake)

  const heading = html(<Markdown text={'## What I built\nIt works.'} />)
  checkMarkdown('a heading is a quiet strong line', heading.includes('ai-md-h') && heading.includes('What I built'), heading)

  const quote = html(<Markdown text="> careful here" />)
  checkMarkdown('a quote is a quiet line', quote.includes('ai-md-quote') && quote.includes('careful here'), quote)

  checkMarkdown(
    'plain prose keeps its line breaks',
    html(<Markdown text={'Two lines\nstay two lines'} />).includes('Two lines\nstay two lines'),
  )
  checkMarkdown('empty text renders nothing', markdownBlocks('').length === 0 && inlineNodes('', 'k').length === 0)
  render('Markdown (in an agent bubble)', <Markdown text={'Here are the **current** workspaces:\n\n- **Core.ai** – 0 files'} />)
}

render('ProjectView/Files', <ProjectView {...baseProps} tab="files" setTab={noop} />)
render('ProjectView/AI', <ProjectView {...baseProps} tab="ai" setTab={noop} />)
render('BuildAiPane (no key)', <BuildAiPane config={baseProps.aiConfig} keys={{}} session={baseProps.aiSession as never} onOpenSettings={noop} />)
render('ProjectView/Run', <ProjectView {...baseProps} tab="run" setTab={noop} />)
render('ProjectView/Build', <ProjectView {...baseProps} tab="cody" setTab={noop} />)
render('ProjectView/Code', <ProjectView {...baseProps} tab="code" setTab={noop} />)
render(
  'AiSettingsSheet',
  <AiSettingsSheet
    open
    config={baseProps.aiConfig}
    onChange={noop}
    onClose={noop}
    onNotify={notify}
    onKeysChanged={noop}
  />,
)
render(
  'SettingsSheet',
  <SettingsSheet
    open
    settings={DEFAULT_SETTINGS}
    projects={[meta]}
    onChange={noop}
    onClose={noop}
    onNotify={notify}
  />,
)
render(
  'FilesPane (empty project)',
  <FilesPane
    project={{ ...project, files: [] }}
    activePath={null}
    runEntry={null}
    onOpenFile={noop}
    onRunFile={noop}
    onCreateFile={noop}
    onRenameFile={noop}
    onDeleteFile={noop}
    onDuplicateFile={noop}
    onSetEntry={noop}
    onNotify={notify}
    onOpenSearch={noop}
  />,
)
render(
  'SearchSheet (results)',
  <SearchSheet
    open
    files={project.files}
    onClose={noop}
    onOpenMatch={noop}
    onReplace={noop}
  />,
)
render(
  'RunPanel (python)',
  <RunPanel
    project={projectFromTemplate(TEMPLATES.find((t) => t.id === 'python')!, 'Py')}
    runState={{ kind: 'idle', runId: 0 }}
    runEntry="main.py"
    logs={[{ id: '1', level: 'log', text: 'hello', time: Date.now(), source: 'python' }]}
    stdin=""
    settings={DEFAULT_SETTINGS}
    savedAt={null}
    onSetStdin={noop}
    onSetRunEntry={noop}
    onRun={noop}
    onStop={noop}
    onClearLogs={noop}
    onOpenFile={noop}
    onNotify={notify}
  />,
)
render(
  'CodyPanel',
  <CodyPanel
    project={project}
    activePath="app.js"
    onInsertSnippet={noop}
    onCreateFile={noop}
    onOpenFile={noop}
    onNotify={notify}
  />,
)

console.log(failures === 0 ? '\nAll render checks passed' : `\n${failures} render checks failed`)
process.exit(failures === 0 ? 0 : 1)
