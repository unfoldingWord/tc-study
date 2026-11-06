import { beforeEach, describe, expect, test } from 'bun:test'
import {
  memoryByteStore,
  stagingFrom,
  writePart,
  type CacheRow,
  type PackTarget,
  type PartEntry,
  type PartsList,
  type RawFound,
  type RawRead,
  type RawWrite,
} from '@bt-synergy/language-pack'
import type { ResourceMetadata } from '@bt-synergy/resource-catalog'
import { PACK_VERSIONS } from '@bt-synergy/resource-pipeline/language/packVersions'
import { forgetKeptLists } from './languageParts'
import { usePartsModeStore } from './partsMode'
import { PARTS_COMPAT, syncLanguageForRead } from './readParts'

const SERVER = 'https://packs.example/v2/packs/'
const TN = 'o/en/tn'
const TW = 'o/en/tw'

const meta = (key: string, type: string, subject: string) =>
  ({ resourceKey: key, type, subject, title: key, release: { tag_name: 'v1' } }) as unknown as ResourceMetadata

async function part(kind: PartEntry['kind'], resource: string, key: string, layer: 'sot' | 'text', where: { book?: string } = {}) {
  const written = await writePart([{ layer, key, value: { content: key } }])
  const entry: PartEntry = { sha256: written.sha256, bytes: written.bytes.byteLength, rows: written.rows, kind, resource, ...where, fingerprint: 'f'.repeat(64), layers: [layer] }
  return { entry, bytes: written.bytes }
}

function memoryStores() {
  const rows = new Map<string, unknown>()
  const catalog = new Map<string, ResourceMetadata>()
  const target: PackTarget = {
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
  const registerRows = async (prefix: string) =>
    [...rows].filter(([key]) => key.startsWith(prefix)).map(([key, entry]): CacheRow => ({ key, entry }))
  return { rows, target, registerRows }
}

async function serverWith(sharedAnswers: 'ok' | 429) {
  const tnTit = await part('book', TN, `tn:${TN}:tit:1`, 'sot', { book: 'tit' })
  const tw = await part('titles', TW, `helps-text:titles:${TW}@v1:all`, 'text')
  const list = {
    schema: 2,
    language: 'en',
    compat: PARTS_COMPAT,
    code: 'c+0',
    versions: PACK_VERSIONS,
    resources: [TN, TW].map((key) => ({ key, stamp: 's', role: 'language', subject: key, title: key, metadata: meta(key, key === TN ? 'notes' : 'words', key) })),
    parts: [tnTit.entry, tw.entry],
  } as unknown as PartsList
  const fetch = (async (url: string) => {
    const path = String(url).slice(SERVER.length)
    if (path === `${PARTS_COMPAT}/en`) return new Response(JSON.stringify(list), { status: 200 })
    if (path === `parts/${tnTit.entry.sha256}`) return new Response(tnTit.bytes, { status: 200 })
    if (path === `parts/${tw.entry.sha256}`) return sharedAnswers === 'ok' ? new Response(tw.bytes, { status: 200 }) : new Response(null, { status: 429 })
    return new Response(null, { status: 404 })
  }) as unknown as typeof globalThis.fetch
  return fetch
}

async function sync(fetch: typeof globalThis.fetch) {
  const { rows, target, registerRows } = memoryStores()
  const result = await syncLanguageForRead('en', 'tit', { cache: { getByPrefix: registerRows } as never, catalog: {} as never }, {
    server: SERVER,
    target,
    registerRows,
    staging: stagingFrom(memoryByteStore()),
    client: { fetch },
  })
  return { result, rows }
}

describe('syncLanguageForRead', () => {
  beforeEach(() => {
    forgetKeptLists()
    usePartsModeStore.setState({ modes: {}, progress: {} })
  })

  test('the book and then the shared unit: the language is served as parts, and no progress is left behind', async () => {
    const { result, rows } = await sync(await serverWith('ok'))
    expect(result.kind).toBe('applied')
    expect(rows.has(`tn:${TN}:tit:1`)).toBe(true)
    expect(rows.has(`helps-text:titles:${TW}@v1:all`)).toBe(true)
    expect(usePartsModeStore.getState().modes.en).toBe('parts')
    expect(usePartsModeStore.getState().progress).toEqual({})
  })

  test('the book came but the shared unit has to wait (429): still parts, so Door43 does not take every book whole', async () => {
    const { result, rows } = await sync(await serverWith(429))
    expect(result.kind).toBe('wait')
    expect(rows.has(`tn:${TN}:tit:1`)).toBe(true)
    expect(usePartsModeStore.getState().modes.en).toBe('parts')
  })
})
