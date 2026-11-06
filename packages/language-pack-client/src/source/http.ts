import { ClientError } from '../errors'

/** Where a client gets catalogs and segments from. `name` is a language tag or `common`. */
export interface PackSource {
  catalog(name: string, o?: { etag?: string; signal?: AbortSignal }): Promise<{ bytes: Uint8Array; etag?: string } | 'not-modified'>
  segment(id: string, signal?: AbortSignal): Promise<Uint8Array>
}

/** The packs Worker over HTTP (`spec/serving.md`): `/v3/packs/{lang}/catalog`, `/v3/packs/common/catalog`, `/v3/packs/seg/{id}`. */
export function httpSource(o: { base: string; fetch?: typeof fetch }): PackSource {
  const base = o.base.replace(/\/+$/, '')
  const doFetch: typeof fetch = o.fetch ?? ((input, init) => fetch(input, init))

  async function get(path: string, headers: Record<string, string>, signal?: AbortSignal): Promise<Response> {
    try {
      return await doFetch(`${base}${path}`, { method: 'GET', headers, signal })
    } catch (e) {
      if (signal?.aborted) throw e
      throw new ClientError('E_NETWORK', e instanceof Error ? e.message : String(e))
    }
  }

  async function body(res: Response, signal?: AbortSignal): Promise<Uint8Array> {
    try {
      const bytes = new Uint8Array(await res.arrayBuffer())
      // Some runtimes hand over a body cut short by a dropped connection without failing: Content-Length tells.
      const declared = res.headers.get('Content-Length')
      if (declared !== null && /^\d+$/.test(declared) && Number(declared) !== bytes.length && res.headers.get('Content-Encoding') === null) {
        throw new Error(`got ${bytes.length} of ${declared} bytes`)
      }
      return bytes
    } catch (e) {
      if (signal?.aborted) throw e
      throw new ClientError('E_NETWORK', `the body could not be read: ${e instanceof Error ? e.message : String(e)}`, { status: res.status })
    }
  }

  async function fail(res: Response, catalog: boolean): Promise<never> {
    if (res.status === 404 && catalog) {
      const text = await res.text().catch(() => '')
      if (/catalog not found/.test(text)) throw new ClientError('E_NO_PACK', 'the language has no format 3 pack yet', { status: 404 })
    }
    if (res.status === 429) {
      const header = res.headers.get('Retry-After')
      const seconds = header === null ? NaN : Number(header)
      throw new ClientError('E_NETWORK', 'rate limited', { status: 429, ...(Number.isFinite(seconds) ? { retryAfter: seconds } : {}) })
    }
    throw new ClientError('E_NETWORK', `HTTP ${res.status}`, { status: res.status })
  }

  return {
    async catalog(name, opts = {}) {
      const headers: Record<string, string> = {}
      if (opts.etag !== undefined) headers['If-None-Match'] = opts.etag
      const res = await get(`/v3/packs/${encodeURIComponent(name)}/catalog`, headers, opts.signal)
      if (res.status === 304) return 'not-modified'
      if (!res.ok) return fail(res, true)
      const bytes = await body(res, opts.signal)
      const etag = res.headers.get('ETag')
      return etag === null ? { bytes } : { bytes, etag }
    },
    async segment(id, signal) {
      const res = await get(`/v3/packs/seg/${encodeURIComponent(id)}`, {}, signal)
      if (!res.ok) return fail(res, false)
      return body(res, signal)
    },
  }
}
