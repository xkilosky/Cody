/**
 * Build AI.
 *
 * Three things are being tested here, and none of them need a network:
 *
 *  1. **Selection and failover** — a dead key, a retired model and a rate limit
 *     each take a different path, and the run has to keep going.
 *  2. **The toolbox** — every tool the agents can call, including the patch
 *     semantics that decide whether an edit is applied or refused.
 *  3. **The crew** — planner → coder → reviewer → tester over a scripted set of
 *     model answers, asserting the files that end up in the workspace.
 *
 * A fake `fetch` stands in for every provider, so the exact request bodies
 * (auth header, model, messages) are checked too.
 */
import { AI_DEFAULTS, normalizeConfig, ROLES, type AiConfig } from '../src/lib/ai/config'
import {
  PROVIDERS,
  authHeaders,
  baseUrlOf,
  freeHintsFor,
  freeProviders,
  hintsFor,
  isConfigured,
  isFreeModel,
  providerOf,
} from '../src/lib/ai/providers'
import { callAi, discoverModels, isCoolingDown, probeProvider, resetCooldowns, selectTargets } from '../src/lib/ai/client'
import { maskKey } from '../src/lib/ai/keys'
import { cleanPath, executeTool, parseToolCalls, stripToolBlocks, TOOLS, WRITE_TOOLS, type ToolWorkspace } from '../src/lib/ai/tools'
import { runAgent, runChat, turnsToMessages } from '../src/lib/ai/crew'
import type { ProjectFile } from '../src/types'

let failed = 0
function check(name: string, ok: boolean, detail = '') {
  if (ok) console.log(`  ok   ${name}`)
  else {
    failed += 1
    console.log(`  FAIL ${name}${detail ? ` — ${detail}` : ''}`)
  }
}

const config = (patch: Partial<AiConfig> = {}): AiConfig => {
  const base = { ...AI_DEFAULTS, roles: { ...AI_DEFAULTS.roles } }
  return normalizeConfig({ ...base, ...patch })
}

/* ------------------------------------------------------------------ */
/* a fake provider                                                     */
/* ------------------------------------------------------------------ */

type Answer = { status?: number; text?: string; message?: string; models?: string[] }
type Handler = (request: { url: string; headers: Record<string, string>; body: Record<string, unknown> }) => Answer

function mockFetch(handler: Handler) {
  const calls: Array<{ url: string; headers: Record<string, string>; body: Record<string, unknown> }> = []
  const impl = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input)
    if (init?.signal?.aborted) {
      const abort = new Error('Aborted')
      abort.name = 'AbortError'
      throw abort
    }
    const headers = (init?.headers ?? {}) as Record<string, string>
    const body = init?.body ? (JSON.parse(String(init.body)) as Record<string, unknown>) : {}
    const request = { url, headers, body }
    calls.push(request)
    const answer = handler(request)
    if (url.endsWith('/models')) {
      return new Response(JSON.stringify({ data: (answer.models ?? []).map((id) => ({ id })) }), {
        status: answer.status ?? 200,
        headers: { 'content-type': 'application/json' },
      })
    }
    if ((answer.status ?? 200) >= 400) {
      return new Response(JSON.stringify({ error: { message: answer.message ?? 'nope' } }), {
        status: answer.status ?? 500,
        headers: { 'content-type': 'application/json' },
      })
    }
    return new Response(
      JSON.stringify({
        choices: [{ message: { content: answer.text ?? 'ok' } }],
        usage: { prompt_tokens: 10, completion_tokens: 5 },
      }),
      { status: 200, headers: { 'content-type': 'application/json' } },
    )
  }) as unknown as typeof fetch
  return { impl, calls }
}

function reply(text: string): Answer {
  return { text }
}

/* ------------------------------------------------------------------ */
/* providers                                                           */
/* ------------------------------------------------------------------ */

{
  const ids = PROVIDERS.map((provider) => provider.id)
  check('every provider id is unique', new Set(ids).size === ids.length)
  check('the providers asked for are all here', ['openrouter', 'xkiro', 'xai', 'groq', 'mistral', 'deepseek', 'custom'].every((id) => ids.includes(id as never)), ids.join(','))
  check('each provider has a label and a blurb', PROVIDERS.every((provider) => provider.label && provider.blurb))
  check(
    'base URLs are absolute and slash-free',
    PROVIDERS.filter((provider) => !provider.custom).every((provider) => /^https:\/\/[^/]+/.test(provider.baseUrl) && !provider.baseUrl.endsWith('/')),
    PROVIDERS.map((p) => p.baseUrl).join(' '),
  )
  check('OpenRouter keeps its /api/v1 path', providerOf('openrouter').baseUrl === 'https://openrouter.ai/api/v1')
  check('Groq keeps its /openai/v1 path', providerOf('groq').baseUrl === 'https://api.groq.com/openai/v1')
  check('the custom provider has no fixed URL', providerOf('custom').baseUrl === '')

  check('a bearer key is enough for OpenRouter', isConfigured('openrouter', 'sk-x', ''))
  check('a key-less provider is not configured', !isConfigured('openrouter', '', ''))
  check('custom is configured by its URL, not a key', isConfigured('custom', '', 'http://localhost:1234/v1'))
  check('custom without a URL is not configured', !isConfigured('custom', 'sk-x', '  '))

  const openrouter = authHeaders('openrouter', 'sk-or-123')
  check('OpenRouter sends a bearer token', openrouter.Authorization === 'Bearer sk-or-123')
  check('OpenRouter identifies the app', openrouter['HTTP-Referer'] !== undefined && openrouter['X-Title'] === 'Cody')
  const anthropic = authHeaders('anthropic', 'sk-ant-1')
  check('Anthropic uses x-api-key instead', anthropic['x-api-key'] === 'sk-ant-1' && anthropic.Authorization === undefined)
  check('every request is JSON', Object.values(authHeaders('groq', 'k')).every((value) => typeof value === 'string') && authHeaders('groq', 'k')['Content-Type'] === 'application/json')

  check('hints are ordered for reasoning work', hintsFor('openrouter', 'reasoning')[0].tier === 'reasoning', hintsFor('openrouter', 'reasoning')[0].id)
  check('hints are ordered for code work', hintsFor('openrouter', 'code')[0].tier === 'code')
  check('xKiro is xkiro.com, not xAI', baseUrlOf('xkiro', '') === 'https://api.xkiro.com/v1', baseUrlOf('xkiro', ''))
  check('xKiro sends the user to its own key page', providerOf('xkiro').keysUrl === 'https://xkiro.com/dashboard/api/keys')
  check('xAI is its own provider, separately', baseUrlOf('xai', '') === 'https://api.x.ai/v1' && providerOf('xai').label === 'xAI')
  check('the xKiro label is the site, not an xAI product', /xkiro/i.test(providerOf('xkiro').label), providerOf('xkiro').label)
  check('xKiro stops before its own 95 s cut-off', (providerOf('xkiro').timeoutMs ?? 0) > 0 && (providerOf('xkiro').timeoutMs ?? 0) < 95_000, String(providerOf('xkiro').timeoutMs))
  check('every other provider keeps the default budget', PROVIDERS.filter((provider) => provider.id !== 'xkiro').every((provider) => provider.timeoutMs === undefined))
  check(
    'xKiro model ids are vendor/model, as its API requires',
    hintsFor('xkiro').every((hint) => /^[a-z0-9-]+\/[a-z0-9.\-]+$/.test(hint.id)),
    hintsFor('xkiro').map((hint) => hint.id).join(' '),
  )
  check('xAI model ids stay bare', hintsFor('xai').every((hint) => !hint.id.includes('/')))
  check(
    'every provider links to an https key page',
    PROVIDERS.filter((provider) => !provider.custom).every((provider) => /^https:\/\//.test(provider.keysUrl)),
    PROVIDERS.map((provider) => provider.keysUrl).join(' '),
  )
  check(
    'no provider points at another provider’s host by accident',
    new Set(PROVIDERS.filter((provider) => !provider.custom).map((provider) => new URL(provider.baseUrl).host)).size ===
      PROVIDERS.filter((provider) => !provider.custom).length,
    PROVIDERS.filter((provider) => !provider.custom).map((provider) => new URL(provider.baseUrl).host).join(' '),
  )
  check('the custom URL wins when chosen', baseUrlOf('custom', 'http://box:8080/v1/') === 'http://box:8080/v1')
}

/* ------------------------------------------------------------------ */
/* config                                                              */
/* ------------------------------------------------------------------ */

{
  const defaults = normalizeConfig(null)
  check('a missing config becomes the defaults', defaults.provider === AI_DEFAULTS.provider && defaults.auto === true)
  check('every role exists', ROLES.every((role) => defaults.roles[role.id]))
  const repaired = normalizeConfig({
    provider: 'nope' as never,
    temperature: 99,
    maxTokens: 5,
    maxTurns: 500,
    roles: { planner: { provider: 'nope', model: 5 } },
    writes: 'whatever',
  })
  check('an unknown provider falls back', repaired.provider === AI_DEFAULTS.provider, repaired.provider)
  check('temperature is clamped', repaired.temperature === 1.5, String(repaired.temperature))
  check('maxTokens is clamped up', repaired.maxTokens === 256, String(repaired.maxTokens))
  check('turns are clamped', repaired.maxTurns === 24, String(repaired.maxTurns))
  check('a bad write mode falls back to auto', repaired.writes === 'auto')
  check('a bad role provider is dropped', repaired.roles.planner.provider === '')
  check('a non-string role model becomes empty', repaired.roles.planner.model === '')
}

/* ------------------------------------------------------------------ */
/* free models                                                         */
/* ------------------------------------------------------------------ */

{
  check('free-only is the default', AI_DEFAULTS.freeOnly === true)
  check('a stored false is respected', normalizeConfig({ freeOnly: false }).freeOnly === false)
  check('junk becomes the free default', normalizeConfig({ freeOnly: 'yes' }).freeOnly === true)

  // what counts as free
  check('an OpenRouter free id is free', isFreeModel('openrouter', 'meta-llama/llama-3.3-70b-instruct:free'))
  check('a paid hint is paid', isFreeModel('openrouter', 'anthropic/claude-sonnet-5') === false)
  check('the :free suffix is trusted even for unknown ids', isFreeModel('xkiro', 'some/new-model:free'))
  check('a local model costs nothing', isFreeModel('custom', 'llama-3.3-70b'))
  check('an unknown remote id is treated as paid', isFreeModel('xkiro', 'some/new-model') === false)
  check('OpenAI has no free model', hintsFor('openai').every((hint) => !isFreeModel('openai', hint.id)))
  check('Anthropic has no free model', hintsFor('anthropic').every((hint) => !isFreeModel('anthropic', hint.id)))
  check('xAI has no free model', hintsFor('xai').every((hint) => !isFreeModel('xai', hint.id)))
  check('Groq covers its catalog on the free tier', hintsFor('groq').every((hint) => isFreeModel('groq', hint.id)))
  check('Cerebras covers its catalog on the free tier', hintsFor('cerebras').every((hint) => isFreeModel('cerebras', hint.id)))
  check('OpenRouter still has free models', freeHintsFor('openrouter').length >= 2, freeHintsFor('openrouter').map((h) => h.id).join(' '))
  check('Gemini Flash is the free Google model', isFreeModel('google', 'gemini-3-flash') && !isFreeModel('google', 'gemini-3-pro'))
  check('Mistral Small is the free Mistral model', isFreeModel('mistral', 'mistral-small-latest') && !isFreeModel('mistral', 'mistral-large-latest'))

  const freeIds = freeProviders().map((provider) => provider.id)
  check('the free providers are the ones with a free path', ['openrouter', 'xkiro', 'groq', 'mistral', 'cerebras', 'google', 'custom'].every((id) => freeIds.includes(id as never)), freeIds.join(','))
  check('the paid-only providers are not in it', ['openai', 'anthropic', 'xai', 'deepseek', 'together'].every((id) => !freeIds.includes(id as never)), freeIds.join(','))
  check('every free provider explains its free path', freeProviders().every((provider) => Boolean(provider.freeNote)), freeProviders().filter((p) => !p.freeNote).map((p) => p.id).join(','))
  check(
    'every free hint has a label, so the picker reads like English',
    PROVIDERS.every((provider) => provider.models.filter((hint) => hint.cost === 'free').every((hint) => Boolean(hint.label))),
  )
}

/* ------------------------------------------------------------------ */
/* selection                                                           */
/* ------------------------------------------------------------------ */

{
  const pinned = selectTargets(config({ auto: false, provider: 'groq', model: 'llama-3.3-70b-versatile' }), { groq: 'k' })
  check('a pinned provider gives exactly one target', pinned.targets.length === 1, String(pinned.targets.length))
  check('the pinned model is the one used', pinned.targets[0].model === 'llama-3.3-70b-versatile')
  check('the reason says pinned', pinned.reason.startsWith('Pinned'))

  const auto = selectTargets(config({ auto: true }), { openrouter: 'a', groq: 'b' })
  check('automatic selection spans every configured provider', new Set(auto.targets.map((t) => t.provider)).size === 2)
  check('the preferred provider comes first', auto.targets[0].provider === 'openrouter')
  check('a second provider is a fallback, not a second head', auto.targets.some((t) => t.provider === 'groq'))
  check('the candidate list is bounded', auto.targets.length <= 8, String(auto.targets.length))

  // free-only: the whole point of the switch
  {
    const freeOnly = selectTargets(config({ auto: true, provider: 'openrouter' }), { openrouter: 'a' })
    check(
      'automatic selection never offers a paid model',
      freeOnly.targets.every((target) => isFreeModel(target.provider, target.model)),
      freeOnly.targets.map((t) => t.model).join(' '),
    )
    check('and it counts them as free', freeOnly.freeCount === freeOnly.targets.length && !freeOnly.paidFallback)
    check('the reason says free models only', /free models only/i.test(freeOnly.reason), freeOnly.reason)
    check(
      'it does not default to an expensive Claude or GPT',
      !freeOnly.targets.some((target) => /claude-sonnet|gpt-6-sol|gemini-3-pro/.test(target.model)),
      freeOnly.targets.map((t) => t.model).join(' '),
    )

    const off = selectTargets(config({ auto: true, provider: 'openrouter', freeOnly: false }), { openrouter: 'a' })
    check('turning it off brings the paid models back', off.targets.some((target) => !isFreeModel(target.provider, target.model)))

    const paidKeys = selectTargets(config({ auto: true }), { openai: 'k' })
    check('a paid-only key still works, and says so', paidKeys.targets.length > 0 && paidKeys.paidFallback, paidKeys.reason)
    check('the reason warns about the bill', /paid models/i.test(paidKeys.reason), paidKeys.reason)

    const pinnedPaid = selectTargets(
      config({ auto: false, provider: 'openai', model: 'gpt-6', freeOnly: true }),
      { openai: 'k' },
    )
    check('a model you pin by hand is used even when paid', pinnedPaid.targets[0]?.model === 'gpt-6' && !pinnedPaid.paidFallback, JSON.stringify(pinnedPaid.targets[0]))

    const local = selectTargets(config({ auto: true, customBaseUrl: 'http://box:8080/v1', customModel: 'llama' }), {})
    check('a local endpoint is free and wins outright', local.targets[0]?.provider === 'custom' && local.freeCount === 1)

    const freeGroq = selectTargets(config({ auto: false, provider: 'groq' }), { groq: 'k' })
    check('a free-tier provider resolves to one of its free models', isFreeModel('groq', freeGroq.targets[0].model), freeGroq.targets[0].model)
  }

  const none = selectTargets(config(), {})
  check('no keys means no candidates', none.targets.length === 0)
  check('and the reason says so', /add a key/i.test(none.reason), none.reason)

  const rolePinned = selectTargets(
    config({ auto: true, roles: { ...AI_DEFAULTS.roles, tester: { provider: 'groq', model: 'qwen/qwen3-32b' } } }),
    { openrouter: 'a', groq: 'b' },
    'tester',
  )
  check('a pinned role overrides the preferred provider', rolePinned.targets[0].provider === 'groq' && rolePinned.targets[0].model === 'qwen/qwen3-32b', JSON.stringify(rolePinned.targets[0]))

  const custom = selectTargets(config({ customBaseUrl: 'http://box:8080/v1', customModel: 'llama' }), {})
  check('a custom endpoint is a candidate without a key', custom.targets.some((t) => t.provider === 'custom' && t.model === 'llama'))
}

/* ------------------------------------------------------------------ */
/* failover                                                            */
/* ------------------------------------------------------------------ */

const messages = [{ role: 'user' as const, content: 'hi' }]

{
  resetCooldowns()
  const mock = mockFetch(() => reply('hello from the first model'))
  const events: string[] = []
  const result = await callAi({
    config: config({ auto: false, provider: 'groq', model: 'llama-3.3-70b-versatile' }),
    keys: { groq: 'k' },
    messages,
    fetchImpl: mock.impl,
    onEvent: (event) => events.push(event.kind),
  })
  check('a healthy call returns its text', result.text === 'hello from the first model')
  check('it reports the model that answered', result.target.model === 'llama-3.3-70b-versatile')
  check('the request went to Groq’s chat endpoint', mock.calls[0].url === 'https://api.groq.com/openai/v1/chat/completions', mock.calls[0]?.url)
  check('the request carries the key', mock.calls[0].headers.Authorization === 'Bearer k')
  check('the request carries the messages', JSON.stringify(mock.calls[0].body.messages) === JSON.stringify(messages))
  check('the events are try → ok', events.join(',') === 'try,ok', events.join(','))
  check('an empty answer is treated as a failure', await (async () => {
    resetCooldowns()
    const empty = mockFetch(() => reply('   '))
    try {
      await callAi({
        config: config({ auto: false, provider: 'groq', model: 'x' }),
        keys: { groq: 'k' },
        messages,
        fetchImpl: empty.impl,
      })
      return false
    } catch {
      return true
    }
  })())
}

{
  // A 500 on the preferred model falls through to the next candidate.
  resetCooldowns()
  let call = 0
  const mock = mockFetch(() => {
    call += 1
    return call === 1 ? { status: 500, message: 'upstream exploded' } : reply('second model here')
  })
  const events: Array<{ kind: string; willRetry?: boolean }> = []
  const result = await callAi({
    config: config({ auto: true, provider: 'openrouter' }),
    keys: { openrouter: 'k' },
    messages,
    fetchImpl: mock.impl,
    onEvent: (event) => events.push({ kind: event.kind, willRetry: 'willRetry' in event ? event.willRetry : undefined }),
  })
  check('a 500 falls over to another model', result.text === 'second model here')
  check('and it is a different model', mock.calls[1].body.model !== mock.calls[0].body.model, `${mock.calls[0].body.model} → ${mock.calls[1].body.model}`)
  check('the failed attempt is reported as retryable', events.some((event) => event.kind === 'fail' && event.willRetry === true))
  check('the model is not cooled down after a 500', !isCoolingDown('openrouter', String(mock.calls[0].body.model)))
}

{
  // A rejected key takes the whole provider out of the run — not just one model.
  resetCooldowns()
  const mock = mockFetch(({ url }) =>
    url.includes('openrouter') ? { status: 401, message: 'invalid api key' } : reply('groq saved the day'),
  )
  const result = await callAi({
    config: config({ auto: true, provider: 'openrouter' }),
    keys: { openrouter: 'bad', groq: 'good' },
    messages,
    fetchImpl: mock.impl,
  })
  check('a bad key falls over to another provider', result.text === 'groq saved the day')
  check('and the working provider is the one that answered', result.target.provider === 'groq')
  const attempts = mock.calls.filter((request) => request.url.includes('openrouter'))
  check('the dead provider is not hammered once per model', attempts.length === 1, `${attempts.length} attempts`)
  check('the dead provider is cooled down', isCoolingDown('openrouter', 'anything'))
}

{
  // A retired model costs one call, then the provider's next model is used.
  resetCooldowns()
  let call = 0
  const mock = mockFetch(() => {
    call += 1
    return call === 1 ? { status: 404, message: 'model not found' } : reply('replacement model')
  })
  const result = await callAi({
    // free-only would leave a single candidate here, so this case runs with it
    // off; the free path gets its own test below.
    config: config({ auto: true, provider: 'mistral', freeOnly: false }),
    keys: { mistral: 'k' },
    messages,
    fetchImpl: mock.impl,
  })
  check('a 404 model falls over', result.text === 'replacement model')
  check('the retired model is remembered', isCoolingDown('mistral', String(mock.calls[0].body.model)))
  check('but the provider stays usable', !isCoolingDown('mistral', String(mock.calls[1].body.model)))
}

{
  // Free-only failover: it must move between free models, never onto a paid one.
  resetCooldowns()
  const seen: string[] = []
  const mock = mockFetch(({ body }) => {
    seen.push(String(body.model))
    return seen.length <= 3 ? { status: 500, message: 'down' } : reply('a free model answered')
  })
  const result = await callAi({
    config: config({ auto: true, provider: 'openrouter' }),
    keys: { openrouter: 'k', groq: 'g' },
    messages,
    fetchImpl: mock.impl,
  })
  check('free models fall over to other free models', result.text === 'a free model answered')
  check('and never touch a paid model', seen.every((model) => isFreeModel(result.target.provider, model) || /:free$/.test(model)), seen.join(' '))
  check('it moved through several free models first', new Set(seen).size >= 2, seen.join(' '))
  check('the model that answered is the one reported', result.target.model === seen.at(-1), `${result.target.model} vs ${seen.at(-1)}`)
}

{
  // Fallback switched off: the first error is the run's error.
  resetCooldowns()
  const mock = mockFetch(() => ({ status: 429, message: 'slow down' }))
  let thrown = ''
  try {
    await callAi({
      config: config({ auto: true, fallback: false, provider: 'groq' }),
      keys: { groq: 'k', openrouter: 'k' },
      messages,
      fetchImpl: mock.impl,
    })
  } catch (error) {
    thrown = (error as Error).message
  }
  check('with fallback off it stops at the first failure', /Rate limited/.test(thrown), thrown)
  check('and it only tried once', mock.calls.length === 1, `${mock.calls.length} calls`)
}

{
  resetCooldowns()
  const mock = mockFetch(() => ({ status: 503 }))
  let thrown = ''
  const seen: string[] = []
  try {
    await callAi({
      config: config({ auto: true, provider: 'groq' }),
      keys: { groq: 'k', openrouter: 'k' },
      messages,
      fetchImpl: mock.impl,
      onEvent: (event) => event.kind === 'no-candidates' && seen.push(event.message),
    })
  } catch (error) {
    thrown = (error as Error).message
  }
  check('when everything fails the last error is thrown', thrown.length > 0)
  const second = await (async () => {
    try {
      await callAi({
        config: config({ auto: true, provider: 'groq' }),
        keys: { groq: 'k', openrouter: 'k' },
        messages,
        fetchImpl: mock.impl,
      })
      return ''
    } catch (error) {
      return (error as Error).message
    }
  })()
  check('a second run in the same minute skips the cooled-down models', /cooling down/i.test(second) || second.length > 0, second.slice(0, 80))
}

{
  // Stopping is not a provider failure, so it must not fall back.
  resetCooldowns()
  const controller = new AbortController()
  const mock = mockFetch(() => reply('too late'))
  controller.abort()
  let thrown = ''
  try {
    await callAi({
      config: config({ auto: true, provider: 'groq' }),
      keys: { groq: 'k', openrouter: 'k' },
      messages,
      fetchImpl: mock.impl,
      signal: controller.signal,
    })
  } catch (error) {
    thrown = (error as Error).message
  }
  check('an aborted call reports Stopped, not a fallback', thrown === 'Stopped', thrown)
  check('and nothing was requested', mock.calls.length === 0)
}

/* ------------------------------------------------------------------ */
/* discovery and health                                                */
/* ------------------------------------------------------------------ */

{
  resetCooldowns()
  const mock = mockFetch(({ url }) =>
    url.endsWith('/models')
      ? { models: ['gpt-6', 'text-embedding-3-large', 'whisper-1', 'gpt-6-mini'] }
      : reply('ok'),
  )
  const discovery = await discoverModels('openai', 'k', '', { fetchImpl: mock.impl })
  check('model discovery lists chat models', discovery.models.includes('gpt-6') && discovery.models.includes('gpt-6-mini'), discovery.models.join(','))
  check('discovery filters out embeddings and audio', !discovery.models.some((id) => /embed|whisper/.test(id)), discovery.models.join(','))
  check('discovery reports no error when it works', discovery.error === null)

  const probe = await probeProvider(config(), 'openai', 'k', { fetchImpl: mock.impl })
  check('a probe reports success', probe.ok, probe.error ?? '')
  check('a probe names the model it used', probe.model === 'gpt-6', probe.model)
  check('a probe returns the reply', probe.reply === 'ok', probe.reply)
  check('a probe lists the models it saw', probe.models.length > 0)

  const bad = await probeProvider(config(), 'openai', 'k', { fetchImpl: mockFetch(({ url }) => (url.endsWith('/models') ? { models: [] } : { status: 401, message: 'bad key' })).impl })
  check('a probe reports a bad key', !bad.ok && /rejected/i.test(bad.error ?? ''), String(bad.error))
}

/* ------------------------------------------------------------------ */
/* the toolbox                                                         */
/* ------------------------------------------------------------------ */

{
  check('there are at least fifteen tools', TOOLS.length >= 15, String(TOOLS.length))
  check('every tool has a name and a summary', TOOLS.every((tool) => tool.name && tool.summary.length > 10))
  check('tool names are snake_case', TOOLS.every((tool) => /^[a-z]+(_[a-z]+)*$/.test(tool.name)))
  check('the destructive tools are marked', TOOLS.filter((tool) => tool.destructive).every((tool) => tool.writes))
  check('write tools are collected', WRITE_TOOLS.has('patch_file') && WRITE_TOOLS.has('delete_project') && !WRITE_TOOLS.has('read_file'))
  check('the requested capabilities exist', [
    'create_project', 'delete_project', 'create_folder', 'delete_folder', 'create_file',
    'delete_file', 'write_file', 'patch_file', 'move_file', 'run_preview', 'check_problems',
  ].every((name) => TOOLS.some((tool) => tool.name === name)))
}

{
  const text = `Here is my plan.

\`\`\`tool
{"tool": "create_file", "args": {"path": "index.html", "content": "<h1>hi</h1>"}}
\`\`\`

And another:

\`\`\`tool
[{"tool": "check_problems"}, {"tool": "finish", "args": {"summary": "done"}}]
\`\`\`

Flat arguments work too:

\`\`\`json
{"tool": "patch_file", "path": "a.js", "find": "x", "replace": "y"}
\`\`\`

<tool>{"name": "set_entry", "args": {"path": "index.html"}}</tool>
`
  const calls = parseToolCalls(text)
  check('fenced tool blocks are parsed', calls.length === 5, String(calls.length))
  check('args objects are read', calls[0].args.path === 'index.html')
  check('arrays of calls are expanded', calls[1].tool === 'check_problems' && calls[2].tool === 'finish')
  check('flat arguments are accepted', calls[3].args.find === 'x' && calls[3].args.path === 'a.js')
  check('the <tool> tag is accepted', calls[4].tool === 'set_entry')
  check('prose is left alone', stripToolBlocks(text).includes('Here is my plan.') && !stripToolBlocks(text).includes('create_file'))

  const prose = 'Just an explanation, with ```js\nconst x = 1\n``` in it.'
  check('ordinary code fences are not tool calls', parseToolCalls(prose).length === 0)
  check('and they survive stripping', stripToolBlocks(prose).includes('const x = 1'))

  check('backslash paths normalise', cleanPath('./src/App.tsx') === 'src/App.tsx')
  check('leading slashes are stripped', cleanPath('/index.html') === 'index.html')
  check('escaping the project is refused', cleanPath('../secret') === null)
  check('nested escapes are refused', cleanPath('src/../../etc/passwd') === null)
  check('empty paths are refused', cleanPath('   ') === null)
  check('windows drive paths are refused', cleanPath('C:/Windows') === null)
  check('inner dot-segments are dropped', cleanPath('src/./lib/a.ts') === 'src/lib/a.ts')
}

/* ------------------------------------------------------------------ */
/* a fake workspace, so the tools can be exercised for real             */
/* ------------------------------------------------------------------ */

type FakeProject = { id: string; name: string; files: ProjectFile[]; folders: string[] }

function fakeWorkspace(): ToolWorkspace & { state: { projects: FakeProject[]; current: string; console: Array<{ level: string; text: string; time: number }> } } {
  const state = {
    projects: [{ id: 'p1', name: 'Demo', files: [{ path: 'index.html', content: '<h1>hi</h1>' }], folders: [] }] as FakeProject[],
    current: 'p1',
    console: [] as Array<{ level: string; text: string; time: number }>,
  }
  const find = (nameOrId: string) =>
    state.projects.find((project) => project.id === nameOrId || project.name.toLowerCase() === nameOrId.toLowerCase())
  const project = () => state.projects.find((entry) => entry.id === state.current)!

  return {
    state,
    currentProject: () => {
      const current = project()
      return current ? { ...current } : null
    },
    listProjects: () =>
      state.projects.map((entry) => ({
        id: entry.id,
        name: entry.name,
        fileCount: entry.files.length,
        createdAt: 0,
        updatedAt: 0,
      })),
    createProject: async (name) => {
      const next: FakeProject = { id: `p${state.projects.length + 1}`, name, files: [], folders: [] }
      state.projects.push(next)
      state.current = next.id
      return { id: next.id, name }
    },
    openProject: async (nameOrId) => {
      const found = find(nameOrId)
      if (!found) return false
      state.current = found.id
      return true
    },
    renameProject: async (name) => {
      project().name = name
      return true
    },
    deleteProject: async (nameOrId) => {
      const found = find(nameOrId)
      if (!found) return false
      state.projects = state.projects.filter((entry) => entry.id !== found.id)
      return true
    },
    createFile: async (path, content) => {
      const current = project()
      if (current.files.some((file) => file.path === path)) return false
      current.files.push({ path, content })
      return true
    },
    writeFile: async (path, content) => {
      const current = project()
      const existing = current.files.find((file) => file.path === path)
      if (existing) existing.content = content
      else current.files.push({ path, content })
      return true
    },
    readFile: (path) => project().files.find((file) => file.path === path)?.content ?? null,
    deleteFile: async (path) => {
      const current = project()
      const before = current.files.length
      current.files = current.files.filter((file) => file.path !== path)
      return current.files.length !== before
    },
    renameFile: async (from, to) => {
      const current = project()
      const file = current.files.find((entry) => entry.path === from)
      if (!file || current.files.some((entry) => entry.path === to)) return false
      file.path = to
      return true
    },
    createFolder: async (path) => {
      if (!project().folders.includes(path)) project().folders.push(path)
      return true
    },
    deleteFolder: async (path) => {
      const current = project()
      current.folders = current.folders.filter((folder) => folder !== path && !folder.startsWith(`${path}/`))
      current.files = current.files.filter((file) => !file.path.startsWith(`${path}/`))
      return true
    },
    renameFolder: async (from, to) => {
      const current = project()
      current.files = current.files.map((file) =>
        file.path.startsWith(`${from}/`) ? { ...file, path: `${to}${file.path.slice(from.length)}` } : file,
      )
      current.folders = current.folders.map((folder) =>
        folder.startsWith(`${from}/`) ? `${to}${folder.slice(from.length)}` : folder,
      )
      return true
    },
    moveFile: async (path, folder) => {
      const current = project()
      const file = current.files.find((entry) => entry.path === path)
      if (!file) return false
      file.path = `${folder ? `${folder}/` : ''}${path.slice(path.lastIndexOf('/') + 1)}`
      return true
    },
    setEntry: async () => true,
    listProblems: () => {
      const broken = project().files.find((file) => file.content.includes('<h1>') && !file.content.includes('</h1>'))
      return broken
        ? [{ path: broken.path, line: 1, column: 1, severity: 'error', message: 'unclosed <h1>', rule: 'tags' }]
        : []
    },
    runPreview: async () => {
      state.console.push({ level: 'log', text: 'preview says hi', time: Date.now() })
      return { ok: true, entry: 'index.html', htmlLength: 2048 }
    },
    readConsole: () => state.console,
    snapshot: async () => {
      const current = project()
      return { id: current.id, name: current.name, files: current.files.map((file) => ({ ...file })), folders: [...current.folders] }
    },
    restore: async (snapshot) => {
      const current = project()
      current.files = snapshot.files.map((file) => ({ ...file }))
      current.folders = [...snapshot.folders]
      return true
    },
  }
}

{
  const workspace = fakeWorkspace()
  const run = (name: string, args: Record<string, unknown> = {}) => executeTool(name, args, workspace)

  check('list_files reports the workspace', (await run('list_files')).summary === '1 files')
  check('read_file returns the content', (await run('read_file', { path: 'index.html' })).data === '<h1>hi</h1>')
  check('read_file misses cleanly', !(await run('read_file', { path: 'nope.html' })).ok)

  const created = await run('create_file', { path: 'src/app.js', content: 'console.log(1)' })
  check('create_file writes a file', created.ok && workspace.state.projects[0].files.some((file) => file.path === 'src/app.js'), created.summary)
  check('create_file refuses an existing path', !(await run('create_file', { path: 'src/app.js', content: 'x' })).ok)
  check('write_file overwrites', (await run('write_file', { path: 'src/app.js', content: 'console.log(2)' })).ok && workspace.readFile('src/app.js') === 'console.log(2)')

  const patch = await run('patch_file', { path: 'src/app.js', find: 'console.log(2)', replace: 'console.log(3)' })
  check('patch_file applies an exact match', patch.ok && workspace.readFile('src/app.js') === 'console.log(3)', patch.summary)
  check('patch_file fails when the text is absent', !(await run('patch_file', { path: 'src/app.js', find: 'nothing', replace: 'x' })).ok)
  check('patch_file refuses an empty find', !(await run('patch_file', { path: 'src/app.js', find: '', replace: 'x' })).ok)

  await run('write_file', { path: 'src/dup.js', content: 'a a a' })
  const ambiguous = await run('patch_file', { path: 'src/dup.js', find: 'a', replace: 'b' })
  check('an ambiguous patch is refused', !ambiguous.ok && /3 times/.test(ambiguous.summary), ambiguous.summary)
  const all = await run('patch_file', { path: 'src/dup.js', find: 'a', replace: 'b', all: true })
  check('patch_file all:true replaces every one', all.ok && workspace.readFile('src/dup.js') === 'b b b', all.summary)

  check('rename_file moves and keeps content', (await run('rename_file', { from: 'src/dup.js', to: 'src/lib/dup.js' })).ok && workspace.readFile('src/lib/dup.js') === 'b b b')
  check('rename_file refuses collisions', !(await run('rename_file', { from: 'src/lib/dup.js', to: 'index.html' })).ok)
  check('delete_file removes it', (await run('delete_file', { path: 'src/lib/dup.js' })).ok && workspace.readFile('src/lib/dup.js') === null)
  check('delete_file on a missing path fails', !(await run('delete_file', { path: 'src/lib/dup.js' })).ok)

  check('create_folder creates an empty folder', (await run('create_folder', { path: 'assets' })).ok && workspace.state.projects[0].folders.includes('assets'))
  check('move_file puts a file in a folder', (await run('move_file', { path: 'src/app.js', folder: 'assets' })).ok && workspace.readFile('assets/app.js') !== null)
  check('move_file can pull it back to the root', (await run('move_file', { path: 'assets/app.js', folder: '' })).ok && workspace.readFile('app.js') !== null)
  check('delete_folder removes what is inside', (await run('delete_folder', { path: 'assets' })).ok && !workspace.state.projects[0].folders.includes('assets'))

  check('set_entry needs a real file', !(await run('set_entry', { path: 'ghost.js' })).ok)
  check('set_entry accepts a real one', (await run('set_entry', { path: 'index.html' })).ok)

  await run('write_file', { path: 'broken.html', content: '<h1>oops' })
  const problems = await run('check_problems')
  check('check_problems reports the parse error', problems.ok === false && /unclosed/.test(String(problems.data)) && /1 error/.test(problems.summary), `${problems.summary} / ${problems.data}`)
  await run('delete_file', { path: 'broken.html' })
  check('check_problems is quiet when the project is clean', (await run('check_problems')).ok)
  const preview = await run('run_preview')
  check('run_preview runs and reports', preview.ok && /Preview ran/.test(preview.summary), preview.summary)
  check('run_preview includes the console', String(preview.data).includes('preview says hi'), String(preview.data))
  check('read_console works on its own', String((await run('read_console')).data).includes('preview says hi'))

  const finished = await run('finish', { summary: 'all done' })
  check('finish reports the summary', finished.ok && /all done/.test(finished.summary))

  const unknown = await run('teleport', {})
  check('an unknown tool fails with a list of real ones', !unknown.ok && unknown.summary.includes('create_file'))

  // project-level tools
  const createdProject = await run('create_project', { name: 'Second' })
  check('create_project opens the new one', createdProject.ok && workspace.state.current !== 'p1')
  check('list_projects marks the current one', String((await run('list_projects')).data).includes('* Second'))
  check('open_project switches back by name', (await run('open_project', { project: 'demo' })).ok && workspace.state.current === 'p1')
  check('open_project fails for unknown names', !(await run('open_project', { project: 'nope' })).ok)
  check('rename_project renames', (await run('rename_project', { name: 'Renamed' })).ok && workspace.state.projects[0].name === 'Renamed')
  check('delete_project removes it', (await run('delete_project', { project: 'Second' })).ok && workspace.state.projects.length === 1)
}

/* ------------------------------------------------------------------ */
/* the crew                                                            */
/* ------------------------------------------------------------------ */

/** A scripted provider: the answer depends on which agent is asking. */
function scriptedProvider(script: {
  planner?: string[]
  coderA?: string[]
  coderB?: string[]
  tester?: string[]
  failFirst?: boolean
}) {
  const counters: Record<string, number> = { planner: 0, coderA: 0, coderB: 0, tester: 0, chat: 0 }
  let first = true
  return mockFetch(({ body, url }) => {
    if (url.endsWith('/models')) return { models: [] }
    if (script.failFirst && first) {
      first = false
      return { status: 500, message: 'flaky upstream' }
    }
    const messages = (body.messages ?? []) as Array<{ role: string; content: string }>
    const system = messages.find((message) => message.role === 'system')?.content ?? ''
    const key = /PLANNER/.test(system) ? 'planner' : /CODER A/.test(system) ? 'coderA' : /CODER B/.test(system) ? 'coderB' : /TESTER/.test(system) ? 'tester' : 'chat'
    const queue = (script as Record<string, string[] | undefined>)[key] ?? ['']
    const index = Math.min(counters[key], queue.length - 1)
    counters[key] += 1
    return reply(queue[index] ?? '')
  })
}

const call = (tool: string, args: Record<string, unknown> = {}) =>
  '```tool\n' + JSON.stringify({ tool, args }) + '\n```'

{
  resetCooldowns()
  const workspace = fakeWorkspace()
  const mock = scriptedProvider({
    planner: [`Plan: build a counter app.\n${call('finish', { summary: 'Plan ready' })}`],
    coderA: [`Writing the app.\n${call('write_file', { path: 'counter.html', content: '<button id="b">0</button><script>let n=0</script>' })}\n${call('finish', { summary: 'Wrote counter.html' })}`],
    coderB: [`Wiring the click.\n${call('patch_file', { path: 'counter.html', find: 'let n=0', replace: 'let n=0;document.onclick=()=>{}' })}\n${call('finish', { summary: 'Wired the click' })}`],
    tester: [`Checking.\n${call('check_problems')}\n${call('run_preview')}\n${call('finish', { summary: 'PASS: renders and runs' })}`],
  })

  const events: string[] = []
  const result = await runAgent({
    config: config({ auto: false, provider: 'groq', model: 'llama-3.3-70b-versatile', maxTurns: 8 }),
    keys: { groq: 'k' },
    workspace,
    task: 'build a counter',
    fetchImpl: mock.impl,
    onEvent: (event) => events.push(event.kind === 'message' ? `msg:${(event as { label: string }).label}` : event.kind),
  })

  check('the crew reports back a summary', /PASS/.test(result.summary), result.summary)
  check('four agents took a turn', result.turns.map((turn) => turn.speaker).join(',') === 'planner,coderA,coderB,tester', result.turns.map((turn) => turn.speaker).join(','))
  check('the coder’s file exists in the workspace', workspace.readFile('counter.html') !== null)
  check('the reviewer’s patch landed', (workspace.readFile('counter.html') ?? '').includes('document.onclick'), workspace.readFile('counter.html') ?? '')
  check('every tool call is in the activity list', ['write_file', 'patch_file', 'check_problems', 'run_preview'].every((tool) => result.actions.some((action) => action.tool === tool)), result.actions.map((action) => action.tool).join(','))
  check('the tester really ran the preview', result.actions.some((action) => action.tool === 'run_preview' && action.ok))
  check('the tester really ran the parsers', result.actions.some((action) => action.tool === 'check_problems'))
  check('the run reports the turns it used', result.turnsUsed === 4, String(result.turnsUsed))
  check('the run ends without an error', result.error === null, String(result.error))
  check('the plan came back as the planner’s own message', result.turns[0].text.startsWith('Plan: build a counter app.'), result.turns[0].text)

  const systemPrompts = mock.calls.map((request) => ((request.body.messages ?? []) as Array<{ content: string }>)[0]?.content ?? '')
  check('the planner gets the planner prompt', systemPrompts.some((prompt) => prompt.includes('PLANNER')))
  check('each agent gets the tool manual', systemPrompts.every((prompt) => prompt.includes('patch_file(') && prompt.includes('```tool')))
  check('later agents see what came before', ((mock.calls.at(-1)?.body.messages ?? []) as Array<{ content: string }>).some((message) => message.content.includes('[Coder A]')))
  check('events were emitted in order', events[0] === 'start' && events.includes('tool') && events.includes('done'), events.slice(0, 6).join(','))
}

{
  // A flaky first call must not end the build.
  resetCooldowns()
  const workspace = fakeWorkspace()
  const mock = scriptedProvider({
    failFirst: true,
    planner: [`${call('finish', { summary: 'one file' })}`],
    coderA: [`${call('write_file', { path: 'a.js', content: 'console.log(1)' })}\n${call('finish', { summary: 'wrote a.js' })}`],
    coderB: [`${call('finish', { summary: 'looks fine' })}`],
    tester: [`${call('finish', { summary: 'PASS: ok' })}`],
  })
  const fallbacks: string[] = []
  const result = await runAgent({
    config: config({ auto: true, provider: 'groq', maxTurns: 4 }),
    keys: { groq: 'k', openrouter: 'k2' },
    workspace,
    task: 'build one file',
    fetchImpl: mock.impl,
    onEvent: (event) => event.kind === 'fallback' && fallbacks.push(event.message),
  })
  check('a failing model is reported as a fallback', fallbacks.length >= 1, fallbacks[0] ?? '')
  check('the crew still builds the file', workspace.readFile('a.js') !== null)
  check('the run is not marked as failed', result.error === null, String(result.error))
}

{
  // "Ask before writing" is respected, and a refusal is explained to the model.
  resetCooldowns()
  const workspace = fakeWorkspace()
  const mock = scriptedProvider({
    planner: [`${call('finish', { summary: 'plan' })}`],
    coderA: [`${call('write_file', { path: 'denied.js', content: 'x' })}\n${call('finish', { summary: 'tried' })}`],
    coderB: [`${call('finish', { summary: 'nothing' })}`],
    tester: [`${call('finish', { summary: 'PASS' })}`],
  })
  const asked: string[] = []
  const result = await runAgent({
    config: config({ auto: false, provider: 'groq', writes: 'confirm', maxTurns: 6 }),
    keys: { groq: 'k' },
    workspace,
    task: 'write a file',
    fetchImpl: mock.impl,
    approve: async (toolCall) => {
      asked.push(toolCall.tool)
      return false
    },
    onEvent: () => {},
  })
  check('a write is offered for approval', asked.includes('write_file'), asked.join(','))
  check('a refused write does not touch the project', workspace.readFile('denied.js') === null)
  check('the refusal is reported in the activity list', result.actions.some((action) => action.tool === 'write_file' && !action.ok), JSON.stringify(result.actions.slice(0, 2)))
}

{
  // The turn limit is a real limit.
  resetCooldowns()
  const workspace = fakeWorkspace()
  const mock = scriptedProvider({
    planner: [`thinking…`],
    coderA: [`still thinking…`],
    coderB: [`thinking…`],
    tester: [`thinking…`],
  })
  const result = await runAgent({
    config: config({ auto: false, provider: 'groq', maxTurns: 2 }),
    keys: { groq: 'k' },
    workspace,
    task: 'loop forever',
    fetchImpl: mock.impl,
  })
  check('a crew that never finishes stops at the turn limit', result.turnsUsed <= 2, String(result.turnsUsed))
  check('and it says so rather than claiming success', /stopped before reporting/.test(result.summary) || result.summary === '', result.summary)
}

/* ------------------------------------------------------------------ */
/* chat                                                                */
/* ------------------------------------------------------------------ */

{
  resetCooldowns()
  const workspace = fakeWorkspace()
  let chatCall = 0
  const mock = mockFetch(() => {
    chatCall += 1
    return reply(
      chatCall === 1
        ? `Sure — adding it.\n${call('write_file', { path: 'hello.js', content: 'console.log("hi")' })}`
        : '',
    )
  })
  const result = await runChat({
    config: config({ auto: false, provider: 'groq' }),
    keys: { groq: 'k' },
    workspace,
    task: 'add hello.js',
    fetchImpl: mock.impl,
  })
  check('chat writes the file it says it did', workspace.readFile('hello.js') === 'console.log("hi")')
  check('chat keeps only the prose in the transcript', result.turns[0].text === 'Sure — adding it.', result.turns[0].text)
  check('chat records the tool it used', result.actions[0].tool === 'write_file')
  check('chat reports the model that answered', result.turns[0].target?.model === hintsFor('groq')[0].id, result.turns[0].target?.model)

  const followed = await runChat({
    config: config({ auto: false, provider: 'groq' }),
    keys: { groq: 'k' },
    workspace,
    task: 'and now explain it',
    history: result.turns,
    fetchImpl: mockFetch(() => reply('It prints hi.')).impl,
  })
  check('a follow-up keeps the earlier turns', followed.turns[0].text === 'It prints hi.')
}

{
  check('history is sent as user/assistant turns', (() => {
    const messages = turnsToMessages([
      { speaker: 'user', label: 'You', text: 'build it' },
      { speaker: 'coderA', label: 'Coder A', text: 'built it' },
    ])
    return messages[0].role === 'user' && messages[1].role === 'assistant' && messages[1].content === '[Coder A] built it'
  })())
}

/* ------------------------------------------------------------------ */
/* keys never leak                                                     */
/* ------------------------------------------------------------------ */

{
  check('a key is masked to its ends', maskKey('sk-or-v1-1234567890abcdef').endsWith('cdef') && maskKey('sk-or-v1-1234567890abcdef').startsWith('sk-or-'))
  check('a short key is fully masked', maskKey('abc').includes('•'))
  check('keys are not part of the settings shape', !('keys' in AI_DEFAULTS) && !('apiKey' in AI_DEFAULTS))
  check('masking never shows the middle of a key', !maskKey('sk-or-v1-1234567890abcdef').includes('1234567890'))
}

if (failed > 0) {
  console.log(`\n✗ ${failed} AI check(s) failed`)
  process.exit(1)
}
console.log('\n✓ Build AI')
