import { useEffect, useState } from 'react'
import type { ProjectMeta, Settings } from '../types'
import { checkRunner } from '../lib/cloud'
import { downloadText, formatBytes } from '../lib/utils'
import { loadProject } from '../lib/storage'
import { projectToJson } from '../lib/importExport'
import Icon from './Icons'
import Sheet from './Sheet'

type Props = {
  open: boolean
  settings: Settings
  projects: ProjectMeta[]
  onChange: (patch: Partial<Settings>) => void
  onClose: () => void
  onNotify: (message: string, tone?: 'info' | 'success' | 'error') => void
}

export default function SettingsSheet({ open, settings, projects, onChange, onClose, onNotify }: Props) {
  const [endpoint, setEndpoint] = useState(settings.runnerEndpoint)
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState<string | null>(null)
  const [usage, setUsage] = useState<string | null>(null)
  const [exporting, setExporting] = useState(false)

  useEffect(() => {
    if (open) setEndpoint(settings.runnerEndpoint)
  }, [open, settings.runnerEndpoint])

  useEffect(() => {
    if (!open) return
    let cancelled = false
    void (async () => {
      try {
        const estimate = await navigator.storage?.estimate?.()
        if (!cancelled && estimate?.usage != null) {
          setUsage(`${formatBytes(estimate.usage)}${estimate.quota ? ` of ${formatBytes(estimate.quota)}` : ''}`)
        }
      } catch {
        /* ignore */
      }
    })()
    return () => {
      cancelled = true
    }
  }, [open])

  const exportAll = async () => {
    setExporting(true)
    try {
      const all = []
      for (const meta of projects) {
        const project = await loadProject(meta.id)
        if (project) all.push(JSON.parse(projectToJson(project)))
      }
      downloadText(
        `cody-backup-${new Date().toISOString().slice(0, 10)}.json`,
        JSON.stringify({ format: 'cody-backup', version: 1, projects: all }, null, 2),
        'application/json',
      )
      onNotify(`Backed up ${all.length} project${all.length === 1 ? '' : 's'}`, 'success')
    } finally {
      setExporting(false)
    }
  }

  const runTest = async () => {
    setTesting(true)
    setTestResult(null)
    try {
      const result = await checkRunner(endpoint)
      setTestResult(result)
      onNotify('Runner reachable', 'success')
    } catch (error) {
      setTestResult(`Unreachable: ${(error as Error).message}`)
      onNotify('Runner unreachable', 'error')
    } finally {
      setTesting(false)
    }
  }

  return (
    <Sheet
      open={open}
      title="Settings"
      subtitle="Tuned for one-handed editing"
      onClose={onClose}
      size="tall"
    >
      <section className="settings-section">
        <h3>Appearance</h3>
        <div className="setting-row">
          <div>
            <strong>Theme</strong>
            <p>Dark is easier at night; light is easier outdoors.</p>
          </div>
          <div className="segmented">
            <button
              className={settings.theme === 'dark' ? 'active' : ''}
              onClick={() => onChange({ theme: 'dark' })}
            >
              <Icon name="moon" size={14} /> Dark
            </button>
            <button
              className={settings.theme === 'light' ? 'active' : ''}
              onClick={() => onChange({ theme: 'light' })}
            >
              <Icon name="sun" size={14} /> Light
            </button>
          </div>
        </div>
        <div className="setting-row">
          <div>
            <strong>Editor font size</strong>
            <p>{settings.fontSize}px · tap + for easier reading.</p>
          </div>
          <div className="stepper">
            <button onClick={() => onChange({ fontSize: Math.max(11, settings.fontSize - 1) })}>−</button>
            <span>{settings.fontSize}</span>
            <button onClick={() => onChange({ fontSize: Math.min(22, settings.fontSize + 1) })}>+</button>
          </div>
        </div>
        <div className="setting-row">
          <div>
            <strong>Line wrap</strong>
            <p>No horizontal scrolling on narrow screens.</p>
          </div>
          <button
            className={`switch${settings.lineWrap ? ' on' : ''}`}
            aria-label="Toggle line wrap"
            aria-pressed={settings.lineWrap}
            onClick={() => onChange({ lineWrap: !settings.lineWrap })}
          />
        </div>
        <div className="setting-row">
          <div>
            <strong>Line numbers</strong>
            <p>Helpful on tablets and desktops.</p>
          </div>
          <button
            className={`switch${settings.showLineNumbers ? ' on' : ''}`}
            aria-label="Toggle line numbers"
            aria-pressed={settings.showLineNumbers}
            onClick={() => onChange({ showLineNumbers: !settings.showLineNumbers })}
          />
        </div>
        <div className="setting-row">
          <div>
            <strong>Haptics</strong>
            <p>Subtle vibration on run and save.</p>
          </div>
          <button
            className={`switch${settings.haptics ? ' on' : ''}`}
            aria-label="Toggle haptics"
            aria-pressed={settings.haptics}
            onClick={() => onChange({ haptics: !settings.haptics })}
          />
        </div>
      </section>

      <section className="settings-section">
        <h3>Preview</h3>
        <div className="setting-row">
          <div>
            <strong>Auto re-run</strong>
            <p>Refresh the live preview shortly after you stop typing.</p>
          </div>
          <button
            className={`switch${settings.autoRun ? ' on' : ''}`}
            aria-label="Toggle auto run"
            aria-pressed={settings.autoRun}
            onClick={() => onChange({ autoRun: !settings.autoRun })}
          />
        </div>
      </section>

      <section className="settings-section">
        <h3>Runner</h3>
        <p className="section-note">
          C, C++, Java, Go, Rust, PHP, Ruby, SQL and friends run through a Piston-compatible API.
          Point Cody at your own instance for unlimited runs.
        </p>
        <label className="field-label">Piston execute endpoint</label>
        <div className="row-gap">
          <input
            className="text-input grow"
            value={endpoint}
            onChange={(event) => setEndpoint(event.target.value)}
            onBlur={() => {
              if (endpoint.trim() && endpoint !== settings.runnerEndpoint) {
                onChange({ runnerEndpoint: endpoint.trim() })
                onNotify('Runner endpoint saved', 'success')
              }
            }}
            placeholder="https://emkc.org/api/v2/piston/execute"
            autoCapitalize="off"
            autoCorrect="off"
            spellCheck={false}
          />
          <button className="btn small ghost" onClick={runTest} disabled={testing}>
            {testing ? 'Testing…' : 'Test'}
          </button>
        </div>
        {testResult && <p className="section-note">{testResult}</p>}
      </section>

      <section className="settings-section">
        <h3>Data</h3>
        <div className="setting-row">
          <div>
            <strong>Storage</strong>
            <p>{usage ? `${usage} used by this browser` : 'Stored in IndexedDB on this device.'}</p>
          </div>
          <button className="btn small ghost" onClick={exportAll} disabled={exporting || projects.length === 0}>
            {exporting ? 'Exporting…' : 'Backup all'}
          </button>
        </div>
        <div className="setting-row">
          <div>
            <strong>Reset settings</strong>
            <p>Restores defaults for theme, fonts and runner.</p>
          </div>
          <button
            className="btn small ghost"
            onClick={() => {
              onChange({
                theme: 'dark',
                fontFamily: 'mono',
                fontSize: 13,
                tabSize: 2,
                lineWrap: true,
                showLineNumbers: false,
                autoRun: false,
                haptics: true,
                runnerEndpoint: 'https://emkc.org/api/v2/piston/execute',
              })
              onNotify('Settings reset', 'success')
            }}
          >
            Reset
          </button>
        </div>
      </section>

      <section className="settings-section">
        <h3>About</h3>
        <p className="section-note">
          Cody is a mobile-first, multi-language project editor. Editing, transpiling (Sucrase),
          bundling and previewing all happen locally; only cloud-runner languages leave the device.
        </p>
        <p className="section-note">Version 1.0.0 · React 18 · CodeMirror 6 · Pyodide</p>
      </section>
    </Sheet>
  )
}
