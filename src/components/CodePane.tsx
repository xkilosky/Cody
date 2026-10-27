import { useEffect, useMemo, useRef, useState, type MutableRefObject } from 'react'
import type { Project, Settings } from '../types'
import type { CodyEditorHandle, CursorInfo } from '../editor/CodeEditor'
import CodeEditor from '../editor/CodeEditor'
import { languageForPath } from '../lib/languages'
import Icon from './Icons'
import LangIcon from './LangIcon'
import Sheet, { PromptSheet } from './Sheet'
import { bytesOf, fileName, formatBytes } from '../lib/utils'
import { analyzeFile } from '../lib/diagnostics'
import { problemsAt, useProblemIndex } from '../lib/problemIndex'
import { actionMarkers, codeActionsFor, renameEdits, type ActionMarker, type CodeAction, type TextEdit } from '../lib/codeActions'
import ProblemMark from './ProblemMark'

type Props = {
  project: Project
  settings: Settings
  activePath: string | null
  runEntry: string | null
  savedAt: number | null
  unsaved: boolean
  recentPaths: string[]
  editorRef: MutableRefObject<CodyEditorHandle | null>
  /** A one-shot "put the caret here" request from outside the pane (find in files). */
  jump: { path: string; line: number; column: number; id: number } | null
  onChangeFile: (path: string, content: string) => void
  onOpenFile: (path: string) => void
  onCloseTab: (path: string) => void
  onRun: () => void
  onRunFile: (path: string) => void
  onSaveNow: () => void
  onUpdateSettings: (patch: Partial<Settings>) => void
  onCreateFile: (path: string, content?: string) => void
  onNotify: (message: string, tone?: 'info' | 'success' | 'error') => void
}

/** The symbol rail is the phone's "keyboard extension" — the keys a touch
 *  keyboard hides. Ordered by what people actually reach for while coding. */
const SYMBOLS: Array<{ label: string; insert: string; wide?: boolean }> = [
  { label: '⇥', insert: '  ' },
  { label: '{', insert: '{' },
  { label: '}', insert: '}' },
  { label: '(', insert: '(' },
  { label: ')', insert: ')' },
  { label: '[', insert: '[' },
  { label: ']', insert: ']' },
  { label: '<', insert: '<' },
  { label: '>', insert: '>' },
  { label: '=', insert: ' = ' },
  { label: '"', insert: '"' },
  { label: "'", insert: "'" },
  { label: '`', insert: '`' },
  { label: '/', insert: '/' },
  { label: ';', insert: ';' },
  { label: ':', insert: ': ' },
  { label: ',', insert: ', ' },
  { label: '.', insert: '.' },
  { label: '&', insert: ' & ' },
  { label: '|', insert: ' | ' },
  { label: '!', insert: '!' },
  { label: '?', insert: '?' },
  { label: '+', insert: ' + ' },
  { label: '-', insert: ' - ' },
  { label: '*', insert: '*' },
  { label: '_', insert: '_' },
  { label: '$', insert: '$' },
  { label: '#', insert: '#' },
  { label: '@', insert: '@' },
  { label: '%', insert: '%' },
  { label: '^', insert: '^' },
  { label: '~', insert: '~' },
  { label: '\\', insert: '\\' },
  { label: '=>', insert: ' => ' },
  { label: '${ }', insert: '${}' },
  { label: '/* */', insert: '/**/' },
  { label: '//', insert: '// ' },
]

const KEYWORD_INSERTS: Record<string, string[]> = {
  javascript: ['const ', 'let ', 'function ', 'async function ', 'await ', 'if (', 'return ', 'forEach('],
  typescript: ['const ', 'interface ', 'type ', 'async function ', 'return ', 'export '],
  tsx: ['<div>', 'useState(', 'useEffect(', 'onClick={', 'className="', 'export default '],
  jsx: ['<div>', 'useState(', 'useEffect(', 'onClick={', 'className="', 'export default '],
  python: ['def ', 'class ', 'import ', 'from ', 'for ', 'if __name__ == "__main__":'],
  go: ['func ', 'package main', 'import (', 'fmt.Println(', 'if err != nil {'],
  rust: ['fn ', 'let mut ', 'impl ', 'println!(', 'match '],
  java: ['public static void main(String[] args)', 'System.out.println(', 'class '],
  c: ['#include <stdio.h>', 'int main(void) {', 'printf("', 'return 0;'],
  cpp: ['#include <iostream>', 'int main() {', 'std::cout << '],
  csharp: ['using System;', 'class Program {', 'Console.WriteLine('],
  sql: ['SELECT ', 'FROM ', 'WHERE ', 'JOIN ', 'GROUP BY '],
  css: ['display: ', 'grid-template-columns: ', 'padding: ', '@media (', 'color: '],
  html: ['<div class="">', '<script>', '<style>', '<a href="">', '</div>'],
  markdown: ['# ', '## ', '- ', '```', '[text](url)'],
}

const ACTION_KIND_LABEL: Record<CodeAction['kind'], string> = {
  quickfix: 'Fix',
  import: 'Import',
  refactor: 'Refactor',
  create: 'Create',
}

export default function CodePane({
  project,
  settings,
  activePath,
  runEntry,
  savedAt,
  unsaved,
  recentPaths,
  editorRef,
  jump,
  onChangeFile,
  onOpenFile,
  onCloseTab,
  onRun,
  onRunFile,
  onSaveNow,
  onUpdateSettings,
  onCreateFile,
  onNotify,
}: Props) {
  const [switcherOpen, setSwitcherOpen] = useState(false)
  const [symbolsOpen, setSymbolsOpen] = useState(false)
  const [typeOpen, setTypeOpen] = useState(false)
  const [filter, setFilter] = useState('')
  const [cursor, setCursor] = useState<CursorInfo>({ line: 1, column: 1, lines: 1, selected: 0 })
  const [keyboardOpen, setKeyboardOpen] = useState(false)
  const [problemsOpen, setProblemsOpen] = useState(false)
  const [actionsOpen, setActionsOpen] = useState(false)
  const [renamingSymbol, setRenamingSymbol] = useState<string | null>(null)
  const railRef = useRef<HTMLDivElement | null>(null)
  const pendingJump = useRef<{ path: string; line: number; column: number } | null>(null)

  const file = project.files.find((item) => item.path === activePath) ?? null
  const lang = file ? languageForPath(file.path) : null
  const keywords = lang ? KEYWORD_INSERTS[lang.id] ?? [] : []
  // Analysing every file on each keystroke would fight the keyboard: the
  // project scan is deferred, the active file is linted live by the editor.
  const index = useProblemIndex(project.files)
  const problems = index.list
  const problemsByPath = index.byPath
  const activeProblems = activePath ? problemsAt(index, activePath) : []
  const totals = { errors: index.errors, warnings: index.warnings }
  const lintFile = useMemo(
    () => (path: string, content: string) => analyzeFile(path, content, project.files),
    [project.files],
  )
  const caretOffset = useMemo(() => {
    if (!file) return 0
    const lines = file.content.split('\n')
    const index = Math.min(Math.max(0, cursor.line - 1), lines.length - 1)
    const before = lines.slice(0, index).reduce((total, text) => total + text.length + 1, 0)
    return Math.min(before + Math.max(0, cursor.column - 1), file.content.length)
  }, [file, cursor.line, cursor.column])

  const actions = useMemo<CodeAction[]>(() => {
    if (!file) return []
    return codeActionsFor({
      path: file.path,
      content: file.content,
      pos: caretOffset,
      selection: editorRef.current?.selection(),
      files: project.files,
    })
    // the editor's selection is read lazily; the caret and the text drive updates
  }, [file, caretOffset, project.files, actionsOpen])

  // The bulb marks the lines that actually have something to offer. The scan is
  // deferred like the lint pass, so typing never waits on it.
  const [bulbs, setBulbs] = useState<ActionMarker[]>([])
  useEffect(() => {
    if (!file) {
      setBulbs([])
      return
    }
    const { path, content } = file
    const timer = setTimeout(() => {
      setBulbs(actionMarkers({ path, content, files: project.files }))
    }, 260)
    return () => clearTimeout(timer)
  }, [file, project.files])

  // Find in files (and anything else outside the pane) asks for one jump. If the
  // file has to be opened first, the editor is not there yet: park the request
  // and let onReady apply it once the new document exists.
  useEffect(() => {
    if (!jump) return
    if (file?.path === jump.path && editorRef.current) {
      pendingJump.current = null
      editorRef.current.goto(jump.line, jump.column)
      return
    }
    pendingJump.current = { path: jump.path, line: jump.line, column: jump.column }
    // the request is the trigger; re-running on every render would fight the caret
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jump])

  // The linter asks for fixes once per diagnostic. Same content, many
  // positions: compute once per version of the file and reuse.
  const fixCache = useRef<{ content: string; map: Map<number, Array<{ title: string; edits: TextEdit[] }>> } | null>(null)
  const quickFixes = useMemo(
    () => (content: string, pos: number) => {
      if (!fixCache.current || fixCache.current.content !== content) {
        fixCache.current = { content, map: new Map() }
      }
      const cached = fixCache.current.map.get(pos)
      if (cached) return cached
      const computed = codeActionsFor({ path: file?.path ?? '', content, pos, files: project.files })
        .filter((action) => action.edits.length > 0 && (action.kind === 'quickfix' || action.kind === 'import'))
        .map((action) => ({ title: action.title, edits: action.edits }))
      fixCache.current.map.set(pos, computed)
      return computed
    },
    [file?.path, project.files],
  )

  const runAction = (action: CodeAction) => {
    setActionsOpen(false)
    if (action.command?.id === 'create-file') {
      onCreateFile(action.command.path, '')
      onNotify(`Created ${action.command.path}`, 'success')
      return
    }
    if (action.command?.id === 'rename-symbol') {
      setRenamingSymbol(action.command.name)
      return
    }
    if (action.edits.length === 0) return
    editorRef.current?.applyEdits(action.edits)
    onNotify(action.title, 'success')
  }

  const applyRename = (next: string) => {
    if (!renamingSymbol || !file) return
    const target = next.trim()
    if (!target || target === renamingSymbol) return
    editorRef.current?.applyEdits(renameEdits(file.content, renamingSymbol, target))
    onNotify(`Renamed ${renamingSymbol} to ${target}`, 'success')
  }

  const stats = useMemo(
    () => (file ? { lines: cursor.lines || file.content.split('\n').length, bytes: bytesOf(file.content) } : null),
    [file, cursor.lines],
  )

  // Keyboard detection: when the OS keyboard is up we dock the rail against it.
  useEffect(() => {
    const viewport = window.visualViewport
    if (!viewport) return
    const update = () => {
      const inset = Math.max(0, window.innerHeight - viewport.height - viewport.offsetTop)
      setKeyboardOpen(inset > 120)
      document.documentElement.style.setProperty('--kb-inset', `${Math.round(inset)}px`)
    }
    update()
    viewport.addEventListener('resize', update)
    viewport.addEventListener('scroll', update)
    return () => {
      viewport.removeEventListener('resize', update)
      viewport.removeEventListener('scroll', update)
      document.documentElement.style.removeProperty('--kb-inset')
    }
  }, [])


  const tabs = useMemo(() => {
    const paths = [activePath, ...recentPaths].filter(Boolean) as string[]
    return [...new Set(paths)].slice(0, 4)
  }, [activePath, recentPaths])

  if (!file) {
    return (
      <div className="pane code-pane">
        <div className="empty-state tall">
          <Icon name="code" size={30} />
          <h3>No file open</h3>
          <p>Pick a file to start editing.</p>
          <button className="btn primary" onClick={() => setSwitcherOpen(true)}>
            <Icon name="files" size={16} /> Browse files
          </button>
        </div>
        <Sheet open={switcherOpen} title="Open a file" onClose={() => setSwitcherOpen(false)}>
          <div className="action-list">
            {project.files.map((item) => (
              <button
                key={item.path}
                className="action-item"
                onClick={() => {
                  onOpenFile(item.path)
                  setSwitcherOpen(false)
                }}
              >
                <LangIcon path={item.path} size={15} />
                <ProblemMark problems={problemsAt(index, item.path)} path={item.path} />
                <span>{item.path}</span>
              </button>
            ))}
          </div>
        </Sheet>
      </div>
    )
  }

  const filteredFiles = project.files.filter((item) =>
    !filter.trim() ? true : item.path.toLowerCase().includes(filter.trim().toLowerCase()),
  )

  const insert = (text: string) => {
    editorRef.current?.insert(text)
    editorRef.current?.focus()
  }

  const railKey = (text: string) => {
    insert(text)
  }

  return (
    <div className={`pane code-pane${keyboardOpen ? ' keyboard-open' : ''}`}>
      {/* ---- file tabs -------------------------------------------------- */}
      <div className="editor-tabs">
        <div className="tabs-scroll">
          {tabs.map((path) => {
            const tabFile = project.files.find((item) => item.path === path)
            const tabLang = languageForPath(path)
            const isActive = path === file.path
            return (
              <div key={path} className={`tab-chip${isActive ? ' active' : ''}`}>
                <button
                  className="tab-chip-main"
                  onClick={() => onOpenFile(path)}
                  title={path}
                >
                  <LangIcon lang={tabLang} active={isActive} size={15} />
                  <ProblemMark problems={problemsAt(index, path)} path={path} />
                  <span className="tab-name">{fileName(path)}</span>
                </button>
                {isActive && unsaved && <span className="dirty-dot" aria-label="Unsaved changes" />}
                {tabs.length > 1 && (
                  <button
                    className="tab-close"
                    aria-label={`Close ${fileName(path)}`}
                    onClick={() => onCloseTab(path)}
                  >
                    <Icon name="close" size={12} />
                  </button>
                )}
                {!tabFile && <span className="tab-missing" title="File no longer exists" />}
              </div>
            )
          })}
        </div>
        <button className="tabs-more" onClick={() => setSwitcherOpen(true)} aria-label="All files">
          <Icon name="folder" size={16} />
        </button>
      </div>

      {/* ---- editor ----------------------------------------------------- */}
      <div className="editor-wrap">
        <CodeEditor
          key={file.path}
          value={file.content}
          path={file.path}
          settings={settings}
          onChange={(value) => onChangeFile(file.path, value)}
          onSave={onSaveNow}
          onRun={onRun}
          onCursor={setCursor}
          lint={(content) => lintFile(file.path, content)}
          projectFiles={project.files}
          fixes={quickFixes}
          bulbs={bulbs}
          onBulb={(line, column) => {
            editorRef.current?.goto(line, column)
            setActionsOpen(true)
          }}
          onRequestCodeActions={() => setActionsOpen(true)}
          onReady={(instance) => {
            editorRef.current = instance
            setCursor(instance.cursor())
            const jump = pendingJump.current
            if (jump && jump.path === file.path) {
              pendingJump.current = null
              instance.goto(jump.line, jump.column)
            }
          }}
          onDestroy={() => {
            editorRef.current = null
          }}
        />
      </div>

      {/* ---- status strip ----------------------------------------------- */}
      <div className="editor-status">
        <span className="status-pos">
          Ln {cursor.line}, Col {cursor.column}
        </span>
        {cursor.selected > 0 && <span className="status-chip">{cursor.selected} sel</span>}
        <span className="status-sep">·</span>
        <span>{stats?.lines ?? 0} lines</span>
        <span className="status-sep status-secondary">·</span>
        <span className="status-secondary">{formatBytes(stats?.bytes ?? 0)}</span>
        <span className="status-sep">·</span>
        <span className="status-lang">
          {lang!.label}
        </span>
        <span className="status-sep status-secondary">·</span>
        <span className="status-secondary">Spaces: {settings.tabSize}</span>
        <div className="toolbar-spacer" />
        <button
          className={`status-problems${activeProblems.length === 0 ? ' clean' : totals.errors > 0 && activeProblems.some((p) => p.severity === 'error') ? ' error' : ' warn'}`}
          onClick={() => setProblemsOpen(true)}
          aria-label="Show problems"
        >
          {activeProblems.length === 0 ? (
            <>
              <Icon name="check" size={11} /> No problems
            </>
          ) : (
            <>
              <Icon name={activeProblems.some((p) => p.severity === 'error') ? 'alert' : 'info'} size={11} />
              {activeProblems.length === 1
                ? activeProblems[0].severity === 'error'
                  ? '1 error'
                  : '1 warning'
                : `${activeProblems.filter((p) => p.severity === 'error').length} errors, ${activeProblems.filter((p) => p.severity === 'warning').length} warnings`}
            </>
          )}
        </button>
        <button className={`status-save${unsaved ? ' unsaved' : ''}`} onClick={onSaveNow}>
          {unsaved ? 'Save' : savedAt ? 'Saved' : 'Autosave'}
        </button>
      </div>

      {/* ---- keyboard rail ---------------------------------------------- */}
      <div className="editor-toolbar">
        <div className="rail-row rail-actions">
          <button className="tool-btn" onClick={() => editorRef.current?.undo()} aria-label="Undo">
            <Icon name="undo" size={18} />
          </button>
          <button className="tool-btn" onClick={() => editorRef.current?.redo()} aria-label="Redo">
            <Icon name="redo" size={18} />
          </button>
          <button className="tool-btn" onClick={() => editorRef.current?.indent()} aria-label="Indent">
            <Icon name="indent" size={18} />
          </button>
          <button
            className="tool-btn"
            onClick={() => editorRef.current?.openSearch()}
            aria-label="Find"
          >
            <Icon name="search" size={18} />
          </button>
          <button
            className="tool-btn"
            onClick={() => editorRef.current?.complete()}
            aria-label="Suggest completions"
            title="Suggestions (Ctrl-Space)"
          >
            <Icon name="sparkles" size={18} />
          </button>
          <button
            className={`tool-btn${actions.some((action) => action.kind === 'quickfix') ? ' accent' : ''}`}
            onClick={() => setActionsOpen(true)}
            aria-label="Code actions"
            title="Code actions (Ctrl-.)"
          >
            <Icon name="bulb" size={18} />
            {actions.length > 0 && <span className="tool-count">{actions.length}</span>}
          </button>
          <button className="tool-btn" onClick={() => setTypeOpen(true)} aria-label="Text options">
            <span className="tool-glyph">Aa</span>
          </button>
          <button className="tool-btn" onClick={() => setSymbolsOpen(true)} aria-label="More keys">
            <span className="tool-glyph">⌘</span>
          </button>
          <button
            className="tool-btn"
            onClick={() => {
              ;(document.activeElement as HTMLElement | null)?.blur()
              editorRef.current?.getView()?.contentDOM.blur()
            }}
            aria-label="Hide keyboard"
          >
            <Icon name="chevron-down" size={18} />
          </button>
          <div className="toolbar-spacer" />
          <button className="rail-run" onClick={() => onRunFile(file.path)} aria-label="Run file">
            <Icon name="play" size={16} filled />
            <span>Run</span>
          </button>
        </div>
        <div className="rail-row rail-keys" ref={railRef}>
          {SYMBOLS.map((symbol) => (
            <button
              key={symbol.label}
              className="rail-key"
              onClick={() => railKey(symbol.insert)}
              aria-label={`Insert ${symbol.label}`}
            >
              {symbol.label}
            </button>
          ))}
        </div>
      </div>

      {/* ---- sheets ------------------------------------------------------ */}
      <Sheet
        open={switcherOpen}
        title="Files"
        subtitle={`${project.files.length} file${project.files.length === 1 ? '' : 's'} in ${project.name}`}
        onClose={() => {
          setSwitcherOpen(false)
          setFilter('')
        }}
      >
        <div className="search-field">
          <Icon name="search" size={16} />
          <input
            value={filter}
            onChange={(event) => setFilter(event.target.value)}
            placeholder="Filter files"
            autoCapitalize="off"
            spellCheck={false}
          />
        </div>
        <div className="action-list">
          {filteredFiles.map((item) => (
            <button
              key={item.path}
              className={`action-item${item.path === file.path ? ' selected' : ''}`}
              onClick={() => {
                onOpenFile(item.path)
                setSwitcherOpen(false)
                setFilter('')
              }}
            >
              <LangIcon path={item.path} size={15} />
              <span className="grow">{item.path}</span>
              <ProblemMark problems={problemsAt(index, item.path)} path={item.path} />
              {runEntry === item.path && <span className="pill tiny">entry</span>}
            </button>
          ))}
          {filteredFiles.length === 0 && <p className="muted center">No files match.</p>}
        </div>
      </Sheet>

      <Sheet
        open={problemsOpen}
        title="Problems"
        subtitle={
          problems.length === 0
            ? 'Nothing to fix'
            : `${totals.errors} error${totals.errors === 1 ? '' : 's'} · ${totals.warnings} warning${totals.warnings === 1 ? '' : 's'} in ${problemsByPath.size} file${problemsByPath.size === 1 ? '' : 's'}`
        }
        onClose={() => setProblemsOpen(false)}
      >
        {problems.length === 0 ? (
          <div className="problems-empty">
            <Icon name="check" size={22} />
            <strong>No problems found</strong>
            <p>
              Cody checked every file for syntax errors, unbalanced brackets, broken markup, Python indentation and
              imports that point at missing files.
            </p>
          </div>
        ) : (
          <div className="problem-list">
            {[...problemsByPath.entries()].map(([path, list]) => (
              <div key={path} className="problem-group">
                <div className="problem-file">
                  <LangIcon path={path} size={14} />
                  <span className="grow">{path}</span>
                  <ProblemMark problems={list} path={path} variant="count" />
                </div>
                {list.map((problem, index) => (
                  <button
                    key={`${problem.line}:${problem.column}:${index}`}
                    className={`problem-row ${problem.severity}`}
                    onClick={() => {
                      pendingJump.current = { path, line: problem.line, column: problem.column }
                      onOpenFile(path)
                      editorRef.current?.goto(problem.line, problem.column)
                      setProblemsOpen(false)
                    }}
                  >
                    <span className="problem-loc">
                      {problem.line}:{problem.column}
                    </span>
                    <span className="problem-body">
                      <span className="problem-msg">{problem.message}</span>
                      <span className="problem-rule">{problem.rule}</span>
                    </span>
                  </button>
                ))}
              </div>
            ))}
          </div>
        )}
      </Sheet>

      <Sheet
        open={actionsOpen}
        title="Code actions"
        subtitle={
          actions.length > 0
            ? `${actions.length} available on line ${cursor.line}`
            : 'Nothing to fix or refactor here'
        }
        onClose={() => setActionsOpen(false)}
      >
        {actions.length === 0 ? (
          <div className="problems-empty">
            <Icon name="bulb" size={22} />
            <strong>No actions here</strong>
            <p>
              Put the caret on code with a problem, an unused import, a literal or a name you want to rename. Cody
              offers the fixes and refactors that apply at that spot.
            </p>
          </div>
        ) : (
          <div className="action-list">
            {actions.map((action) => (
              <button key={action.id} className="action-item" onClick={() => runAction(action)}>
                <span className={`action-kind ${action.kind}`}>{ACTION_KIND_LABEL[action.kind]}</span>
                <span className="action-body">
                  <span className="action-title">{action.title}</span>
                  {action.detail && <span className="action-detail">{action.detail}</span>}
                </span>
              </button>
            ))}
          </div>
        )}
      </Sheet>

      <PromptSheet
        open={Boolean(renamingSymbol)}
        title={renamingSymbol ? `Rename ${renamingSymbol}` : 'Rename'}
        subtitle="Every occurrence in this file is renamed in one step."
        label="New name"
        initialValue={renamingSymbol ?? ''}
        confirmLabel="Rename"
        onClose={() => setRenamingSymbol(null)}
        onSubmit={applyRename}
      />

      <Sheet
        open={symbolsOpen}
        title="Keys & snippets"
        subtitle={lang ? `${lang.label} helpers` : undefined}
        onClose={() => setSymbolsOpen(false)}
      >
        <div className="sheet-quick-actions">
          <button
            className="chip"
            onClick={() => {
              editorRef.current?.indent()
              setSymbolsOpen(false)
            }}
          >
            <Icon name="indent" size={14} /> Indent
          </button>
          <button
            className="chip"
            onClick={() => {
              editorRef.current?.outdent()
              setSymbolsOpen(false)
            }}
          >
            <Icon name="outdent" size={14} /> Outdent
          </button>
          <button
            className="chip"
            onClick={() => {
              editorRef.current?.toggleComment()
              setSymbolsOpen(false)
            }}
          >
            <Icon name="comment" size={14} /> Comment
          </button>
          <button
            className="chip"
            onClick={() => {
              editorRef.current?.scrollToTop()
              setSymbolsOpen(false)
            }}
          >
            <Icon name="arrow-right" size={14} /> Top
          </button>
        </div>

        {keywords.length > 0 && (
          <>
            <p className="field-label">Insert</p>
            <div className="chip-row wrap">
              {keywords.map((word) => (
                <button
                  key={word}
                  className="chip mono"
                  onClick={() => {
                    insert(word)
                    setSymbolsOpen(false)
                  }}
                >
                  {word.trim()}
                </button>
              ))}
            </div>
          </>
        )}

        <p className="field-label">Symbols</p>
        <div className="symbol-grid">
          {SYMBOLS.map((symbol) => (
            <button key={symbol.label} className="symbol-key" onClick={() => insert(symbol.insert)}>
              {symbol.label}
            </button>
          ))}
        </div>
      </Sheet>

      <Sheet open={typeOpen} title="Editor" onClose={() => setTypeOpen(false)}>
        <div className="setting-row">
          <div>
            <strong>Font size</strong>
            <p>Comfortable reading on small screens.</p>
          </div>
          <div className="stepper">
            <button
              onClick={() => onUpdateSettings({ fontSize: Math.max(11, settings.fontSize - 1) })}
              aria-label="Decrease font size"
            >
              −
            </button>
            <span>{settings.fontSize}</span>
            <button
              onClick={() => onUpdateSettings({ fontSize: Math.min(22, settings.fontSize + 1) })}
              aria-label="Increase font size"
            >
              +
            </button>
          </div>
        </div>
        <div className="setting-row">
          <div>
            <strong>Line numbers</strong>
            <p>Gutter like a desktop editor.</p>
          </div>
          <button
            className={`switch${settings.showLineNumbers ? ' on' : ''}`}
            onClick={() => onUpdateSettings({ showLineNumbers: !settings.showLineNumbers })}
            aria-pressed={settings.showLineNumbers}
            aria-label="Toggle line numbers"
          />
        </div>
        <div className="setting-row">
          <div>
            <strong>Line wrap</strong>
            <p>Long lines fold instead of scrolling sideways.</p>
          </div>
          <button
            className={`switch${settings.lineWrap ? ' on' : ''}`}
            onClick={() => onUpdateSettings({ lineWrap: !settings.lineWrap })}
            aria-pressed={settings.lineWrap}
            aria-label="Toggle line wrap"
          />
        </div>
        <div className="setting-row">
          <div>
            <strong>Tab size</strong>
            <p>Spaces inserted by the ⇥ key.</p>
          </div>
          <div className="stepper">
            <button
              onClick={() => onUpdateSettings({ tabSize: Math.max(1, settings.tabSize - 1) })}
              aria-label="Decrease tab size"
            >
              −
            </button>
            <span>{settings.tabSize}</span>
            <button
              onClick={() => onUpdateSettings({ tabSize: Math.min(8, settings.tabSize + 1) })}
              aria-label="Increase tab size"
            >
              +
            </button>
          </div>
        </div>
        <div className="setting-row">
          <div>
            <strong>Font</strong>
            <p>Monospace is best for code.</p>
          </div>
          <div className="segmented">
            <button
              className={settings.fontFamily === 'mono' ? 'active' : ''}
              onClick={() => onUpdateSettings({ fontFamily: 'mono' })}
            >
              Mono
            </button>
            <button
              className={settings.fontFamily === 'serif' ? 'active' : ''}
              onClick={() => onUpdateSettings({ fontFamily: 'serif' })}
            >
              Serif
            </button>
          </div>
        </div>
        <div className="setting-row">
          <div>
            <strong>Auto re-run</strong>
            <p>Refresh the preview after you stop typing.</p>
          </div>
          <button
            className={`switch${settings.autoRun ? ' on' : ''}`}
            onClick={() => onUpdateSettings({ autoRun: !settings.autoRun })}
            aria-pressed={settings.autoRun}
            aria-label="Toggle auto run"
          />
        </div>
        <button
          className="btn ghost block"
          onClick={() => {
            onSaveNow()
            onNotify('Saved', 'success')
          }}
        >
          <Icon name="save" size={15} /> Save now
        </button>
      </Sheet>
    </div>
  )
}
