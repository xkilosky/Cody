import { useMemo, useState } from 'react'
import type { Project } from '../types'
import { languageForPath, runtimeLabel } from '../lib/languages'
import { SNIPPETS, snippetsFor, type Snippet } from '../lib/snippets'
import Icon from './Icons'
import LangIcon from './LangIcon'
import { copyText } from '../lib/utils'

type Props = {
  project: Project
  activePath: string | null
  onInsertSnippet: (code: string) => void
  onCreateFile: (path: string, content: string) => void
  onOpenFile: (path: string) => void
  onNotify: (message: string, tone?: 'info' | 'success' | 'error') => void
}

const CATEGORIES = ['For this file', 'All', 'UI', 'Layout', 'Data', 'Async', 'Python', 'Systems', 'Docs'] as const

const EXT_FOR_SNIPPET: Record<string, string> = {
  javascript: 'js',
  typescript: 'ts',
  tsx: 'tsx',
  jsx: 'jsx',
  html: 'html',
  css: 'css',
  python: 'py',
  go: 'go',
  rust: 'rs',
  java: 'java',
  c: 'c',
  cpp: 'cpp',
  sql: 'sql',
  markdown: 'md',
  text: 'txt',
}

export default function CodyPanel({
  project,
  activePath,
  onInsertSnippet,
  onCreateFile,
  onOpenFile,
  onNotify,
}: Props) {
  const [query, setQuery] = useState('')
  const [category, setCategory] = useState<(typeof CATEGORIES)[number]>('For this file')

  const activeLang = activePath ? languageForPath(activePath) : null

  const languages = useMemo(() => {
    const counts = new Map<string, number>()
    for (const file of project.files) {
      const lang = languageForPath(file.path)
      counts.set(lang.label, (counts.get(lang.label) ?? 0) + 1)
    }
    return [...counts.entries()].sort((a, b) => b[1] - a[1])
  }, [project.files])

  const runnableCount = useMemo(
    () => project.files.filter((file) => languageForPath(file.path).runtime !== 'none').length,
    [project.files],
  )

  const list = useMemo(() => {
    const base =
      category === 'For this file' && activeLang
        ? snippetsFor(activeLang.id).slice(0, 8)
        : category === 'All' || category === 'For this file'
          ? SNIPPETS
          : SNIPPETS.filter((snippet) => snippet.category === category)
    const q = query.trim().toLowerCase()
    if (!q) return base
    return base.filter(
      (snippet) =>
        snippet.title.toLowerCase().includes(q) ||
        snippet.description.toLowerCase().includes(q) ||
        snippet.languages.some((lang) => lang.includes(q)),
    )
  }, [category, query, activeLang])

  const handleInsert = (snippet: Snippet) => {
    if (!activePath) {
      onNotify('Open a file first, then insert', 'error')
      return
    }
    onInsertSnippet(`\n${snippet.code}\n`)
    onNotify(`Inserted “${snippet.title}”`, 'success')
  }

  const handleNewFile = (snippet: Snippet) => {
    const lang = activeLang?.id && snippet.languages.includes(activeLang.id) ? activeLang.id : snippet.languages[0]
    const ext = EXT_FOR_SNIPPET[lang] ?? 'txt'
    const safeName = snippet.id.replace(/[^a-z0-9]+/gi, '-')
    const dir = activePath?.includes('/') ? `${activePath.slice(0, activePath.lastIndexOf('/'))}/` : ''
    const base = `${dir}${safeName}.${ext}`
    let path = base
    let counter = 2
    while (project.files.some((file) => file.path === path)) {
      path = `${dir}${safeName}-${counter}.${ext}`
      counter += 1
    }
    const content = ext === 'md' ? snippet.code : `${snippet.code}\n`
    onCreateFile(path, content)
    onNotify(`Created ${path}`, 'success')
  }

  return (
    <div className="pane cody-pane">
      <div className="cody-hero">
        <div className="cody-hero-title">
          <span className="spark">
            <Icon name="sparkles" size={18} />
          </span>
          <div>
            <h3>Build faster</h3>
            <p>
              A curated, offline library of {SNIPPETS.length} snippets — insert into{' '}
              {activePath ? activePath.split('/').pop() : 'a file'} or scaffold something new.
            </p>
          </div>
        </div>
        <div className="cody-stats">
          <div>
            <strong>{project.files.length}</strong>
            <span>files</span>
          </div>
          <div>
            <strong>{languages.length}</strong>
            <span>languages</span>
          </div>
          <div>
            <strong>{runnableCount}</strong>
            <span>runnable</span>
          </div>
        </div>
        <div className="chip-row wrap">
          {languages.map(([label, count]) => (
            <span key={label} className="chip static">
              {label} · {count}
            </span>
          ))}
          {languages.length === 0 && <span className="muted small">No files yet</span>}
        </div>
      </div>

      <div className="pane-toolbar">
        <div className="search-field">
          <Icon name="search" size={16} />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search snippets"
            autoCapitalize="off"
            spellCheck={false}
          />
        </div>
      </div>

      <div className="chip-row scroller">
        {CATEGORIES.map((item) => (
          <button
            key={item}
            className={`chip${category === item ? ' active' : ''}`}
            onClick={() => setCategory(item)}
          >
            {item}
          </button>
        ))}
      </div>

      <div className="snippet-list">
        {list.length === 0 ? (
          <div className="empty-state">
            <Icon name="search" size={24} />
            <h3>No snippets match</h3>
            <p>Try another search or category.</p>
          </div>
        ) : (
          list.map((snippet) => (
            <article key={snippet.id} className="snippet-card">
              <header>
                <div>
                  <h4>{snippet.title}</h4>
                  <p>{snippet.description}</p>
                </div>
                <span className="pill tiny">{snippet.category}</span>
              </header>
              <pre className="snippet-preview">
                <code>{snippet.code.split('\n').slice(0, 5).join('\n')}</code>
              </pre>
              <div className="snippet-actions">
                <button className="btn small primary" onClick={() => handleInsert(snippet)}>
                  <Icon name="plus" size={14} /> Insert
                </button>
                <button className="btn small ghost" onClick={() => handleNewFile(snippet)}>
                  <Icon name="file" size={14} /> New file
                </button>
                <button
                  className="btn small ghost"
                  onClick={async () => {
                    const ok = await copyText(snippet.code)
                    onNotify(ok ? 'Copied' : 'Copy failed', ok ? 'success' : 'error')
                  }}
                >
                  <Icon name="copy" size={14} />
                </button>
              </div>
            </article>
          ))
        )}
      </div>

      <div className="cody-foot">
        <div className="runtime-list">
          {[...new Set(project.files.map((file) => languageForPath(file.path)))].slice(0, 6).map((lang) => (
            <div key={lang.id} className="runtime-row">
              <LangIcon lang={lang} size={15} />
              <span className="grow">{lang.label}</span>
              <span className="muted small">{runtimeLabel(lang.runtime)}</span>
            </div>
          ))}
        </div>
        <button className="btn ghost block" onClick={() => activePath && onOpenFile(activePath)}>
          <Icon name="code" size={15} /> Back to editor
        </button>
      </div>
    </div>
  )
}
