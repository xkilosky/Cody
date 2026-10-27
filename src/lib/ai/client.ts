/**
 * The one HTTP client every provider goes through.
 *
 * Two things matter here and nothing else does:
 *
 *  1. **Automatic selection.** Instead of one model that either works or
 *     doesn't, a call carries an ordered list of candidates. The first that
 *     answers wins.
 *  2. **Failover that is honest.** A bad key, a retired model, a rate limit and
 *     a dropped connection are different problems; each one is classified, the
 *     hopeless ones are remembered for a while so the crew does not keep
 *     hammering them, and the UI is told what happened ("OpenRouter
 *     claude-sonnet-5 → 404, trying Groq gpt-oss-120b").
 */
import type { AiConfig, AiRole } from './config'
import { ROLES } from './config'
import type { ProviderId } from './providers'
import { authHeaders, baseUrlOf, hintsFor, isConfigured, providerOf } from './providers'
import { getKeys } from './keys'

export type ChatRole = 'system' | 'user' | 'assistant'
export type ChatMessage = { role: ChatRole; content: string }

export type ModelTarget = {
  provider: ProviderId
  model: string
  /** Human label for the UI, when the provider table knows one. */
  label?: string
}

export type AiEvent =
  | { kind: 'try'; target: ModelTarget; attempt: number; total: number }
  | { kind: 'fail'; target: ModelTarget; message: string; status: number | null; willRetry: boolean }
  | { kind: 'ok'; target: ModelTarget; ms: number }
  | { kind: 'no-candidates'; message: string }

export type ChatResult = {
  text: string
  target: ModelTarget
  /** Milliseconds from request to response. */
  ms: number
  usage?: { prompt?: number; completion?: number }
}

export class AiError extends Error {
  status: number | null
  provider: ProviderId
  model: string
  /** True when another candidate has a real chance of working. */
  retryable: boolean
  constructor(message: string, options: { status?: number | null; provider: ProviderId; model: string; retryable?: boolean }) {
    super(message)
    this.name = 'AiError'
    this.status = options.status ?? null
    this.provider = options.provider
    this.model = options.model
    this.retryable = options.retryable ?? true
  }
}

/* ------------------------------------------------------------------ */
/* cooldowns: remember what just failed so a loop does not thrash      */
/* ------------------------------------------------------------------ */

const modelCooldown = new Map<string, number>()
const providerCooldown = new Map<string, number>()

/** A retired model stays retired for five minutes; an exhausted provider, one. */
const MODEL_COOLDOWN_MS = 5 * 60_000
const PROVIDER_COOLDOWN_MS = 60_000

export function resetCooldowns() {
  modelCooldown.clear()
  providerCooldown.clear()
}

function cooling(key: string, map: Map<string, number>, now: number): boolean {
  const until = map.get(key)
  if (until === undefined) return false
  if (until <= now) {
    map.delete(key)
    return false
  }
  return true
}

export function isCoolingDown(provider: ProviderId, model: string): boolean {
  const now = Date.now()
  return cooling(`${provider}:${model}`, modelCooldown, now) || cooling(provider, providerCooldown, now)
}

/* ------------------------------------------------------------------ */
/* choosing the candidates                                             */
/* ------------------------------------------------------------------ */

export type Selection = {
  targets: ModelTarget[]
  /** Why the list looks the way it does — shown in the settings sheet. */
  reason: string
}

function labelFor(provider: ProviderId, model: string): string | undefined {
  return providerOf(provider).models.find((hint) => hint.id === model)?.label
}

function targetOf(provider: ProviderId, model: string): ModelTarget {
  return { provider, model, label: labelFor(provider, model) }
}

function modelForProvider(config: AiConfig, provider: ProviderId, role: AiRole | null): string {
  const tier = role ? ROLES.find((entry) => entry.id === role)?.tier ?? 'any' : 'any'
  if (provider === 'custom') return config.customModel.trim() || 'default'
  if (role) {
    const pinned = config.roles[role]
    if (pinned.provider === provider && pinned.model) return pinned.model
  }
  if (!role || config.auto) {
    if (config.provider === provider && config.model) return config.model
  }
  return hintsFor(provider, tier)[0]?.id ?? ''
}

/**
 * Build the ordered candidate list for one call.
 *
 * `role` null means plain chat. With automatic selection on, the role's own
 * provider wins first, then the user's preferred provider, then every other
 * provider that has a key — so a dead endpoint is a detour, not a dead end.
 */
export function selectTargets(
  config: AiConfig,
  keys: Record<string, string | undefined>,
  role: AiRole | null = null,
): Selection {
  const configured = (provider: ProviderId) => isConfigured(provider, keys[provider], config.customBaseUrl)

  const pinned = role ? config.roles[role] : null
  const order: ProviderId[] = []
  const push = (provider: ProviderId | '') => {
    if (!provider) return
    if (!order.includes(provider)) order.push(provider)
  }

  if (pinned?.provider) push(pinned.provider)
  push(config.provider)
  if (config.auto) {
    // Everything with a key, preferred tiers first.
    const tier = role ? ROLES.find((entry) => entry.id === role)?.tier : undefined
    const others = (Object.keys(keys) as ProviderId[])
      .filter((id) => id !== config.provider && configured(id))
      .sort((a, b) => {
        const score = (id: ProviderId) => hintsFor(id, tier ?? 'any')[0]?.tier === tier ? 0 : 1
        return score(a) - score(b)
      })
    for (const id of others) push(id)
  }
  if (config.customBaseUrl.trim()) push('custom')

  const targets: ModelTarget[] = []
  for (const provider of order) {
    if (!configured(provider) && provider !== 'custom') continue
    const chosen = modelForProvider(config, provider, role)
    if (chosen) targets.push(targetOf(provider, chosen))
    if (!config.auto) continue
    // …then this provider's other hints, so one retired model is not fatal.
    const tier = role ? ROLES.find((entry) => entry.id === role)?.tier : 'any'
    for (const hint of hintsFor(provider, tier ?? 'any')) {
      if (targets.length >= 8) break
      if (!targets.some((target) => target.provider === provider && target.model === hint.id)) {
        targets.push(targetOf(provider, hint.id))
      }
    }
  }

  const unique: ModelTarget[] = []
  for (const target of targets) {
    if (unique.some((entry) => entry.provider === target.provider && entry.model === target.model)) continue
    unique.push(target)
  }

  const reason =
    unique.length === 0
      ? 'No provider is configured yet — add a key in AI settings.'
      : config.auto
        ? `Automatic: ${unique.length} candidate${unique.length === 1 ? '' : 's'} across ${new Set(unique.map((t) => t.provider)).size} provider${new Set(unique.map((t) => t.provider)).size === 1 ? '' : 's'}`
        : `Pinned: ${providerOf(unique[0].provider).label} · ${unique[0].label ?? unique[0].model}`

  return { targets: unique, reason }
}

/* ------------------------------------------------------------------ */
/* one request                                                         */
/* ------------------------------------------------------------------ */

export type CallOptions = {
  config: AiConfig
  keys?: Record<string, string | undefined>
  role?: AiRole | null
  messages: ChatMessage[]
  signal?: AbortSignal
  onEvent?: (event: AiEvent) => void
  /** Skip the cooldown list — used by "Test connection". */
  ignoreCooldown?: boolean
  temperature?: number
  maxTokens?: number
  fetchImpl?: typeof fetch
}

type CompletionBody = {
  choices?: Array<{ message?: { content?: string | null }; text?: string }>
  usage?: { prompt_tokens?: number; completion_tokens?: number }
  error?: { message?: string; code?: string | number }
  message?: string
}

function classify(status: number, detail: string): { message: string; retryable: boolean; providerWide: boolean } {
  const trimmed = detail.trim().slice(0, 220)
  if (status === 401 || status === 403) {
    return { message: `Key rejected (${status}). ${trimmed}`, retryable: true, providerWide: true }
  }
  if (status === 402) {
    return { message: `Out of credit on this provider (402). ${trimmed}`, retryable: true, providerWide: true }
  }
  if (status === 404) return { message: `Model not available (404). ${trimmed}`, retryable: true, providerWide: false }
  if (status === 429) return { message: `Rate limited (429). ${trimmed}`, retryable: true, providerWide: false }
  if (status === 400 || status === 422) return { message: `Request refused (${status}). ${trimmed}`, retryable: false, providerWide: false }
  if (status >= 500) return { message: `Provider error (${status}). ${trimmed}`, retryable: true, providerWide: false }
  return { message: `HTTP ${status}. ${trimmed}`, retryable: true, providerWide: false }
}

async function callOne(
  target: ModelTarget,
  options: CallOptions,
  apiKey: string,
): Promise<ChatResult> {
  const { config } = options
  const base = baseUrlOf(target.provider, config.customBaseUrl)
  if (!base) {
    throw new AiError('No base URL for this provider', {
      provider: target.provider,
      model: target.model,
      retryable: true,
    })
  }
  const url = `${base.replace(/\/+$/, '')}/chat/completions`
  const doFetch = options.fetchImpl ?? fetch

  const controller = new AbortController()
  const external = options.signal
  const onAbort = () => controller.abort()
  // `stop` can arrive before the request starts; a listener added to an
  // already-aborted signal never fires, so check first.
  if (external?.aborted) {
    throw new AiError('Stopped', { provider: target.provider, model: target.model, retryable: false })
  }
  external?.addEventListener('abort', onAbort)
  const budgetMs = providerOf(target.provider).timeoutMs ?? 120_000
  const timeout = setTimeout(() => controller.abort(), budgetMs)
  const started = Date.now()

  try {
    const response = await doFetch(url, {
      method: 'POST',
      headers: authHeaders(target.provider, apiKey),
      signal: controller.signal,
      body: JSON.stringify({
        model: target.model,
        messages: options.messages,
        temperature: options.temperature ?? config.temperature,
        max_tokens: options.maxTokens ?? config.maxTokens,
        stream: false,
      }),
    })

    if (!response.ok) {
      const detail = await response.text().catch(() => '')
      let parsed = ''
      try {
        const json = JSON.parse(detail) as CompletionBody
        parsed = json.error?.message ?? json.message ?? ''
      } catch {
        parsed = detail
      }
      const info = classify(response.status, parsed || detail)
      const error = new AiError(info.message, {
        status: response.status,
        provider: target.provider,
        model: target.model,
        retryable: info.retryable,
      })
      if (info.providerWide) providerCooldown.set(target.provider, Date.now() + PROVIDER_COOLDOWN_MS)
      if (response.status === 404) modelCooldown.set(`${target.provider}:${target.model}`, Date.now() + MODEL_COOLDOWN_MS)
      throw error
    }

    const body = (await response.json()) as CompletionBody
    const text = body.choices?.[0]?.message?.content ?? body.choices?.[0]?.text ?? ''
    if (!text.trim()) {
      throw new AiError('The model returned an empty answer', {
        provider: target.provider,
        model: target.model,
        retryable: true,
      })
    }
    return {
      text,
      target,
      ms: Date.now() - started,
      usage: {
        prompt: body.usage?.prompt_tokens,
        completion: body.usage?.completion_tokens,
      },
    }
  } catch (error) {
    if (error instanceof AiError) throw error
    const aborted = (error as Error)?.name === 'AbortError'
    if (aborted && external?.aborted) {
      // The user pressed stop: not a provider failure, do not fall back.
      throw new AiError('Stopped', {
        provider: target.provider,
        model: target.model,
        retryable: false,
      })
    }
    throw new AiError(
      aborted ? `Timed out after ${Math.round(budgetMs / 1000)}s` : `Network error: ${(error as Error)?.message ?? 'unknown'}`,
      { provider: target.provider, model: target.model, retryable: true },
    )
  } finally {
    clearTimeout(timeout)
    external?.removeEventListener('abort', onAbort)
  }
}

/**
 * Run one completion, walking the candidate list until something answers.
 *
 * Throws the *last* error when every candidate fails, and an explanation when
 * there were none to begin with.
 */
export async function callAi(options: CallOptions): Promise<ChatResult> {
  const keys = options.keys ?? (getKeys() as Record<string, string | undefined>)
  const { targets, reason } = selectTargets(options.config, keys, options.role ?? null)

  const usable = targets.filter(
    (target) => options.ignoreCooldown || !isCoolingDown(target.provider, target.model),
  )

  if (usable.length === 0) {
    const message =
      targets.length === 0
        ? reason
        : 'Every provider that just failed is cooling down. Fix the key in AI settings, or try again in a minute.'
    options.onEvent?.({ kind: 'no-candidates', message })
    throw new AiError(message, {
      provider: options.config.provider,
      model: options.config.model,
      retryable: false,
    })
  }

  let lastError: AiError | null = null
  let attempt = 0

  for (const target of usable) {
    // A provider that just rejected its key is out for this run: do not spend
    // one request per model on it before moving on.
    if (!options.ignoreCooldown && isCoolingDown(target.provider, target.model)) continue
    attempt += 1
    options.onEvent?.({ kind: 'try', target, attempt, total: usable.length })
    try {
      const result = await callOne(target, options, keys[target.provider] ?? '')
      options.onEvent?.({ kind: 'ok', target, ms: result.ms })
      return result
    } catch (error) {
      const failure =
        error instanceof AiError
          ? error
          : new AiError(String(error), { provider: target.provider, model: target.model })
      lastError = failure
      const canContinue = options.config.fallback && failure.retryable && attempt < usable.length
      options.onEvent?.({
        kind: 'fail',
        target,
        message: failure.message,
        status: failure.status,
        willRetry: canContinue,
      })
      if (!canContinue) break
    }
  }

  throw (
    lastError ??
    new AiError('No model answered', {
      provider: options.config.provider,
      model: options.config.model,
      retryable: false,
    })
  )
}

/* ------------------------------------------------------------------ */
/* discovery + a health check                                          */
/* ------------------------------------------------------------------ */

const NOT_CHAT = /embed|embedding|whisper|tts|speech|audio|rerank|moderation|guard|image|vision-only|dall|stable-diffusion|sdxl/i

export type DiscoveryResult = { models: string[]; error: string | null }

/** Ask a provider what it actually serves. Cheap, and it is the only list that stays true. */
export async function discoverModels(
  provider: ProviderId,
  apiKey: string,
  customBaseUrl: string,
  options: { signal?: AbortSignal; fetchImpl?: typeof fetch } = {},
): Promise<DiscoveryResult> {
  const base = baseUrlOf(provider, customBaseUrl)
  if (!base) return { models: [], error: 'No base URL' }
  const doFetch = options.fetchImpl ?? fetch
  try {
    const response = await doFetch(`${base.replace(/\/+$/, '')}/models`, {
      headers: authHeaders(provider, apiKey),
      signal: options.signal,
    })
    if (!response.ok) return { models: [], error: `Model list unavailable (${response.status})` }
    const body = (await response.json()) as {
      data?: Array<{ id?: string; name?: string }>
      models?: Array<{ id?: string; name?: string }>
    }
    const ids = (body.data ?? body.models ?? [])
      .map((entry) => entry.id ?? entry.name ?? '')
      .filter((id) => id && !NOT_CHAT.test(id))
    return { models: [...new Set(ids)].sort(), error: null }
  } catch (error) {
    return { models: [], error: (error as Error)?.message ?? 'Could not reach the provider' }
  }
}

export type ProbeResult = {
  ok: boolean
  model: string
  reply: string
  models: string[]
  error: string | null
  ms: number
}

/**
 * "Test" in the settings sheet: list the models, then ask the first one a
 * one-word question. A key that lists models but cannot answer is not a working
 * key, and this is the fastest way to find that out.
 */
export async function probeProvider(
  config: AiConfig,
  provider: ProviderId,
  apiKey: string,
  options: { model?: string; fetchImpl?: typeof fetch } = {},
): Promise<ProbeResult> {
  const started = Date.now()
  const discovery = await discoverModels(provider, apiKey, config.customBaseUrl, { fetchImpl: options.fetchImpl })
  const model = options.model || config.customModel || hintsFor(provider)[0]?.id || discovery.models[0] || ''
  if (!model) {
    return {
      ok: false,
      model: '',
      reply: '',
      models: discovery.models,
      error: discovery.error ?? 'No model id to try — type one below.',
      ms: Date.now() - started,
    }
  }
  try {
    const result = await callOne(
      targetOf(provider, model),
      {
        config,
        messages: [
          { role: 'system', content: 'Reply with exactly: ok' },
          { role: 'user', content: 'ping' },
        ],
        maxTokens: 8,
        temperature: 0,
        fetchImpl: options.fetchImpl,
      },
      apiKey,
    )
    return {
      ok: true,
      model,
      reply: result.text.trim().slice(0, 60),
      models: discovery.models,
      error: null,
      ms: result.ms,
    }
  } catch (error) {
    return {
      ok: false,
      model,
      reply: '',
      models: discovery.models,
      error: (error as Error).message,
      ms: Date.now() - started,
    }
  }
}
