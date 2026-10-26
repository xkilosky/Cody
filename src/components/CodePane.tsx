import { useMemo, useState, type MutableRefObject } from 'react'
import type { Project, Settings } from '../types'
import type { CodyEditorHandle } from '../editor/CodeEditor'
import CodeEditor from '../editor/CodeEditor'
import { languageForPath } from '../lib/languages'
import Icon from './Icons'
import Sheet from './Sheet'
import { bytesOf, countLines, fileName, formatBytes, relativeTime } from '../lib/utils'

type Props = {
  project: Project
  settings: Settings
  activePath: string | null
  runEntry: string | null
  savedAt: number | null
  editorRef: MutableRefObject<CodyEditorHandle | null>
  onChangeFile: (path: string, content: string) => void
  onOpenFile: (path: string) => void
  onRun: () => void
  onRunFile: (path: string) => void
  onSaveNow: () => void
  onUpdateSettings: (patch: Partial<Settings>) => void
  onNotify: (message: string, tone?: 'info' | 'success' | 'error') => void
}

const SYMBOLS: Array<{ label: string; insert: string }> = [
  { label: '⇥', insert: '  ' },
  { label: '{ }', insert: '{}' },
  { label: '( )', insert: '()' },
  { label: '[ ]', insert: '[]' },
  { label: '< >', insert: '<>' },
  { label: '" "', insert: '""' },
  { label: "' '", insert: "''" },
  { label: '` `', insert: '``' },
  { label: '=>', insert: ' => ' },
  { label: '===', insert: ' === ' },
  { label: ';', insert: ';' },
  { label: ':', insert: ': ' },
  { label: ',', insert: ', ' },
  { label: '.', insert: '.' },
  { label: '|', insert: ' | ' },
  { label: '&', insert: ' & ' },
  { label: '${ }', insert: '${}' },
  { label: '#', insert: '#' },
  { label: '/* */', insert: '/**/' },
  { label: '//', insert: '// ' },
  { label: '_', insert: '_' },
  { label: '→', insert: '->' },
]

const KEYWORD_INSERTS: Record<string, string[]> = {
  javascript: ['const ', 'function ', 'async function ', 'await ', 'if (', 'return ', 'forEach('],
  typescript: ['const ', 'interface ', 'type ', 'async function ', 'return ', 'export '],
  tsx: ['<div>', 'useState(', 'useEffect(', 'onClick={', 'className="', 'export default '],
  jsx: ['<div>', 'useState(', 'useEffect(', 'onClick={', 'className="', 'export default '],
  python: ['def ', 'class ', 'import ', 'from ', 'for ', 'if __name__ == "__main__":'],
  go: ['func ', 'package main', 'import (', 'fmt.Println(', 'if err != nil {'],
  rust: ['fn ', 'let mut ', 'impl ', 'println!(', 'match '],
  java: ['public static void main(String[] args)', 'System.out.println(', 'class '],
  c: ['#include <stdio.h>', 'int main(void) {', 'printf("', 'return 0;', '}'],
  cpp: ['#include <iostream>', 'int main() {', 'std::cout << '],
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
  editorRef,
  onChangeFile,
  onOpenFile,
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

  const file = project.files.find((item) => item.path === activePath) ?? null
  const lang = file ? languageForPath(file.path) : null
  const keywords = lang ? KEYWORD_INSERTS[lang.id] ?? [] : []
  const stats = useMemo(
    () => (file ? { lines: countLines(file.content), bytes: bytesOf(file.content) } : null),
    [file],
  )

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

  return (
    <div className="pane code-pane">
      <div className="file-chip-bar">
        <button className="file-chip" onClick={() => setSwitcherOpen(true)}>
          <span className="lang-dot" style={{ background: lang!.color }} />
          <span className="file-chip-name">{fileName(file.path)}</span>
          <Icon name="chevron-down" size={14} />
        </button>
        <span className="save-state">
          {savedAt ? `Saved ${relativeTime(savedAt)}` : 'Autosaves'}
        </span>
        <button className="icon-btn" onClick={onSaveNow} aria-label="Save now">
          <Icon name="save" size={17} />
        </button>
        <button className="icon-btn accent" onClick={() => onRunFile(file.path)} aria-label="Run file">
          <Icon name="play" size={17} filled />
        </button>
      </div>

      <div className="editor-wrap">
        <CodeEditor
          key={file.path}
          value={file.content}
          path={file.path}
          settings={settings}
          onChange={(value) => onChangeFile(file.path, value)}
          onSave={onSaveNow}
          onRun={onRun}
          onReady={(instance) => {
            editorRef.current = instance
          }}
          onDestroy={() => {
            editorRef.current = null
          }}
        />
      </div>

      <div className="editor-status">
        <span>{lang?.label}</span>
        <span className="dot-sep">·</span>
        <span>{stats?.lines} lines</span>
        <span className="dot-sep">·</span>
        <span>{formatBytes(stats?.bytes ?? 0)}</span>
        <div className="toolbar-spacer" />
        <span className="status-entry">
          entry: {runEntry ? fileName(runEntry) : '—'}
        </span>
      </div>

      <div className="editor-toolbar" role="toolbar" aria-label="Editing tools">
        <div className="tool-scroll">
          <button className="tool-btn" onClick={() => editorRef.current?.indent()} aria-label="Indent">
            <Icon name="indent" size={18} />
          </button>
          <button className="tool-btn" onClick={() => setSymbolsOpen(true)} aria-label="Quick keys">
            <span className="tool-glyph">⌘</span>
          </button>
          <button className="tool-btn" onClick={() => editorRef.current?.undo()} aria-label="Undo">
            <Icon name="undo" size={18} />
          </button>
          <button className="tool-btn" onClick={() => editorRef.current?.redo()} aria-label="Redo">
            <Icon name="redo" size={18} />
          </button>
          <button
            className="tool-btn"
            onClick={() => editorRef.current?.toggleComment()}
            aria-label="Toggle comment"
          >
            <Icon name="comment" size={18} />
          </button>
          <button className="tool-btn" onClick={() => editorRef.current?.openSearch()} aria-label="Find">
            <Icon name="search" size={18} />
          </button>
          <button className="tool-btn" onClick={() => setTypeOpen(true)} aria-label="Text options">
            <span className="tool-glyph">Aa</span>
          </button>
        </div>
        <button className="tool-btn primary-soft" onClick={onRun} aria-label="Run project">
          <Icon name="play" size={16} filled />
          <span className="tool-label">Run</span>
        </button>
      </div>

      <Sheet
        open={switcherOpen}
        title="Switch file"
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
        title="Quick keys"
        subtitle={lang ? `${lang.label} helpers` : undefined}
        onClose={() => setSymbolsOpen(false)}
      >
        {keywords.length > 0 && (
          <>
            <p className="field-label">Insert</p>
            <div className="chip-row wrap">
              {keywords.map((word) => (
                <button
                  key={word}
                  className="chip mono"
                  onClick={() => {
                    editorRef.current?.insert(word)
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
            <button
              key={symbol.label}
              className="symbol-key"
              onClick={() => editorRef.current?.insert(symbol.insert)}
            >
              {symbol.label}
            </button>
          ))}
        </div>
        <div className="row-gap">
          <button
            className="btn ghost block"
            onClick={() => {
              editorRef.current?.wrapSelection('**')
              onNotify('Wrapped selection')
            }}
          >
            Bold
          </button>
          <button
            className="btn ghost block"
            onClick={() => editorRef.current?.wrapSelection('`')}
          >
            Code span
          </button>
        </div>
      </Sheet>

      <Sheet open={typeOpen} title="Text options" onClose={() => setTypeOpen(false)}>
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
            <strong>Line numbers</strong>
            <p>Useful for bigger screens.</p>
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
            <strong>Tab size</strong>
            <p>Spaces inserted with the indent key.</p>
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
            <strong>Font family</strong>
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
      </Sheet>
    </div>
  )
}
