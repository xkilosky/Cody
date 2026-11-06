import { useEffect, useMemo, useState } from 'react'
import type { ProjectFile } from '../types'
import Icon from './Icons'
import LangIcon from './LangIcon'
import Sheet from './Sheet'
import { replaceProject, searchProject, type Replacement } from '../lib/search'

type Props = {
  open: boolean
  files: ProjectFile[]
  onClose: () => void
  /** Take me to the match: open that file and put the caret on it. */
  onOpenMatch: (path: string, line: number, column: number) => void
  /** Apply a project-wide replacement (App commits all files at once). */
  onReplace: (changes: Replacement[], total: number) => void
}

/**
 * Find in files.
 *
 * The Files tab's box only filters names — this sheet is the other question:
 * "where is this used?". Results are grouped by file, ordered by how often the
 * file uses the word, and every row is a jump. Replace is a second step behind
 * a confirm, because it writes to every matching file at once.
 */
export default function SearchSheet({ open, files, onClose, onOpenMatch, onReplace }: Props) {
  const [query, setQuery] = useState('')
  const [replacement, setReplacement] = useState('')
  const [caseSensitive, setCaseSensitive] = useState(false)
  const [regex, setRegex] = useState(false)
  const [replacing, setReplacing] = useState(false)
  const [confirming, setConfirming] = useState(false)

  // A fresh sheet starts clean; reopening keeps no stale results around.
  useEffect(() => {
    if (!open) {
      setReplacing(false)
      setConfirming(false)
    }
  }, [open])

  useEffect(() => {
    if (query === '') setConfirming(false)
  }, [query])

  const result = useMemo(
    () => searchProject(files, query, { caseSensitive, regex }),
    [files, query, caseSensitive, regex],
  )

  const summary = result.error
    ? result.error
    : query === ''
      ? 'Search every file in this workspace'
      : result.total === 0
        ? 'No matches'
        : `${result.total} match${result.total === 1 ? '' : 'es'} in ${result.fileCount} file${result.fileCount === 1 ? '' : 's'}${
            result.truncated ? ' · showing the first ones' : ''
          }`

  const applyReplace = () => {
    const { changes, total } = replaceProject(files, query, replacement, { caseSensitive, regex })
    if (total === 0) {
      setConfirming(false)
      return
    }
    onReplace(changes, total)
    setConfirming(false)
    setReplacing(false)
    onClose()
  }

  const jump = (path: string, line: number, column: number) => {
    onOpenMatch(path, line, column)
    onClose()
  }

  return (
    <Sheet
      open={open}
      size="tall"
      title="Find in files"
      subtitle={summary}
      onClose={onClose}
      footer={
        confirming ? (
          <div className="confirm-row">
            <button className="btn ghost" onClick={() => setConfirming(false)}>
              Cancel
            </button>
            <button className="btn danger" onClick={applyReplace}>
              Replace {result.total} in {result.fileCount} file{result.fileCount === 1 ? '' : 's'}
            </button>
          </div>
        ) : (
          <div className="confirm-row">
            <button
              className="btn ghost"
              onClick={() => {
                setReplacing((prev) => !prev)
                setConfirming(false)
              }}
            >
              <Icon name="pencil" size={14} /> {replacing ? 'Hide replace' : 'Replace'}
            </button>
            {replacing && (
              <button
                className="btn primary"
                disabled={result.total === 0 || !!result.error}
                onClick={() => setConfirming(true)}
              >
                Replace all
              </button>
            )}
          </div>
        )
      }
    >
      <div className="find-field">
        <Icon name="search" size={15} />
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={(event) => {
            if (event.key !== 'Enter') return
            const first = result.files[0]?.matches[0]
            if (first) jump(result.files[0].path, first.line, first.column)
          }}
          placeholder="Find in files"
          aria-label="Find in files"
          type="search"
          enterKeyHint="search"
          autoCapitalize="off"
          autoCorrect="off"
          autoComplete="off"
          spellCheck={false}
        />
        <button
          className={`find-toggle${caseSensitive ? ' active' : ''}`}
          onClick={() => setCaseSensitive((prev) => !prev)}
          aria-pressed={caseSensitive}
          aria-label="Match case"
          title="Match case"
        >
          Aa
        </button>
        <button
          className={`find-toggle${regex ? ' active' : ''}`}
          onClick={() => setRegex((prev) => !prev)}
          aria-pressed={regex}
          aria-label="Use regular expression"
          title="Regular expression"
        >
          .*
        </button>
      </div>

      {replacing && (
        <div className="find-field replacement">
          <Icon name="arrow-right" size={15} />
          <input
            value={replacement}
            onChange={(event) => setReplacement(event.target.value)}
            placeholder="Replace with"
            aria-label="Replace with"
            autoCapitalize="off"
            autoCorrect="off"
            autoComplete="off"
            spellCheck={false}
          />
        </div>
      )}

      {query !== '' && result.total === 0 && !result.error && (
        <div className="find-empty">
          <Icon name="search" size={18} />
          <span>
            Nothing matches <strong>{query}</strong>
          </span>
        </div>
      )}

      <div className="find-results">
        {result.files.map((entry) => (
          <div key={entry.path} className="find-group">
            <div className="find-file">
              <LangIcon path={entry.path} size={14} />
              <span className="grow">{entry.path}</span>
              <span className="find-count">{entry.matches.length}</span>
            </div>
            {entry.matches.map((match) => (
              <button
                key={`${match.line}:${match.column}:${match.start}`}
                className="find-row"
                onClick={() => jump(entry.path, match.line, match.column)}
              >
                <span className="find-loc">{match.line}</span>
                <span className="find-text">
                  {match.before}
                  <mark className="find-hit">{match.match}</mark>
                  {match.after}
                </span>
              </button>
            ))}
          </div>
        ))}
      </div>
    </Sheet>
  )
}
