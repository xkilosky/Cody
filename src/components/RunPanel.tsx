import { useEffect, useMemo, useRef, useState } from 'react'
import type { LogEntry, Project, RunState, Settings } from '../types'
import { languageForPath, runtimeLabel } from '../lib/languages'
import Icon from './Icons'
import { copyText, formatClock, relativeTime } from '../lib/utils'

type Props = {
  project: Project
  runState: RunState
  runEntry: string | null
  logs: LogEntry[]
  stdin: string
  settings: Settings
  savedAt: number | null
  onSetStdin: (value: string) => void
  onSetRunEntry: (path: string) => void
  onRun: (path?: string) => void
  onStop: () => void
  onClearLogs: () => void
  onOpenFile: (path: string) => void
  onNotify: (message: string, tone?: 'info' | 'success' | 'error') => void
}

export default function RunPanel({
  project,
  runState,
  runEntry,
  logs,
  stdin,
  savedAt,
  onSetStdin,
  onSetRunEntry,
  onRun,
  onStop,
  onClearLogs,
  onOpenFile,
  onNotify,
}: Props) {
  const [view, setView] = useState<'preview' | 'output'>('preview')
  const [autoScroll, setAutoScroll] = useState(true)
  const [showStdin, setShowStdin] = useState(false)
  const logRef = useRef<HTMLDivElement | null>(null)

  const runnable = useMemo(
    () => project.files.filter((file) => languageForPath(file.path).runtime !== 'none'),
    [project.files],
  )
  const entry = runEntry ?? project.entry ?? runnable[0]?.path ?? null
  const lang = entry ? languageForPath(entry) : null
  const running = runState.kind === 'bundling' || runState.kind === 'running' || runState.kind === 'loading-runtime'
  const hasPreview = Boolean(runState.previewHtml)
  const isCloud = lang?.runtime === 'cloud'

  useEffect(() => {
    if (lang?.runtime === 'python') setView('output')
    else if (lang?.runtime === 'web') setView('preview')
  }, [lang?.runtime, entry])

  useEffect(() => {
    if (!autoScroll) return
    const node = logRef.current
    if (node) node.scrollTop = node.scrollHeight
  }, [logs, autoScroll, view])

  useEffect(() => {
    if (logs.length > 0 && runState.kind === 'running' && lang?.runtime !== 'web') setView('output')
  }, [logs.length, runState.kind, lang?.runtime])

  const openInNewTab = () => {
    if (!runState.previewHtml) return
    const blob = new Blob([runState.previewHtml], { type: 'text/html' })
    const url = URL.createObjectURL(blob)
    window.open(url, '_blank', 'noopener,noreferrer')
    setTimeout(() => URL.revokeObjectURL(url), 60_000)
  }

  const copyAll = async () => {
    const text = logs.map((entry) => `[${formatClock(entry.time)}] ${entry.text}`).join('\n')
    const ok = await copyText(text)
    onNotify(ok ? 'Console copied' : 'Copy failed', ok ? 'success' : 'error')
  }

  const errorCount = logs.filter((entry) => entry.level === 'error').length
  const warnCount = logs.filter((entry) => entry.level === 'warn').length

  return (
    <div className="pane run-pane">
      <div className="run-header">
        <label className="run-entry">
          <span className="field-label">Entry</span>
          <div className="select-wrap">
            <select
              value={entry ?? ''}
              onChange={(event) => onSetRunEntry(event.target.value)}
              aria-label="Entry file"
            >
              {runnable.length === 0 && <option value="">No runnable files</option>}
              {runnable.map((file) => (
                <option key={file.path} value={file.path}>
                  {file.path}
                </option>
              ))}
            </select>
            <Icon name="chevron-down" size={14} />
          </div>
        </label>

        <div className="run-actions">
          {running ? (
            <button className="btn danger" onClick={onStop}>
              <Icon name="stop" size={16} filled /> Stop
            </button>
          ) : (
            <button className="btn primary" onClick={() => onRun(entry ?? undefined)} disabled={!entry}>
              <Icon name="play" size={16} filled /> Run
            </button>
          )}
        </div>
      </div>

      <div className="run-meta">
        {lang && (
          <>
            <span className="pill" style={{ borderColor: `${lang.color}55`, color: lang.color }}>
              {lang.label}
            </span>
            <span className={`pill ${isCloud ? 'warn' : 'ok'}`}>{runtimeLabel(lang.runtime)}</span>
          </>
        )}
        {runState.kind === 'done' && <span className="pill ok">finished</span>}
        {runState.kind === 'error' && <span className="pill bad">error</span>}
        {running && <span className="pill live">running…</span>}
        {savedAt && <span className="muted small">edited {relativeTime(savedAt)}</span>}
      </div>

      <div className="segmented full">
        <button
          className={view === 'preview' ? 'active' : ''}
          onClick={() => setView('preview')}
          disabled={!isCloud && lang?.runtime !== 'web' && !hasPreview}
        >
          <Icon name="eye" size={15} /> Preview
        </button>
        <button className={view === 'output' ? 'active' : ''} onClick={() => setView('output')}>
          <Icon name="terminal" size={15} /> Output
          {logs.length > 0 && (
            <span className={`count-badge${errorCount ? ' error' : warnCount ? ' warn' : ''}`}>
              {logs.length}
            </span>
          )}
        </button>
      </div>

      {view === 'preview' ? (
        <div className="preview-area">
          {hasPreview ? (
            <>
              <div className="preview-toolbar">
                <span className="muted small">{runState.runtimeLabel ?? 'Preview'}</span>
                <div className="row-gap">
                  <button className="icon-btn" onClick={() => onRun(entry ?? undefined)} aria-label="Reload preview">
                    <Icon name="refresh" size={16} />
                  </button>
                  <button className="icon-btn" onClick={openInNewTab} aria-label="Open in new tab">
                    <Icon name="external" size={16} />
                  </button>
                </div>
              </div>
              <iframe
                key={runState.runId}
                className="preview-frame"
                title="Live preview"
                srcDoc={runState.previewHtml}
                // Project code runs in this preview; it needs same-origin blob URLs for ESM.
                allow="clipboard-read; clipboard-write; fullscreen"
              />
            </>
          ) : (
            <div className="empty-state tall">
              <Icon name={lang?.runtime === 'none' || !lang ? 'file' : 'play'} size={30} />
              <h3>
                {!entry
                  ? 'Nothing to run yet'
                  : lang?.runtime === 'python'
                    ? 'Python runs in the Output panel'
                    : lang?.runtime === 'cloud'
                      ? 'This language runs in the cloud'
                      : 'No preview yet'}
              </h3>
              <p>
                {!entry
                  ? 'Add a file with a runnable language to get started.'
                  : lang?.runtime === 'python'
                    ? 'Tap Run — stdout and stderr stream into Output.'
                    : lang?.runtime === 'cloud'
                      ? `${lang.label} runs on a remote sandbox. Tap Run and watch the Output tab.`
                      : 'Tap Run to bundle and preview your app.'}
              </p>
              <div className="row-gap">
                <button className="btn primary" onClick={() => onRun(entry ?? undefined)} disabled={!entry}>
                  <Icon name="play" size={16} filled /> Run
                </button>
                {entry && (
                  <button className="btn ghost" onClick={() => onOpenFile(entry)}>
                    Open {entry}
                  </button>
                )}
              </div>
            </div>
          )}
          {runState.kind === 'bundling' && (
            <div className="preview-overlay">
              <span className="spinner" />
              <p>Bundling modules…</p>
            </div>
          )}
        </div>
      ) : (
        <div className="console-area">
          <div className="console-toolbar">
            <button className="icon-btn" onClick={onClearLogs} aria-label="Clear console" title="Clear">
              <Icon name="trash" size={16} />
            </button>
            <button className="icon-btn" onClick={copyAll} aria-label="Copy console" title="Copy">
              <Icon name="copy" size={16} />
            </button>
            <button
              className={`icon-btn${autoScroll ? ' accent' : ''}`}
              onClick={() => setAutoScroll((prev) => !prev)}
              aria-label="Toggle auto-scroll"
              title="Auto-scroll"
            >
              <Icon name="wrap" size={16} />
            </button>
            <div className="toolbar-spacer" />
            <span className="muted small">
              {errorCount > 0 && <span className="text-error">{errorCount} error{errorCount === 1 ? '' : 's'}</span>}
              {errorCount > 0 && warnCount > 0 && ' · '}
              {warnCount > 0 && <span className="text-warn">{warnCount} warning{warnCount === 1 ? '' : 's'}</span>}
              {errorCount === 0 && warnCount === 0 && `${logs.length} messages`}
            </span>
          </div>

          <div className="console" ref={logRef}>
            {logs.length === 0 ? (
              <div className="console-empty">
                <Icon name="terminal" size={22} />
                <p>Console output appears here.</p>
                <p className="muted small">
                  {lang?.runtime === 'web'
                    ? 'Preview console.log, warnings and errors are piped in.'
                    : 'Run your program to see stdout, stderr and exit status.'}
                </p>
              </div>
            ) : (
              logs.map((item) => (
                <div key={item.id} className={`log-row log-${item.level}`}>
                  <span className="log-time">{formatClock(item.time)}</span>
                  <span className="log-text">{item.text}</span>
                  {item.source && <span className="log-source">{item.source}</span>}
                </div>
              ))
            )}
          </div>

          {isCloud && (
            <div className="stdin-block">
              <button className="stdin-toggle" onClick={() => setShowStdin((prev) => !prev)}>
                <Icon name={showStdin ? 'chevron-down' : 'chevron-right'} size={14} />
                Standard input
              </button>
              {showStdin && (
                <textarea
                  className="text-input mono"
                  rows={3}
                  value={stdin}
                  placeholder="Lines sent to stdin when the program runs"
                  onChange={(event) => onSetStdin(event.target.value)}
                />
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
