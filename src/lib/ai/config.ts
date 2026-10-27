/**
 * AI configuration — what to call, in which order, for which agent.
 *
 * Kept out of `Settings` on purpose: this is a big object with its own shape
 * and its own defaults, and the editor settings sheet should not have to grow a
 * second personality. It is still device-local, still exported with nothing.
 */
import type { ProviderId } from './providers'
import { PROVIDERS } from './providers'

export type AiRole = 'planner' | 'coderA' | 'coderB' | 'tester'

export type RoleChoice = {
  provider: ProviderId | ''
  /** Empty means "let automatic selection pick for this role". */
  model: string
}

export type AiConfig = {
  /** Master switch for the whole section. */
  enabled: boolean
  /** Pick models per role automatically, from the providers that have keys. */
  auto: boolean
  /** Preferred provider for chat and as the head of the fallback chain. */
  provider: ProviderId
  /** Preferred model; empty means automatic. */
  model: string
  /** On a failure, try the next model/provider instead of giving up. */
  fallback: boolean
  /** Per-agent pinning. Ignored while `auto` is on and no model is named. */
  roles: Record<AiRole, RoleChoice>
  /** Custom OpenAI-compatible endpoint (provider `custom`). */
  customBaseUrl: string
  customModel: string
  temperature: number
  maxTokens: number
  /** Let the agents write to the project without asking, or confirm first. */
  writes: 'auto' | 'confirm'
  /** How many agent turns a crew run may take before it stops. */
  maxTurns: number
}

export const ROLES: Array<{ id: AiRole; label: string; short: string; job: string; tier: 'reasoning' | 'code' | 'fast' }> = [
  {
    id: 'planner',
    label: 'Planner',
    short: 'P',
    job: 'Reads the request, decides the files, hands out the work',
    tier: 'reasoning',
  },
  {
    id: 'coderA',
    label: 'Coder A',
    short: 'A',
    job: 'Writes the files, scaffolds the project',
    tier: 'code',
  },
  {
    id: 'coderB',
    label: 'Coder B',
    short: 'B',
    job: 'Reviews Coder A, fixes and finishes what is left',
    tier: 'code',
  },
  {
    id: 'tester',
    label: 'Tester',
    short: 'T',
    job: 'Runs the preview, reads the problems, sends it back until it passes',
    tier: 'fast',
  },
]

export const AI_DEFAULTS: AiConfig = {
  enabled: true,
  auto: true,
  provider: 'openrouter',
  model: '',
  fallback: true,
  roles: {
    planner: { provider: '', model: '' },
    coderA: { provider: '', model: '' },
    coderB: { provider: '', model: '' },
    tester: { provider: '', model: '' },
  },
  customBaseUrl: '',
  customModel: '',
  temperature: 0.3,
  maxTokens: 4096,
  writes: 'auto',
  maxTurns: 8,
}

/** Merge stored config over defaults, ignoring anything malformed. */
export function normalizeConfig(raw: unknown): AiConfig {
  if (!raw || typeof raw !== 'object') return { ...AI_DEFAULTS, roles: { ...AI_DEFAULTS.roles } }
  const value = raw as Partial<AiConfig>
  const known = new Set(PROVIDERS.map((provider) => provider.id))
  const provider = known.has(value.provider as ProviderId) ? (value.provider as ProviderId) : AI_DEFAULTS.provider
  const roles = { ...AI_DEFAULTS.roles }
  for (const id of Object.keys(roles) as AiRole[]) {
    const entry = value.roles?.[id]
    if (!entry || typeof entry !== 'object') continue
    roles[id] = {
      provider: known.has(entry.provider as ProviderId) ? (entry.provider as ProviderId) : '',
      model: typeof entry.model === 'string' ? entry.model : '',
    }
  }
  const num = (input: unknown, fallbackValue: number, min: number, max: number) =>
    typeof input === 'number' && Number.isFinite(input) ? Math.min(max, Math.max(min, input)) : fallbackValue
  return {
    enabled: typeof value.enabled === 'boolean' ? value.enabled : AI_DEFAULTS.enabled,
    auto: typeof value.auto === 'boolean' ? value.auto : AI_DEFAULTS.auto,
    provider,
    model: typeof value.model === 'string' ? value.model : '',
    fallback: typeof value.fallback === 'boolean' ? value.fallback : AI_DEFAULTS.fallback,
    roles,
    customBaseUrl: typeof value.customBaseUrl === 'string' ? value.customBaseUrl : '',
    customModel: typeof value.customModel === 'string' ? value.customModel : '',
    temperature: num(value.temperature, AI_DEFAULTS.temperature, 0, 1.5),
    maxTokens: num(value.maxTokens, AI_DEFAULTS.maxTokens, 256, 32000),
    writes: value.writes === 'confirm' ? 'confirm' : 'auto',
    maxTurns: num(value.maxTurns, AI_DEFAULTS.maxTurns, 2, 24),
  }
}
