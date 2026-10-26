import { renderToString } from 'react-dom/server'
import ProjectSwitcher from '../src/components/ProjectSwitcher'
import ProjectView from '../src/components/ProjectView'
import SettingsSheet from '../src/components/SettingsSheet'
import FilesPane from '../src/components/FilesPane'
import SearchSheet from '../src/components/SearchSheet'
import RunPanel from '../src/components/RunPanel'
import CodyPanel from '../src/components/CodyPanel'
import { DEFAULT_SETTINGS, type Project, type ProjectMeta } from '../src/types'
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
  onSaveNow: noop,
  onUpdateSettings: noop,
}

render('ProjectView/Files', <ProjectView {...baseProps} tab="files" setTab={noop} />)
render('ProjectView/Run', <ProjectView {...baseProps} tab="run" setTab={noop} />)
render('ProjectView/Build', <ProjectView {...baseProps} tab="cody" setTab={noop} />)
render('ProjectView/Code', <ProjectView {...baseProps} tab="code" setTab={noop} />)
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
