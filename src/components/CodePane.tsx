import { useEffect, useMemo, useRef, useState, type MutableRefObject } from 'react'
import type { Project, Settings } from '../types'
import type { CodyEditorHandle, CursorInfo } from '../editor/CodeEditor'
import CodeEditor from '../editor/CodeEditor'
import { languageForPath } from '../lib/languages'
import Icon from './Icons'
import Sheet from './Sheet'
import { bytesOf, fileName, formatBytes } from '../lib/utils'

type Props = {
  project: Project
  settings: Settings
  activePath: string | null
  runEntry: string | null
  savedAt: number | null
  unsaved: boolean
  recentPaths: string[]
  editorRef: MutableRefObject<CodyEditorHandle | null>
  onChangeFile: (path: string, content: string) => void
  onOpenFile: (path: string) => void
  onCloseTab: (path: string) => void
  onRun: () => void
  onRunFile: (path: string) => void
  onSaveNow: () => void
  onUpdateSettings: (patch: Partial<Settings>) => void
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

export default function CodePane({
  project,
  settings,
  activePath,
  runEntry,
  savedAt,
  unsaved,
  recentPaths,
  editorRef,
  onChangeFile,
  onOpenFile,
  onCloseTab,
  onRun,
  onRunFile,
  onSaveNow,
  onUpdateSettings,
  onNotify,
}: Props) {
  const [switcherOpen, setSwitcherOpen] = useState(false)
  const [symbolsOpen, setSymbolsOpen] = useState(false)
  const [typeOpen, setTypeOpen] = useState(false)
  const [filter, setFilter] = useState('')
  const [cursor, setCursor] = useState<CursorInfo>({ line: 1, column: 1, lines: 1, selected: 0 })
  const [keyboardOpen, setKeyboardOpen] = useState(false)
  const railRef = useRef<HTMLDivElement | null>(null)

  const file = project.files.find((item) => item.path === activePath) ?? null
  const lang = file ? languageForPath(file.path) : null
  const keywords = lang ? KEYWORD_INSERTS[lang.id] ?? [] : []
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
                <span className="lang-dot" style={{ background: languageForPath(item.path).color }} />
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
                  <span className="lang-dot" style={{ background: tabLang.color }} />
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
          onReady={(instance) => {
            editorRef.current = instance
            setCursor(instance.cursor())
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
        <span className="status-sep">·</span>
        <span>{formatBytes(stats?.bytes ?? 0)}</span>
        <span className="status-sep">·</span>
        <span className="status-lang" style={{ color: lang!.color }}>
          {lang!.label}
        </span>
        <span className="status-sep">·</span>
        <span>Spaces: {settings.tabSize}</span>
        <div className="toolbar-spacer" />
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
              <span className="lang-dot" style={{ background: languageForPath(item.path).color }} />
              <span className="grow">{item.path}</span>
              {runEntry === item.path && <span className="pill tiny">entry</span>}
            </button>
          ))}
          {filteredFiles.length === 0 && <p className="muted center">No files match.</p>}
        </div>
      </Sheet>

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
