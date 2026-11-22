/**
 * A small client of the MCP server of yaapi.bible (`https://yaapi.bible/mcp`, streamable HTTP, JSON answers) and the snapshot `fetch-yaapi.ts` writes.
 * `list_versions` is asked with the English name of the language (the code is matched loosely); `get_reference` with `"Gen 1:1-500"`, which answers
 * the whole chapter (a bare book or chapter is "Could not parse reference"). The chapters of a book are asked in order until one comes back empty.
 */
export const BOOKS = 'gen exo lev num deu jos jdg rut 1sa 2sa 1ki 2ki 1ch 2ch ezr neh est job psa pro ecc sng isa jer lam ezk dan hos jol amo oba jon mic nam hab zep hag zec mal mat mrk luk jhn act rom 1co 2co gal eph php col 1th 2th 1ti 2ti tit phm heb jas 1pe 2pe 1jn 2jn 3jn jud rev'.split(' ')

/** yaapi's code of a USFM book code: `gen` is `Gen`, `1sa` is `1Sa`. */
export const yaapiBook = (usfm: string): string => usfm[0].toUpperCase() + usfm.slice(1)

export type YaapiVersion = { abbreviation: string; name: string; language: string; scope: string; license: string; copyright: string; link: string }
export type YaapiVerse = { chapter: number; verse: number; text: string }

export type Mcp = {
  listVersions(language: string): Promise<YaapiVersion[]>
  chapter(version: string, book: string, chapter: number): Promise<YaapiVerse[]>
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

export async function connect(o: { url?: string; pauseMs?: number; retries?: number; fetcher?: typeof fetch } = {}): Promise<Mcp> {
  const url = o.url ?? 'https://yaapi.bible/mcp'
  const f = o.fetcher ?? fetch
  const pause = o.pauseMs ?? 250
  const retries = o.retries ?? 4
  let session: string | undefined
  let id = 0
  async function rpc(method: string, params: unknown, notify = false): Promise<any> {
    for (let attempt = 0; ; attempt++) {
      try {
        const res = await f(url, {
          method: 'POST',
          signal: AbortSignal.timeout(60_000),
          headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream', ...(session ? { 'mcp-session-id': session } : {}) },
          body: JSON.stringify(notify ? { jsonrpc: '2.0', method, params } : { jsonrpc: '2.0', id: ++id, method, params }),
        })
        if (res.status === 404 && session) {
          session = undefined
          await init()
          throw new Error('session expired')
        }
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        session = res.headers.get('mcp-session-id') ?? session
        if (notify) return undefined
        const body = JSON.parse(await res.text())
        if (body.error) throw new Error(`MCP error ${JSON.stringify(body.error)}`)
        return body.result
      } catch (e) {
        if (attempt >= retries) throw e
        await sleep(1000 * 2 ** attempt)
      }
    }
  }
  async function init(): Promise<void> {
    await rpc('initialize', { protocolVersion: '2025-03-26', capabilities: {}, clientInfo: { name: 'tc-study-fetch-yaapi', version: '1' } })
    await rpc('notifications/initialized', {}, true)
  }
  await init()
  async function call(name: string, args: Record<string, string>): Promise<string[]> {
    await sleep(pause)
    const r = await rpc('tools/call', { name, arguments: args })
    if (r.isError) throw new Error(`${name} failed: ${JSON.stringify(r.content)}`)
    return (r.content as { text: string }[]).map((c) => c.text)
  }
  return {
    async listVersions(language) {
      return (await call('list_versions', { language })).map((t) => JSON.parse(t) as YaapiVersion)
    },
    async chapter(version, book, chapter) {
      const [text] = await call('get_reference', { version, reference: `${yaapiBook(book)} ${chapter}:1-500` })
      const d = JSON.parse(text) as { verses?: { text: string; chapter: number; verse: number; book: string }[]; error?: string }
      if ((d.verses ?? []).length === 0) {
        // only "Verse not found" ends a book; any other answer is a failure to retry, never a short book
        if (d.error === 'Verse not found') return []
        throw new Error(`${version} ${book} ${chapter}: ${d.error ?? 'no verses'}`)
      }
      return (d.verses ?? []).map((v) => {
        if (v.chapter !== chapter || v.book.toLowerCase() !== book) throw new Error(`${version} ${book} ${chapter}: yaapi answered ${v.book} ${v.chapter}:${v.verse}`)
        return { chapter: v.chapter, verse: v.verse, text: v.text }
      })
    },
  }
}

export type Snapshot = { format: 1; version: YaapiVersion; fetched: string; books: Record<string, YaapiVerse[]> }
