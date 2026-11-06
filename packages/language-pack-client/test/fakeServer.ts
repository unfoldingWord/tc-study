/**
 * Test helper: a local server that answers the way `spec/serving.md` says a client sees the packs Worker.
 * Bun only (`Bun.serve`), bound to 127.0.0.1. Range requests are answered with 200 (a client does not need 206/416).
 */
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { Sample } from './sample'

export type Content = Sample | { bucketDir: string }
export type FailSegment = (id: string, n: number) => 'ok' | 404 | 'drop' | 'corrupt'
export type FakeServer = { url: string; hits: string[]; set(content: Content): void; stop(): void }

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
  'Access-Control-Allow-Headers': 'Range, If-None-Match',
  'Access-Control-Expose-Headers': 'ETag, Content-Range, Content-Length, Accept-Ranges, Retry-After',
}
const LANG = /^[a-z]{2,3}(-[a-z0-9]{1,8})*$/
const ID = /^[0-9a-f]{64}$/
const ALIASES: Record<string, string> = { es: 'es-419' }
/** The language the sample's language catalog is (`buildSample` makes es-419). */
const SAMPLE_LANG = 'es-419'

const json = (status: number, body: unknown, extra: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...CORS, ...extra } })

async function etagOf(bytes: Uint8Array): Promise<string> {
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))
  return `"${[...digest].map((b) => b.toString(16).padStart(2, '0')).join('').slice(0, 32)}"`
}

function matches(header: string | null, etag: string): boolean {
  if (header === null) return false
  return header.split(',').some((t) => {
    const tag = t.trim().replace(/^W\//, '')
    return tag === '*' || tag === etag
  })
}

function lookup(content: Content, kind: 'catalog' | 'seg', key: string): Uint8Array | undefined {
  if ('bucketDir' in content) {
    const path = join(content.bucketDir, 'v3', kind === 'catalog' ? 'catalog' : 'seg', `${key}.seg`)
    return existsSync(path) ? new Uint8Array(readFileSync(path)) : undefined
  }
  if (kind === 'seg') return content.segments.get(key)
  if (key === 'common') return content.commonCatalog
  return key === SAMPLE_LANG ? content.langCatalog : undefined
}

export function startFakeServer(initial: Content, o: { failSegment?: FailSegment; noCommon?: boolean } = {}): FakeServer {
  let content = initial
  const hits: string[] = []
  const segCount = new Map<string, number>()

  async function handle(req: Request): Promise<Response> {
    const url = new URL(req.url)
    hits.push(url.pathname)
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS })
    if (req.method !== 'GET' && req.method !== 'HEAD') return json(405, { error: 'method not allowed' }, { Allow: 'GET, HEAD, OPTIONS' })
    if (!url.pathname.startsWith('/v3/packs/')) return json(404, { error: 'not found' })

    const parts = url.pathname.slice('/v3/packs/'.length).split('/')
    const bad = () => json(400, { error: 'bad pack path' })
    if (parts.length !== 2) return bad()
    const [first, second] = parts
    let kind: 'catalog' | 'seg'
    let key: string
    if (first === 'seg' && second !== 'catalog') {
      if (!ID.test(second)) return bad()
      kind = 'seg'
      key = second
    } else {
      if (second !== 'catalog') return bad()
      const lower = first.toLowerCase()
      if (lower !== 'common' && !LANG.test(lower)) return bad()
      kind = 'catalog'
      key = ALIASES[lower] ?? lower
    }

    let bytes: Uint8Array | undefined
    let failure: ReturnType<FailSegment> = 'ok'
    if (kind === 'catalog') {
      bytes = key === 'common' && o.noCommon === true ? undefined : lookup(content, 'catalog', key)
      if (bytes === undefined) return json(404, { error: 'catalog not found' })
    } else {
      const n = (segCount.get(key) ?? 0) + 1
      segCount.set(key, n)
      failure = o.failSegment?.(key, n) ?? 'ok'
      bytes = failure === 404 ? undefined : lookup(content, 'seg', key)
      if (bytes === undefined) return json(404, { error: 'segment not found' })
    }

    const etag = await etagOf(bytes)
    const headers: Record<string, string> = {
      ETag: etag,
      'Cache-Control': kind === 'catalog' ? 'no-cache, no-transform' : 'public, max-age=31536000, immutable, no-transform',
      ...CORS,
    }
    if (kind === 'seg') headers['Accept-Ranges'] = 'bytes'
    if (matches(req.headers.get('If-None-Match'), etag)) return new Response(null, { status: 304, headers })
    headers['Content-Type'] = 'application/octet-stream'
    if (req.method === 'HEAD') {
      headers['Content-Length'] = String(bytes.length)
      return new Response(null, { status: 200, headers })
    }
    if (failure === 'corrupt') {
      bytes = bytes.slice()
      const at = bytes.length >> 1
      bytes[at] = bytes[at] ^ 0xff
    }
    if (failure === 'drop') {
      // No answer: the server closes the idle connection after one second and the client's fetch fails.
      server.timeout(req, 1)
      return new Promise<Response>(() => {})
    }
    return new Response(bytes, { status: 200, headers })
  }

  const server = Bun.serve({ port: 0, hostname: '127.0.0.1', fetch: handle })
  return {
    url: `http://127.0.0.1:${server.port}`,
    hits,
    set(next) {
      content = next
    },
    stop() {
      void server.stop(true)
    },
  }
}
