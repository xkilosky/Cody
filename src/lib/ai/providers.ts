/**
 * AI providers, BYOK.
 *
 * Every provider here speaks the OpenAI chat-completions shape — that is the
 * one thing they all converged on, so one small client can drive all of them
 * instead of a dozen SDKs. The table carries only what differs: the base URL,
 * the header quirks, and a short list of model ids worth trying first.
 *
 * Model lists are *hints*, not a whitelist: whatever provider is configured is
 * asked for its live `/models` list, and the user can type any id they like. A
 * hard-coded table of models would be wrong within a month.
 */

export type ProviderId =
  | 'openrouter'
  | 'xkiro'
  | 'xai'
  | 'groq'
  | 'mistral'
  | 'deepseek'
  | 'cerebras'
  | 'together'
  | 'openai'
  | 'anthropic'
  | 'google'
  | 'custom'

export type ModelTier = 'reasoning' | 'code' | 'fast'

export type ModelHint = {
  id: string
  tier: ModelTier
  /** Shown in the picker; the API id stays the source of truth. */
  label?: string
  /**
   * Can this be used without paying? `free` means a free model (an OpenRouter
   * `:free` id) or a model covered by the provider's free plan. Anything else
   * is treated as paid — Cody never spends money by accident.
   */
  cost?: 'free' | 'paid'
}

export type Provider = {
  id: ProviderId
  label: string
  /** One line in the settings card. */
  blurb: string
  /** Base URL without `/chat/completions`. */
  baseUrl: string
  /** Where the user gets a key. */
  keysUrl: string
  /** Requested through the provider's site (OpenRouter attribution). */
  referer?: string
  /** Extra headers on every call. */
  headers?: Record<string, string>
  /** Curated starting points, best-first per tier. */
  models: ModelHint[]
  /** Providers that only make sense once a base URL is supplied. */
  custom?: boolean
  /** Per-request budget. Some gateways cut a blocking call before our own limit. */
  timeoutMs?: number
  /** There is a free way to use this provider (free models, free plan, local). */
  freeTier?: boolean
  /** One line in the settings card about the free path. */
  freeNote?: string
  /**
   * Same-origin prefix that forwards to this provider.
   *
   * A browser will not read a cross-origin response that has no
   * `Access-Control-Allow-Origin`, and several gateways send none — the call
   * dies as "Failed to fetch" before the key is even looked at. For those the
   * request goes to our own origin instead, where `api/<id>.ts` forwards it
   * once (and stores nothing).
   */
  proxy?: string
  /** The header the function may forward to. */
  proxyHost?: string
  /**
   * For ids we have never seen (typically from `/models` discovery): an id that
   * matches is covered by this provider's free tier. Keep it non-global — a
   * `g` flag makes `test` stateful.
   */
  freePattern?: RegExp
}

export const PROVIDERS: Provider[] = [
  {
    id: 'openrouter',
    label: 'OpenRouter',
    blurb: 'One key, hundreds of models from every lab. Free models included.',
    baseUrl: 'https://openrouter.ai/api/v1',
    keysUrl: 'https://openrouter.ai/keys',
    referer: 'https://cody-flux-cf70.vercel.app',
    headers: { 'X-Title': 'Cody' },
    freeTier: true,
    freeNote: 'Every model with a `:free` suffix costs nothing. Cody prefers those.',
    models: [
      { id: 'meta-llama/llama-3.3-70b-instruct:free', tier: 'code', label: 'Llama 3.3 70B (free)', cost: 'free' },
      { id: 'deepseek/deepseek-r1:free', tier: 'reasoning', label: 'DeepSeek R1 (free)', cost: 'free' },
      { id: 'qwen/qwen-2.5-coder-32b-instruct:free', tier: 'fast', label: 'Qwen2.5 Coder 32B (free)', cost: 'free' },
      { id: 'anthropic/claude-sonnet-5', tier: 'code', label: 'Claude Sonnet 5', cost: 'paid' },
      { id: 'openai/gpt-6-sol', tier: 'reasoning', label: 'GPT-6 Sol', cost: 'paid' },
      { id: 'google/gemini-3-pro', tier: 'reasoning', label: 'Gemini 3 Pro', cost: 'paid' },
      { id: 'deepseek/deepseek-v4-flash', tier: 'fast', label: 'DeepSeek V4 Flash', cost: 'paid' },
      { id: 'qwen/qwen3-coder', tier: 'code', label: 'Qwen3 Coder', cost: 'paid' },
      { id: 'z-ai/glm-5', tier: 'code', label: 'GLM-5', cost: 'paid' },
    ],
  },
  {
    id: 'xkiro',
    label: 'xKiro',
    blurb: 'xkiro.com — one key for 97 models from 13 labs, on very cheap plans.',
    baseUrl: 'https://api.xkiro.com/v1',
    keysUrl: 'https://xkiro.com/dashboard/api/keys',
    // xKiro sends no CORS headers, so the browser cannot call it directly.
    proxy: '/api/xkiro',
    proxyHost: 'api.xkiro.com',
    // xKiro closes a blocking request at 95 s; stop just before it does.
    timeoutMs: 90_000,
    freeTier: true,
    freeNote: '47 free models on every account (500K tokens/day). Cody reads the live catalog to find them.',
    models: [
      { id: 'anthropic/claude-opus-5.5', tier: 'code', label: 'Opus 5.5', cost: 'paid' },
      { id: 'openai/gpt-6.1-sol', tier: 'reasoning', label: 'GPT-6.1 Sol', cost: 'paid' },
      { id: 'x-ai/grok-4.7', tier: 'reasoning', label: 'Grok 4.7', cost: 'paid' },
      { id: 'moonshotai/kimi-k3-agent', tier: 'code', label: 'Kimi K3 Agent', cost: 'paid' },
      { id: 'google/gemini-3.8-flash', tier: 'fast', label: 'Gemini 3.8 Flash', cost: 'paid' },
      { id: 'minimax/minimax-m3.1-flash', tier: 'fast', label: 'MiniMax M3.1 Flash', cost: 'paid' },
    ],
  },
  {
    id: 'xai',
    label: 'xAI',
    blurb: 'Grok straight from xAI. Long context, blunt answers.',
    baseUrl: 'https://api.x.ai/v1',
    keysUrl: 'https://console.x.ai/',
    models: [
      { id: 'grok-4.7', tier: 'reasoning', label: 'Grok 4.7', cost: 'paid' },
      { id: 'grok-4', tier: 'code', label: 'Grok 4', cost: 'paid' },
      { id: 'grok-3-mini', tier: 'fast', label: 'Grok 3 mini', cost: 'paid' },
    ],
  },
  {
    id: 'groq',
    label: 'Groq',
    blurb: 'Fastest tokens per second. Great for the coder and tester loops.',
    baseUrl: 'https://api.groq.com/openai/v1',
    keysUrl: 'https://console.groq.com/keys',
    freeTier: true,
    freeNote: 'Free tier covers every model here, with rate limits. No card needed.',
    models: [
      { id: 'openai/gpt-oss-120b', tier: 'reasoning', label: 'GPT-OSS 120B', cost: 'free' },
      { id: 'qwen/qwen3-32b', tier: 'code', label: 'Qwen3 32B', cost: 'free' },
      { id: 'llama-3.3-70b-versatile', tier: 'fast', label: 'Llama 3.3 70B', cost: 'free' },
    ],
  },
  {
    id: 'mistral',
    label: 'Mistral',
    blurb: 'Codestral is tuned for exactly this: filling in and fixing code.',
    baseUrl: 'https://api.mistral.ai/v1',
    keysUrl: 'https://console.mistral.ai/api-keys',
    freeTier: true,
    freeNote: 'The free “experiment” plan covers Mistral Small.',
    models: [
      { id: 'mistral-small-latest', tier: 'code', label: 'Mistral Small', cost: 'free' },
      { id: 'mistral-large-latest', tier: 'reasoning', label: 'Mistral Large', cost: 'paid' },
      { id: 'codestral-latest', tier: 'code', label: 'Codestral', cost: 'paid' },
    ],
  },
  {
    id: 'deepseek',
    label: 'DeepSeek',
    blurb: 'Cheap, strong at code, good tool discipline.',
    baseUrl: 'https://api.deepseek.com/v1',
    keysUrl: 'https://platform.deepseek.com/api_keys',
    models: [
      { id: 'deepseek-v4-pro', tier: 'reasoning', label: 'DeepSeek V4 Pro', cost: 'paid' },
      { id: 'deepseek-v4-flash', tier: 'fast', label: 'DeepSeek V4 Flash', cost: 'paid' },
    ],
  },
  {
    id: 'cerebras',
    label: 'Cerebras',
    blurb: 'Wafer-scale inference — the quickest way to iterate a build loop.',
    baseUrl: 'https://api.cerebras.ai/v1',
    keysUrl: 'https://cloud.cerebras.ai/',
    freeTier: true,
    freeNote: 'Free tier: a daily token allowance on the models below.',
    models: [
      { id: 'qwen-3-coder-480b', tier: 'code', label: 'Qwen3 Coder 480B', cost: 'free' },
      { id: 'llama-3.3-70b', tier: 'fast', label: 'Llama 3.3 70B', cost: 'free' },
    ],
  },
  {
    id: 'together',
    label: 'Together',
    blurb: 'Open weights, hosted. Kimi and Qwen coder variants live here.',
    baseUrl: 'https://api.together.xyz/v1',
    keysUrl: 'https://api.together.ai/settings/api-keys',
    models: [
      { id: 'moonshotai/Kimi-K2-Instruct', tier: 'code', label: 'Kimi K2', cost: 'paid' },
      { id: 'Qwen/Qwen3-Coder-480B-A35B-Instruct', tier: 'code', label: 'Qwen3 Coder', cost: 'paid' },
      { id: 'meta-llama/Llama-3.3-70B-Instruct-Turbo', tier: 'fast', label: 'Llama 3.3 70B Turbo', cost: 'paid' },
    ],
  },
  {
    id: 'openai',
    label: 'OpenAI',
    blurb: 'The original endpoint. Bring your own key.',
    baseUrl: 'https://api.openai.com/v1',
    keysUrl: 'https://platform.openai.com/api-keys',
    models: [
      { id: 'gpt-6', tier: 'reasoning', label: 'GPT-6', cost: 'paid' },
      { id: 'gpt-6-mini', tier: 'fast', label: 'GPT-6 mini', cost: 'paid' },
      { id: 'gpt-5.4-codex', tier: 'code', label: 'GPT-5.4 Codex', cost: 'paid' },
    ],
  },
  {
    id: 'anthropic',
    label: 'Anthropic',
    blurb: 'Claude, through its OpenAI-compatible endpoint.',
    baseUrl: 'https://api.anthropic.com/v1',
    keysUrl: 'https://console.anthropic.com/settings/keys',
    headers: { 'anthropic-dangerous-direct-browser-access': 'true' },
    models: [
      { id: 'claude-opus-5', tier: 'reasoning', label: 'Claude Opus 5', cost: 'paid' },
      { id: 'claude-sonnet-5', tier: 'code', label: 'Claude Sonnet 5', cost: 'paid' },
      { id: 'claude-haiku-5', tier: 'fast', label: 'Claude Haiku 5', cost: 'paid' },
    ],
  },
  {
    id: 'google',
    label: 'Google Gemini',
    blurb: 'Gemini, via the OpenAI-compatible surface. Huge free tier.',
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai',
    keysUrl: 'https://aistudio.google.com/apikey',
    freeTier: true,
    freeNote: 'An AI Studio key is free, and Flash runs on the free tier.',
    // Anything Flash-shaped is covered by the free tier; Pro is not.
    freePattern: /flash/i,
    models: [
      { id: 'gemini-3.8-flash', tier: 'reasoning', label: 'Gemini 3.8 Flash', cost: 'free' },
      { id: 'gemini-3.5-flash', tier: 'code', label: 'Gemini 3.5 Flash', cost: 'free' },
      { id: 'gemini-3.5-flash-lite', tier: 'fast', label: 'Gemini 3.5 Flash-Lite', cost: 'free' },
      { id: 'gemini-3.1-pro-preview', tier: 'reasoning', label: 'Gemini 3.1 Pro (preview)', cost: 'paid' },
    ],
  },
  {
    id: 'custom',
    label: 'Custom',
    blurb: 'Any OpenAI-compatible endpoint — LM Studio, Ollama, vLLM, a proxy.',
    baseUrl: '',
    keysUrl: '',
    custom: true,
    freeTier: true,
    freeNote: 'A model running on your own machine costs nothing.',
    models: [],
  },
]

export const PROVIDER_BY_ID = new Map(PROVIDERS.map((provider) => [provider.id, provider]))

export function providerOf(id: ProviderId): Provider {
  return PROVIDER_BY_ID.get(id) ?? PROVIDERS[0]
}

/** Base URL actually used: the custom provider reads its own field. */
export function baseUrlOf(id: ProviderId, customBaseUrl: string): string {
  if (id === 'custom') return customBaseUrl.trim().replace(/\/+$/, '')
  return providerOf(id).baseUrl
}

/** True when this provider can be called at all with the given configuration. */
export function isConfigured(id: ProviderId, apiKey: string | undefined, customBaseUrl: string): boolean {
  const provider = PROVIDER_BY_ID.get(id)
  if (!provider) return false
  if (provider.custom) return Boolean(customBaseUrl.trim())
  return Boolean(apiKey && apiKey.trim())
}

/**
 * Anthropic's OpenAI-compatible surface authenticates with `x-api-key`; every
 * other provider here takes a bearer token. Getting this wrong is a 401 that
 * looks like "your key is bad", so it lives in one place.
 */
export function authHeaders(id: ProviderId, apiKey: string): Record<string, string> {
  const provider = providerOf(id)
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(provider.headers ?? {}),
  }
  if (id === 'anthropic') headers['x-api-key'] = apiKey
  else headers.Authorization = `Bearer ${apiKey}`
  if (provider.referer) {
    headers['HTTP-Referer'] = provider.referer
    headers['X-Title'] = 'Cody'
  }
  return headers
}

/**
 * Free ids learned from a provider's own `/models` catalog.
 *
 * The table below cannot keep up with a gateway that runs 47 free models across
 * 13 vendors behind `vendor/model` ids — xKiro marks each entry with
 * `access_tier: free`, and that is a better answer than any list we could
 * write. Registration is per provider and replaced wholesale on each listing.
 */
const freeCatalog = new Map<ProviderId, Set<string>>()

export function registerFreeModels(id: ProviderId, models: string[]) {
  freeCatalog.set(id, new Set(models))
}

/** Free ids the catalog reported, best-first as the caller registered them. */
export function registeredFreeModels(id: ProviderId): string[] {
  return [...(freeCatalog.get(id) ?? [])]
}

/**
 * Does this model cost money?
 *
 * Three ways to be free, in order of certainty: the hint says so, the id wears
 * OpenRouter's `:free` suffix, or it is a model on your own machine. Everything
 * else is paid — a wrong guess here is a bill, so the default is "paid".
 */
export function isFreeModel(id: ProviderId, model: string): boolean {
  const hint = providerOf(id).models.find((entry) => entry.id === model)
  if (hint?.cost === 'free') return true
  if (hint?.cost === 'paid') return false
  if (/:free$/i.test(model)) return true
  // An id discovered from /models that the provider's free tier covers, e.g.
  // any Gemini Flash. Without this, a stale hint would leave a free-only setup
  // with nothing it is allowed to call.
  if (providerOf(id).freePattern?.test(model)) return true
  // The provider's own catalog said so.
  if (freeCatalog.get(id)?.has(model)) return true
  return id === 'custom'
}

/** The free hints for a job, best tier first. */
export function freeHintsFor(id: ProviderId, tier: ModelTier | 'any' = 'any'): ModelHint[] {
  return hintsFor(id, tier).filter((hint) => isFreeModel(id, hint.id))
}

/** Providers with a free way in — used to order the candidate list. */
export function freeProviders(): Provider[] {
  return PROVIDERS.filter((provider) => provider.freeTier)
}

/** Order hints for a job: the tier that suits the work comes first. */
export function hintsFor(id: ProviderId, tier: ModelTier | 'any' = 'any'): ModelHint[] {
  const models = providerOf(id).models
  if (tier === 'any') return models
  const rank: Record<ModelTier, number> = { reasoning: 0, code: 1, fast: 2 }
  return [...models].sort((a, b) => {
    const score = (hint: ModelHint) => (hint.tier === tier ? -1 : rank[hint.tier])
    return score(a) - score(b)
  })
}
