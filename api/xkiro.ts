/**
 * A forwarder for providers that do not allow browser requests.
 *
 * Cody is BYOK with no backend: the page calls the provider directly. That is
 * the whole privacy story — the key never leaves the device and no server of
 * ours ever sees it. But a browser refuses a cross-origin request whose
 * response carries no `Access-Control-Allow-Origin`, and xKiro sends none, so
 * every call to it died as "Failed to fetch" before the key was even checked.
 *
 * This function is the smallest possible answer to that: it takes the request,
 * checks the provider against a fixed allowlist (never a URL from the caller —
 * that would be an open relay), forwards it once, and hands the response back
 * untouched. It stores nothing, logs nothing, and the key travels in the
 * `Authorization` header exactly as it would have gone straight to xKiro.
 *
 * Same path shape as the real API, so nothing else in the client changes:
 *
 *     POST /api/xkiro/v1/chat/completions  →  https://api.xkiro.com/v1/chat/completions
 */

/** The only destinations this forwarder will talk to. */
const UPSTREAM: Record<string, string> = {
  xkiro: 'https://api.xkiro.com',
}

/** Headers we forward. Everything else is dropped — including cookies. */
const FORWARDED = ['authorization', 'x-api-key', 'content-type', 'accept', 'anthropic-version']

type NodeRequest = {
  method?: string
  url?: string
  headers: Record<string, string | string[] | undefined>
  body?: unknown
  on?: (event: string, listener: (...args: never[]) => void) => void
}

type NodeResponse = {
  statusCode: number
  setHeader: (name: string, value: string) => void
  end: (body?: string) => void
}

function readBody(req: NodeRequest): Promise<string> {
  // Vercel's Node runtime parses JSON bodies for us; a raw stream needs reading.
  if (typeof req.body === 'string') return Promise.resolve(req.body)
  if (req.body && typeof req.body === 'object') return Promise.resolve(JSON.stringify(req.body))
  return new Promise((resolve) => {
    let data = ''
    if (!req.on) return resolve('')
    req.on('data', (chunk: unknown) => {
      data += String(chunk)
    })
    req.on('end', () => resolve(data))
    req.on('error', () => resolve(''))
  })
}

// Vercel's Node runtime gives a Node request/response pair.
export default async function handler(req: NodeRequest, res: NodeResponse) {
  const url = new URL(req.url ?? '/', 'http://cody.local')
  // /api/xkiro/v1/chat/completions → ['', 'api', 'xkiro', 'v1', 'chat', 'completions']
  const [, , provider, ...rest] = url.pathname.split('/')
  const upstreamBase = UPSTREAM[provider]
  if (!upstreamBase) {
    res.statusCode = 404
    res.setHeader('content-type', 'application/json')
    res.end(JSON.stringify({ error: { message: `No forwarder for “${provider}”` } }))
    return
  }

  const outbound = new Headers()
  for (const name of FORWARDED) {
    const value = req.headers[name]
    if (typeof value === 'string') outbound.set(name, value)
  }

  const method = (req.method ?? 'POST').toUpperCase()
  const body = method === 'GET' || method === 'HEAD' ? undefined : await readBody(req)

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 100_000)
  try {
    const upstream = await fetch(`${upstreamBase}/${rest.filter(Boolean).join('/')}${url.search}`, {
      method,
      headers: outbound,
      body,
      signal: controller.signal,
      redirect: 'follow',
    })
    const text = await upstream.text()
    res.statusCode = upstream.status
    res.setHeader('content-type', upstream.headers.get('content-type') ?? 'application/json')
    // Never let a shared cache hold an answer that came from someone's key.
    res.setHeader('cache-control', 'no-store')
    res.end(text)
  } catch (error) {
    res.statusCode = 502
    res.setHeader('content-type', 'application/json')
    res.setHeader('cache-control', 'no-store')
    res.end(
      JSON.stringify({
        error: {
          message: `Could not reach xKiro from the forwarder (${(error as Error)?.message ?? 'network error'})`,
        },
      }),
    )
  } finally {
    clearTimeout(timeout)
  }
}
