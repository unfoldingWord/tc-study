import { beforeEach, describe, expect, test } from 'bun:test'
import {
  memoryByteStore,
  sha256Hex,
  stagingFrom,
  writePart,
  type CacheRow,
  type PackTarget,
  type PackVersions,
  type PartEntry,
  type PartKind,
  type PartRow,
  type PartsList,
  type RawFound,
  type RawRead,
  type RawWrite,
} from '@bt-synergy/language-pack'
import type { ResourceMetadata } from '@bt-synergy/resource-catalog'
import { forgetKeptLists, syncLanguageParts, type SyncDeps } from './languageParts'

const SERVER = 'https://packs.example/v2/packs/'
const COMPAT = 'c'
const NOW = Date.parse('2026-10-29T12:00:00.000Z')
const VERSIONS: PackVersions = { sot: { usjProcessing: '2.3.0-usj' } }
const TN = 'o/en/tn'
const TW = 'o/en/tw'
const UGNT = 'unfoldingWord/el-x-koine/ugnt'

const meta = (key: string, type: string, subject: string) =>
  ({ resourceKey: key, type, subject, title: key, release: { tag_name: 'v1' } }) as unknown as ResourceMetadata
const RESOURCES: Record<string, ResourceMetadata> = {
  [TN]: meta(TN, 'notes', 'TSV Translation Notes'),
  [TW]: meta(TW, 'words', 'Translation Words'),
  [UGNT]: meta(UGNT, 'scripture', 'Greek New Testament'),
}

const row = (key: string): PartRow => ({ layer: key.startsWith('helps-text:') ? 'text' : 'sot', key, value: { content: key } })

async function part(kind: PartKind, resource: string, keys: string[], where: { book?: string; group?: string } = {}) {
  const written = await writePart(keys.map(row))
  const entry: PartEntry = { sha256: written.sha256, bytes: written.bytes.byteLength, rows: written.rows, kind, resource, ...where, fingerprint: 'f'.repeat(64), layers: [...new Set(keys.map((k) => row(k).layer))] }
  return { entry, bytes: written.bytes }
}

function listOf(language: string, parts: Array<{ entry: PartEntry }>, keys: string[], originals?: { path: string; sha256: string }): PartsList {
  return {
    schema: 2,
    language,
    compat: COMPAT,
    code: 'c+0',
    versions: VERSIONS,
    resources: keys.map((key) => ({ key, stamp: 's', role: language === 'originals' ? 'original' : 'language', subject: String(RESOURCES[key].subject), title: key, metadata: RESOURCES[key] })),
    parts: parts.map((p) => p.entry),
    ...(originals ? { originals } : {}),
  } as PartsList
}

/** An in-memory target with the IndexedDB adapter's `transactRaw` (as language-pack's testTarget). */
function memoryTarget() {
  const rows = new Map<string, unknown>()
  const catalog = new Map<string, ResourceMetadata>()
  const target: PackTarget & { rows: typeof rows; catalog: typeof catalog } = {
    rows,
    catalog,
    async putRows(list) {
      for (const r of list) rows.set(r.key, structuredClone(r.entry))
    },
    async existingKeys(keys) {
      return new Set(keys.filter((k) => rows.has(k)))
    },
    async putCatalogRows(list) {
      for (const r of list) catalog.set(r.key, structuredClone(r.metadata))
    },
    async catalogRow(key) {
      return catalog.get(key) ?? null
    },
    async transactRaw(read: RawRead, decide: (found: RawFound) => RawWrite) {
      const found: RawFound = { rows: new Map(), prefixKeys: new Map() }
      for (const key of read.keys) if (rows.has(key)) found.rows.set(key, structuredClone(rows.get(key)))
      const sorted = [...rows.keys()].sort()
      for (const prefix of read.prefixes) found.prefixKeys.set(prefix, sorted.filter((k) => k >= prefix && k <= prefix + '￿'))
      const write = decide(found)
      for (const p of write.puts) rows.set(p.key, structuredClone(p.entry))
      for (const key of write.deletes) rows.delete(key)
    },
  }
  return target
}

/** A fake packs server; `gone` lists part shas it answers 404 for once. */
async function server(parts: Array<{ entry: PartEntry; bytes: Uint8Array }>, originalsParts: Array<{ entry: PartEntry; bytes: Uint8Array }>, gone = new Set<string>()) {
  const originals = listOf('originals', originalsParts, [UGNT])
  const originalsBytes = new TextEncoder().encode(JSON.stringify(originals))
  const originalsSha = await sha256Hex(originalsBytes)
  const list = listOf('en', parts, [TN, TW], { path: `catalog/${COMPAT}/originals/${originalsSha}.json`, sha256: originalsSha })
  const bySha = new Map([...parts, ...originalsParts].map((p) => [p.entry.sha256, p.bytes]))
  const asked: string[] = []
  const fetch = (async (url: string) => {
    const path = String(url).slice(SERVER.length)
    asked.push(path)
    if (path === `${COMPAT}/en`) return new Response(JSON.stringify(list), { status: 200, headers: { ETag: '"1"' } })
    if (path === `${COMPAT}/originals/${originalsSha}`) return new Response(originalsBytes, { status: 200 })
    const sha = path.replace('parts/', '')
    if (gone.delete(sha)) return new Response(null, { status: 404 })
    const bytes = bySha.get(sha)
    return bytes ? new Response(bytes, { status: 200 }) : new Response(null, { status: 404 })
  }) as unknown as typeof globalThis.fetch
  return { fetch, asked }
}

function depsFor(target: ReturnType<typeof memoryTarget>, fetch: typeof globalThis.fetch): SyncDeps {
  return {
    server: SERVER,
    compat: COMPAT,
    target,
    registerRows: async (prefix) =>
      [...target.rows].filter(([key]) => key.startsWith(prefix)).map(([key, entry]): CacheRow => ({ key, entry })),
    staging: stagingFrom(memoryByteStore()),
    versions: VERSIONS,
    client: { fetch },
    now: () => NOW,
  }
}

async function fixture() {
  const tnTit = await part('book', TN, [`tn:${TN}:tit`, `tn:${TN}:tit:1`], { book: 'tit' })
  const tnRut = await part('book', TN, [`tn:${TN}:rut`, `tn:${TN}:rut:1`], { book: 'rut' })
  const tw = await part('titles', TW, [`helps-text:titles:${TW}@v1:all`])
  const ugntTit = await part('original', UGNT, [`scripture-usj:${UGNT}:tit:1`], { book: 'tit' })
  return { tnTit, tnRut, tw, ugntTit }
}

describe('syncLanguageParts', () => {
  beforeEach(forgetKeptLists)

  test('the shared unit and the book asked for come from the server, prepared, with their Greek', async () => {
    const p = await fixture()
    const { fetch, asked } = await server([p.tnTit, p.tnRut, p.tw], [p.ugntTit])
    const target = memoryTarget()

    const result = await syncLanguageParts('en', ['tit'], depsFor(target, fetch))

    expect(result).toMatchObject({ kind: 'applied', parts: 3 })
    expect(target.rows.has(`tn:${TN}:tit:1`)).toBe(true)
    expect(target.rows.has(`helps-text:titles:${TW}@v1:all`)).toBe(true)
    expect(target.rows.has(`scripture-usj:${UGNT}:tit:1`)).toBe(true)
    // Ruth was not asked for: not downloaded.
    expect(target.rows.has(`tn:${TN}:rut:1`)).toBe(false)
    expect(asked.filter((a) => a.startsWith('parts/')).sort()).toEqual([p.tnTit, p.tw, p.ugntTit].map((x) => `parts/${x.entry.sha256}`).sort())
    expect([...target.catalog.keys()].sort()).toEqual([TN, TW, UGNT].sort())
  })

  test('asked again, nothing is downloaded: the list comes back unchanged (ETag) and the plan is empty', async () => {
    const p = await fixture()
    const { fetch, asked } = await server([p.tnTit, p.tw], [p.ugntTit])
    const target = memoryTarget()
    const deps = depsFor(target, fetch)
    await syncLanguageParts('en', ['tit'], deps)
    asked.length = 0

    expect(await syncLanguageParts('en', ['tit'], deps)).toEqual({ kind: 'up-to-date' })
    expect(asked.filter((a) => a.startsWith('parts/'))).toEqual([])
  })

  test('another book later downloads only that book', async () => {
    const p = await fixture()
    const { fetch, asked } = await server([p.tnTit, p.tnRut, p.tw], [p.ugntTit])
    const target = memoryTarget()
    const deps = depsFor(target, fetch)
    await syncLanguageParts('en', ['tit'], deps)
    asked.length = 0

    expect(await syncLanguageParts('en', ['rut'], deps)).toMatchObject({ kind: 'applied', parts: 1 })
    expect(asked.filter((a) => a.startsWith('parts/'))).toEqual([`parts/${p.tnRut.entry.sha256}`])
    expect(target.rows.has(`tn:${TN}:rut:1`)).toBe(true)
  })

  test('a part the server no longer has asks for the list again, once', async () => {
    const p = await fixture()
    const { fetch, asked } = await server([p.tnTit, p.tw], [p.ugntTit], new Set([p.tw.entry.sha256]))
    const target = memoryTarget()

    expect(await syncLanguageParts('en', ['tit'], depsFor(target, fetch))).toMatchObject({ kind: 'applied' })
    expect(asked.filter((a) => a === `${COMPAT}/en`)).toHaveLength(2)
  })

  test('a language the server does not have is said, and nothing is written', async () => {
    const fetch = (async () => new Response(JSON.stringify({ error: 'no packs for this language' }), { status: 404 })) as unknown as typeof globalThis.fetch
    const target = memoryTarget()
    expect(await syncLanguageParts('xx', ['tit'], depsFor(target, fetch))).toEqual({ kind: 'no-language' })
    expect(target.rows.size).toBe(0)
  })

  test('a part that fails to arrive applies nothing', async () => {
    const p = await fixture()
    const { fetch: serve } = await server([p.tnTit, p.tw], [p.ugntTit])
    const fetch = (async (url: string) =>
      String(url).includes(`parts/${p.tnTit.entry.sha256}`) ? new Response(null, { status: 500 }) : serve(url)) as unknown as typeof globalThis.fetch
    const target = memoryTarget()
    expect(await syncLanguageParts('en', ['tit'], depsFor(target, fetch))).toMatchObject({ kind: 'failed' })
    expect([...target.rows.keys()].some((k) => k.startsWith('tn:'))).toBe(false)
  })
})
