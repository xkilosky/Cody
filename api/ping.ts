/**
 * A liveness check for the forwarder, and the fastest way to answer "is the
 * functions directory being deployed at all?" — `/api/ping` returning this
 * JSON means it is.
 */
export default function handler(_req: unknown, res: { statusCode: number; setHeader: (n: string, v: string) => void; end: (b: string) => void }) {
  res.statusCode = 200
  res.setHeader('content-type', 'application/json')
  res.setHeader('cache-control', 'no-store')
  res.end(JSON.stringify({ ok: true, forwarders: ['xkiro'] }))
}
