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
    models: [
      { id: 'anthropic/claude-sonnet-5', tier: 'code', label: 'Claude Sonnet 5' },
      { id: 'openai/gpt-6-sol', tier: 'reasoning', label: 'GPT-6 Sol' },
      { id: 'google/gemini-3-pro', tier: 'reasoning', label: 'Gemini 3 Pro' },
      { id: 'deepseek/deepseek-v4-flash', tier: 'fast', label: 'DeepSeek V4 Flash' },
      { id: 'qwen/qwen3-coder', tier: 'code', label: 'Qwen3 Coder' },
      { id: 'z-ai/glm-5', tier: 'code', label: 'GLM-5' },
      { id: 'meta-llama/llama-3.3-70b-instruct:free', tier: 'fast', label: 'Llama 3.3 70B (free)' },
    ],
  },
  {
    id: 'xkiro',
    label: 'X-Kiro',
    blurb: 'xAI’s Grok endpoint (OpenAI-compatible). Long context, blunt answers.',
    baseUrl: 'https://api.x.ai/v1',
    keysUrl: 'https://console.x.ai/',
    models: [
      { id: 'grok-4.7', tier: 'reasoning', label: 'Grok 4.7' },
      { id: 'grok-4', tier: 'code', label: 'Grok 4' },
      { id: 'grok-3-mini', tier: 'fast', label: 'Grok 3 mini' },
    ],
  },
  {
    id: 'groq',
    label: 'Groq',
    blurb: 'Fastest tokens per second. Great for the coder and tester loops.',
    baseUrl: 'https://api.groq.com/openai/v1',
    keysUrl: 'https://console.groq.com/keys',
    models: [
      { id: 'openai/gpt-oss-120b', tier: 'reasoning', label: 'GPT-OSS 120B' },
      { id: 'qwen/qwen3-32b', tier: 'code', label: 'Qwen3 32B' },
      { id: 'llama-3.3-70b-versatile', tier: 'fast', label: 'Llama 3.3 70B' },
    ],
  },
  {
    id: 'mistral',
    label: 'Mistral',
    blurb: 'Codestral is tuned for exactly this: filling in and fixing code.',
    baseUrl: 'https://api.mistral.ai/v1',
    keysUrl: 'https://console.mistral.ai/api-keys',
    models: [
      { id: 'mistral-large-latest', tier: 'reasoning', label: 'Mistral Large' },
      { id: 'codestral-latest', tier: 'code', label: 'Codestral' },
      { id: 'mistral-small-latest', tier: 'fast', label: 'Mistral Small' },
    ],
  },
  {
    id: 'deepseek',
    label: 'DeepSeek',
    blurb: 'Cheap, strong at code, good tool discipline.',
    baseUrl: 'https://api.deepseek.com/v1',
    keysUrl: 'https://platform.deepseek.com/api_keys',
    models: [
      { id: 'deepseek-v4-pro', tier: 'reasoning', label: 'DeepSeek V4 Pro' },
      { id: 'deepseek-v4-flash', tier: 'fast', label: 'DeepSeek V4 Flash' },
    ],
  },
  {
    id: 'cerebras',
    label: 'Cerebras',
    blurb: 'Wafer-scale inference — the quickest way to iterate a build loop.',
    baseUrl: 'https://api.cerebras.ai/v1',
    keysUrl: 'https://cloud.cerebras.ai/',
    models: [
      { id: 'qwen-3-coder-480b', tier: 'code', label: 'Qwen3 Coder 480B' },
      { id: 'llama-3.3-70b', tier: 'fast', label: 'Llama 3.3 70B' },
    ],
  },
  {
    id: 'together',
    label: 'Together',
    blurb: 'Open weights, hosted. Kimi and Qwen coder variants live here.',
    baseUrl: 'https://api.together.xyz/v1',
    keysUrl: 'https://api.together.ai/settings/api-keys',
    models: [
      { id: 'moonshotai/Kimi-K2-Instruct', tier: 'code', label: 'Kimi K2' },
      { id: 'Qwen/Qwen3-Coder-480B-A35B-Instruct', tier: 'code', label: 'Qwen3 Coder' },
      { id: 'meta-llama/Llama-3.3-70B-Instruct-Turbo', tier: 'fast', label: 'Llama 3.3 70B Turbo' },
    ],
  },
  {
    id: 'openai',
    label: 'OpenAI',
    blurb: 'The original endpoint. Bring your own key.',
    baseUrl: 'https://api.openai.com/v1',
    keysUrl: 'https://platform.openai.com/api-keys',
    models: [
      { id: 'gpt-6', tier: 'reasoning', label: 'GPT-6' },
      { id: 'gpt-6-mini', tier: 'fast', label: 'GPT-6 mini' },
      { id: 'gpt-5.4-codex', tier: 'code', label: 'GPT-5.4 Codex' },
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
      { id: 'claude-opus-5', tier: 'reasoning', label: 'Claude Opus 5' },
      { id: 'claude-sonnet-5', tier: 'code', label: 'Claude Sonnet 5' },
      { id: 'claude-haiku-5', tier: 'fast', label: 'Claude Haiku 5' },
    ],
  },
  {
    id: 'google',
    label: 'Google Gemini',
    blurb: 'Gemini, via the OpenAI-compatible surface. Huge free tier.',
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai',
    keysUrl: 'https://aistudio.google.com/apikey',
    models: [
      { id: 'gemini-3-pro', tier: 'reasoning', label: 'Gemini 3 Pro' },
      { id: 'gemini-3-flash', tier: 'fast', label: 'Gemini 3 Flash' },
    ],
  },
  {
    id: 'custom',
    label: 'Custom',
    blurb: 'Any OpenAI-compatible endpoint — LM Studio, Ollama, vLLM, a proxy.',
    baseUrl: '',
    keysUrl: '',
    custom: true,
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
