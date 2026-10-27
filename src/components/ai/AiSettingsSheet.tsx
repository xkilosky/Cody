import { useEffect, useMemo, useState } from 'react'
import type { AiConfig, AiRole } from '../../lib/ai/config'
import { ROLES } from '../../lib/ai/config'
import {
  PROVIDERS,
  hintsFor,
  isFreeModel,
  providerOf,
  registeredFreeModels,
  type ProviderId,
} from '../../lib/ai/providers'
import {
  discoverModels,
  probeProvider,
  resetCooldowns,
  selectTargets,
  type ProbeResult,
} from '../../lib/ai/client'
import { clearKeys, getKeys, maskKey, setKey } from '../../lib/ai/keys'
import { TOOLS, toolGroups } from '../../lib/ai/tools'
import Icon from '../Icons'
import Sheet from '../Sheet'

type Props = {
  open: boolean
  config: AiConfig
  onChange: (patch: Partial<AiConfig>) => void
  onClose: () => void
  onNotify: (message: string, tone?: 'info' | 'success' | 'error') => void
  /** Fired whenever keys change so the rest of the app can re-render. */
  onKeysChanged: () => void
}

type ProbeState = { busy: boolean; result: ProbeResult | null }

export default function AiSettingsSheet({ open, config, onChange, onClose, onNotify, onKeysChanged }: Props) {
  const [keys, setKeys] = useState<Record<string, string>>({})
  const [expanded, setExpanded] = useState<ProviderId | null>(null)
  const [probes, setProbes] = useState<Partial<Record<ProviderId, ProbeState>>>({})
  const [discovered, setDiscovered] = useState<Partial<Record<ProviderId, string[]>>>({})
  const [showTools, setShowTools] = useState(false)
  // Catalogues are module state; this just makes React re-read them.
  const [, setCatalogTick] = useState(0)

  useEffect(() => {
    if (!open) return
    const saved = getKeys() as Record<string, string>
    setKeys(saved)
    setProbes({})
    resetCooldowns()

    // Ask each provider that has a key what it serves — its free models are a
    // fact only it knows, and a provider whose free ids are invisible cannot be
    // chosen, listed or trusted here.
    let cancelled = false
    const blind = PROVIDERS.filter(
      (provider) =>
        !provider.custom &&
        Boolean(saved[provider.id]) &&
        registeredFreeModels(provider.id).length === 0 &&
        hintsFor(provider.id).every((hint) => !isFreeModel(provider.id, hint.id)),
    )
    void Promise.all(
      blind.map(async (provider) => {
        const result = await discoverModels(provider.id, saved[provider.id], config.customBaseUrl)
        if (cancelled) return
        if (result.models.length > 0) {
          setDiscovered((prev) => ({ ...prev, [provider.id]: result.models }))
        }
        setCatalogTick((tick) => tick + 1)
      }),
    )
    return () => {
      cancelled = true
    }
  }, [open, config.customBaseUrl])

  const saveKey = (id: ProviderId, value: string) => {
    setKeys((prev) => ({ ...prev, [id]: value }))
    setKey(id, value)
    onKeysChanged()
  }

  const runProbe = async (id: ProviderId) => {
    setProbes((prev) => ({ ...prev, [id]: { busy: true, result: null } }))
    const result = await probeProvider(config, id, keys[id] ?? '')
    setProbes((prev) => ({ ...prev, [id]: { busy: false, result } }))
    if (result.models.length > 0) setDiscovered((prev) => ({ ...prev, [id]: result.models }))
    if (result.ok) {
      onNotify(`${providerOf(id).label} answered in ${result.ms} ms`, 'success')
      resetCooldowns()
    } else {
      onNotify(result.error ?? 'That provider did not answer', 'error')
    }
  }

  const loadModels = async (id: ProviderId) => {
    if (!keys[id]) return
    const result = await discoverModels(id, keys[id], config.customBaseUrl)
    if (result.models.length > 0) setDiscovered((prev) => ({ ...prev, [id]: result.models }))
    else if (result.error) onNotify(result.error, 'error')
  }

  const configuredCount = useMemo(
    () => PROVIDERS.filter((provider) => (provider.custom ? Boolean(config.customBaseUrl.trim()) : Boolean(keys[provider.id]))).length,
    [keys, config.customBaseUrl],
  )

  const selection = selectTargets(config, keys, 'planner')

  const modelOptions = (id: ProviderId): string[] => {
    const hints = hintsFor(id, 'any').map((hint) => hint.id)
    // Catalog-model first: those are the ones this account can call for free.
    return [...new Set([...registeredFreeModels(id), ...hints, ...(discovered[id] ?? [])])]
  }

  /** Free first, so the datalist itself steers towards the cheap end. */
  const freeFirst = (id: ProviderId): string[] => {
    const options = modelOptions(id)
    const free = options.filter((option) => isFreeModel(id, option))
    return [...free, ...options.filter((option) => !free.includes(option))]
  }

  return (
    <Sheet
      open={open}
      size="tall"
      title="AI"
      subtitle={
        configuredCount === 0
          ? 'Bring your own key — nothing is sent anywhere until you ask'
          : `${configuredCount} provider${configuredCount === 1 ? '' : 's'} ready · ${selection.targets.length} candidate model${selection.targets.length === 1 ? '' : 's'}`
      }
      onClose={onClose}
    >
      <section className="settings-section">
        <h3>Models</h3>
        <div className="setting-row">
          <div>
            <strong>Automatic selection</strong>
            <p>Pick a model per job from every provider that has a key.</p>
          </div>
          <button
            className={`switch${config.auto ? ' on' : ''}`}
            role="switch"
            aria-checked={config.auto}
            aria-label="Automatic model selection"
            onClick={() => onChange({ auto: !config.auto })}
          >
            <span />
          </button>
        </div>
        <div className="setting-row">
          <div>
            <strong>Fail over</strong>
            <p>If a model errors, is rate-limited or is retired, try the next one instead of stopping.</p>
          </div>
          <button
            className={`switch${config.fallback ? ' on' : ''}`}
            role="switch"
            aria-checked={config.fallback}
            aria-label="Fall back to another model"
            onClick={() => onChange({ fallback: !config.fallback })}
          >
            <span />
          </button>
        </div>
        <div className="setting-row">
          <div>
            <strong>Free models only</strong>
            <p>
              Never call a model that costs money — Groq, Cerebras, Gemini, Mistral Small and every
              OpenRouter <code>:free</code> model qualify. Paid models are used only if you pin one.
            </p>
          </div>
          <button
            className={`switch${config.freeOnly ? ' on' : ''}`}
            role="switch"
            aria-checked={config.freeOnly}
            aria-label="Free models only"
            onClick={() => onChange({ freeOnly: !config.freeOnly })}
          >
            <span />
          </button>
        </div>
        {config.freeOnly && selection.paidFallback && (
          <p className="ai-probe bad">
            No free model found on the providers you added, so paid ones are being used. Add a free key
            (Groq, Cerebras, Gemini, OpenRouter) or pin a free model.
          </p>
        )}
        <div className="ai-chain" aria-label="Fallback order">
          {selection.targets.length === 0 ? (
            <span className="muted small">No candidates yet — add a key below.</span>
          ) : (
            selection.targets.slice(0, 5).map((target, index) => (
              <span
                key={`${target.provider}:${target.model}`}
                className={`ai-chain-item${isFreeModel(target.provider, target.model) ? ' free' : ''}`}
              >
                <span className="ai-chain-index">{index + 1}</span>
                {providerOf(target.provider).label} · {target.label ?? target.model}
                <span className="ai-cost">{isFreeModel(target.provider, target.model) ? 'free' : 'paid'}</span>
              </span>
            ))
          )}
          {selection.targets.length > 5 && (
            <span className="muted small">+{selection.targets.length - 5} more</span>
          )}
        </div>
      </section>

      <section className="settings-section">
        <h3>Keys</h3>
        <p className="ai-privacy">
          <Icon name="key" size={12} /> Keys are stored on this device only. They are not part of your projects,
          ZIP exports or backups, and there is no Cody server to send them to.
        </p>

        {PROVIDERS.map((provider) => {
          const saved = keys[provider.id] ?? ''
          const isOpen = expanded === provider.id || (expanded === null && !saved && provider.id === 'openrouter' && configuredCount === 0)
          const probe = probes[provider.id]
          return (
            <div key={provider.id} className={`ai-provider${saved ? ' ready' : ''}`}>
              <button
                className="ai-provider-head"
                onClick={() => setExpanded((prev) => (prev === provider.id ? null : provider.id))}
                aria-expanded={isOpen}
              >
                <span className={`ai-dot${saved ? ' on' : ''}`} />
                <span className="grow">
                  <strong>{provider.label}</strong>
                  <span className="ai-provider-blurb">{provider.blurb}</span>
                </span>
                {provider.freeTier && (
                  <span className="ai-free-chip">
                    {registeredFreeModels(provider.id).length > 0
                      ? `${registeredFreeModels(provider.id).length} free`
                      : 'free'}
                  </span>
                )}
                <span className="ai-provider-state">{saved ? maskKey(saved) : 'not set'}</span>
                <Icon name={isOpen ? 'chevron-down' : 'chevron-right'} size={14} />
              </button>

              {isOpen && (
                <div className="ai-provider-body">
                  {provider.freeTier && provider.freeNote && (
                    <p className="ai-free-note">{provider.freeNote}</p>
                  )}
                  {!provider.custom && (
                    <>
                      <label className="field-label" htmlFor={`ai-key-${provider.id}`}>
                        API key
                      </label>
                      <div className="ai-key-row">
                        <input
                          id={`ai-key-${provider.id}`}
                          className="text-input"
                          type="password"
                          value={saved}
                          placeholder={provider.id === 'openrouter' ? 'sk-or-v1-…' : 'paste your key'}
                          autoCapitalize="off"
                          autoCorrect="off"
                          spellCheck={false}
                          onChange={(event) => saveKey(provider.id, event.target.value)}
                        />
                        <button className="btn small ghost" onClick={() => runProbe(provider.id)} disabled={!saved || probe?.busy}>
                          {probe?.busy ? 'Testing…' : 'Test'}
                        </button>
                      </div>
                      <div className="ai-provider-links">
                        {provider.keysUrl && (
                          <a className="linkish" href={provider.keysUrl} target="_blank" rel="noreferrer">
                            Get a {provider.label} key
                          </a>
                        )}
                        {saved && (
                          <button
                            className="linkish"
                            onClick={() => {
                              saveKey(provider.id, '')
                              onNotify(`${provider.label} key removed`)
                            }}
                          >
                            Remove
                          </button>
                        )}
                      </div>
                    </>
                  )}

                  {provider.custom && (
                    <>
                      <label className="field-label" htmlFor="ai-custom-url">
                        Base URL
                      </label>
                      <input
                        id="ai-custom-url"
                        className="text-input"
                        value={config.customBaseUrl}
                        placeholder="http://192.168.1.20:11434/v1"
                        autoCapitalize="off"
                        autoCorrect="off"
                        spellCheck={false}
                        onChange={(event) => onChange({ customBaseUrl: event.target.value })}
                      />
                      <label className="field-label" htmlFor="ai-custom-model">
                        Model id
                      </label>
                      <input
                        id="ai-custom-model"
                        className="text-input"
                        value={config.customModel}
                        placeholder="llama-3.3-70b"
                        autoCapitalize="off"
                        autoCorrect="off"
                        spellCheck={false}
                        onChange={(event) => onChange({ customModel: event.target.value })}
                      />
                      <label className="field-label" htmlFor="ai-key-custom">
                        API key (optional for local servers)
                      </label>
                      <input
                        id="ai-key-custom"
                        className="text-input"
                        type="password"
                        value={saved}
                        placeholder="leave empty for LM Studio / Ollama"
                        autoCapitalize="off"
                        autoCorrect="off"
                        spellCheck={false}
                        onChange={(event) => saveKey(provider.id, event.target.value)}
                      />
                      <div className="ai-provider-links">
                        <button className="btn small ghost" onClick={() => runProbe(provider.id)} disabled={!config.customBaseUrl.trim()}>
                          Test endpoint
                        </button>
                      </div>
                    </>
                  )}

                  {probe?.result && (
                    <p className={`ai-probe${probe.result.ok ? ' ok' : ' bad'}`}>
                      {probe.result.ok
                        ? `Answered in ${probe.result.ms} ms — “${probe.result.reply}” · ${probe.result.models.length} models listed`
                        : probe.result.error}
                    </p>
                  )}

                  {saved && !provider.custom && (
                    <div className="ai-model-row">
                      <label className="field-label" htmlFor={`ai-model-${provider.id}`}>
                        Preferred model
                      </label>
                      <div className="ai-key-row">
                        <input
                          id={`ai-model-${provider.id}`}
                          className="text-input"
                          list={`ai-models-${provider.id}`}
                          value={config.provider === provider.id ? config.model : ''}
                          placeholder={freeFirst(provider.id)[0] ?? 'auto'}
                          autoCapitalize="off"
                          autoCorrect="off"
                          spellCheck={false}
                          onChange={(event) =>
                            onChange({ provider: provider.id, model: event.target.value.trim() })
                          }
                        />
                        <button className="btn small ghost" onClick={() => loadModels(provider.id)}>
                          List
                        </button>
                      </div>
                      <datalist id={`ai-models-${provider.id}`}>
                        {freeFirst(provider.id).map((model) => (
                          <option key={model} value={model} />
                        ))}
                      </datalist>
                      <div className="ai-provider-links">
                        <button
                          className="btn small ghost"
                          onClick={() => onChange({ provider: provider.id, model: '' })}
                          disabled={config.provider === provider.id}
                        >
                          {config.provider === provider.id ? 'Preferred ✓' : `Use ${provider.label} first`}
                        </button>
                        {registeredFreeModels(provider.id).length > 0 && (
                          <span className="muted small">
                            {registeredFreeModels(provider.id).length} free models found
                          </span>
                        )}
                      </div>
                      <p className="muted small">
                        Empty means automatic — free models first. Model ids change often; “List” asks the
                        provider what it serves.
                      </p>
                      {!selection.targets.some((target) => target.provider === provider.id) && (
                        <p className="ai-probe bad">
                          {config.freeOnly
                            ? 'Not in the candidate list: no free model known here yet. Press List, or turn off “Free models only”.'
                            : 'Not in the candidate list — check the key and press List.'}
                        </p>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          )
        })}

        {configuredCount > 0 && (
          <button
            className="linkish ai-clear-keys"
            onClick={() => {
              clearKeys()
              setKeys({})
              setDiscovered({})
              onKeysChanged()
              onNotify('All AI keys removed from this device')
            }}
          >
            Remove every key
          </button>
        )}
      </section>

      <section className="settings-section">
        <h3>The crew</h3>
        <p className="muted small">
          Four agents share one transcript. Leave a role empty to let automatic selection choose for it.
        </p>
        {ROLES.map((role) => {
          const choice = config.roles[role.id]
          const options = PROVIDERS.filter((provider) => !provider.custom && keys[provider.id])
          return (
            <div key={role.id} className="ai-role-row">
              <div className="ai-role-id">
                <span className="ai-avatar" data-role={role.id} aria-hidden="true">
                  {role.short}
                </span>
                <div>
                  <strong>{role.label}</strong>
                  <span className="muted small">{role.job}</span>
                </div>
              </div>
              <div className="ai-role-controls">
                <select
                  className="text-input ai-select"
                  aria-label={`${role.label} provider`}
                  value={choice.provider}
                  onChange={(event) =>
                    onChange({
                      roles: {
                        ...config.roles,
                        [role.id]: { provider: event.target.value as ProviderId | '', model: '' },
                      },
                    })
                  }
                >
                  <option value="">Auto</option>
                  {options.map((provider) => (
                    <option key={provider.id} value={provider.id}>
                      {provider.label}
                    </option>
                  ))}
                </select>
                <input
                  className="text-input ai-role-model"
                  aria-label={`${role.label} model`}
                  list={`ai-role-models-${role.id}`}
                  value={choice.model}
                  placeholder={
                    choice.provider
                      ? (config.freeOnly
                          ? (freeFirst(choice.provider)[0] ?? '')
                          : hintsFor(choice.provider, role.tier)[0]?.id) ?? 'auto'
                      : 'auto'
                  }
                  autoCapitalize="off"
                  autoCorrect="off"
                  spellCheck={false}
                  onChange={(event) =>
                    onChange({
                      roles: {
                        ...config.roles,
                        [role.id]: { provider: choice.provider, model: event.target.value.trim() },
                      },
                    })
                  }
                />
                <datalist id={`ai-role-models-${role.id}`}>
                  {freeFirst((choice.provider || config.provider) as ProviderId).map((model) => (
                    <option key={model} value={model} />
                  ))}
                </datalist>
              </div>
            </div>
          )
        })}
      </section>

      <section className="settings-section">
        <h3>Behaviour</h3>
        <div className="setting-row">
          <div>
            <strong>Changes</strong>
            <p>Write straight into the project, or ask you before each edit.</p>
          </div>
          <div className="segmented">
            <button className={config.writes === 'auto' ? 'active' : ''} onClick={() => onChange({ writes: 'auto' })}>
              Auto
            </button>
            <button className={config.writes === 'confirm' ? 'active' : ''} onClick={() => onChange({ writes: 'confirm' })}>
              Ask
            </button>
          </div>
        </div>
        <div className="setting-row">
          <div>
            <strong>Turn limit</strong>
            <p>How many agent turns a crew run may take before it stops. Every run can be undone.</p>
          </div>
          <div className="segmented">
            {[4, 8, 12].map((value) => (
              <button key={value} className={config.maxTurns === value ? 'active' : ''} onClick={() => onChange({ maxTurns: value })}>
                {value}
              </button>
            ))}
          </div>
        </div>
        <div className="setting-row column">
          <div>
            <strong>Temperature</strong>
            <p>{config.temperature.toFixed(1)} — lower is more literal, which is usually better for code.</p>
          </div>
          <input
            className="ai-range"
            type="range"
            min={0}
            max={1}
            step={0.1}
            value={config.temperature}
            aria-label="Temperature"
            onChange={(event) => onChange({ temperature: Number(event.target.value) })}
          />
        </div>
      </section>

      <section className="settings-section">
        <button className="ai-tools-toggle" onClick={() => setShowTools((prev) => !prev)} aria-expanded={showTools}>
          <Icon name="zap" size={14} />
          <span className="grow">{TOOLS.length} tools the agents can use</span>
          <Icon name={showTools ? 'chevron-down' : 'chevron-right'} size={14} />
        </button>
        {showTools && (
          <div className="ai-tool-list">
            {toolGroups().map((group) => (
              <div key={group.group} className="ai-tool-group">
                <h4>{group.label}</h4>
                {group.tools.map((tool) => (
                  <div key={tool.name} className="ai-tool-line">
                    <code>{tool.name}</code>
                    <span>{tool.summary}</span>
                  </div>
                ))}
              </div>
            ))}
          </div>
        )}
      </section>
    </Sheet>
  )
}
