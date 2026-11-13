import { afterEach, beforeEach, describe, expect, it } from 'bun:test'
import { memoryStore } from '@bt-synergy/language-pack-client'
import type { ResourceMetadata } from '@bt-synergy/resource-catalog'
import { createPacksV3 } from './client'
import { ensureLanguageV3, keysForDoor43, readV3Mode, resetReadV3, type ReadV3Deps, type ReadV3Mode } from './readV3'
import type { CacheAdapter, CatalogAdapter } from './syncV3'
import { buildSample, fakeFetch } from './testing/sample'

const g = globalThis as unknown as { location?: { search: string }; localStorage?: Storage }
const saved = { location: g.location, localStorage: g.localStorage }
const GLT = 'es-419_gl/es-419/glt'

function setServer(server: 'staging' | 'production'): void {
  const m = new Map<string, string>()
  g.localStorage = { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v) } as Storage
  g.location = { search: `?packs=${server}` }
}

/** The sample (es-419 Titus + common), served by a fake fetch; en and pt have no pack. */
async function setup() {
  const sample = await buildSample()
  const fetch = fakeFetch(sample)
  const rows = new Map<string, unknown>()
  const catalogRows = new Map<string, ResourceMetadata>()
  const cache: CacheAdapter = {
    get: async (k) => rows.get(k) ?? null,
    getByPrefix: async (p) => [...rows].filter(([k]) => k.startsWith(p)).map(([key, entry]) => ({ key, entry })),
    putRawMany: async (rs) => void rs.forEach((r) => rows.set(r.key, r.entry)),
    deleteMany: async (ks) => void ks.forEach((k) => rows.delete(k)),
  }
  const catalog: CatalogAdapter = { get: async (k) => catalogRows.get(k) ?? null, set: async (k, m) => void catalogRows.set(k, m) }
  let opened = 0
  const client = createPacksV3({ fetch, store: memoryStore(), trustedKeys: { [sample.keyId]: sample.publicKey } })
  const deps: ReadV3Deps = { client: () => (opened++, client), cache, catalog }
  return { deps, rows, catalogRows, fetch, opened: () => opened }
}
const keysOf = (rows: Map<string, unknown>, prefix: string) => [...rows.keys()].filter((k) => k.startsWith(prefix))
const settle = () => new Promise((r) => setTimeout(r, 0))

beforeEach(() => resetReadV3())
afterEach(() => {
  resetReadV3()
  g.location = saved.location
  g.localStorage = saved.localStorage
})

describe('ensureLanguageV3', () => {
  it('format 2 does nothing: no client, no request, no rows', async () => {
    setServer('production')
    const t = await setup()
    expect(await ensureLanguageV3('es-419', 'tit', t.deps)).toBe('door43')
    expect(readV3Mode('es-419')).toBe('door43')
    expect(t.opened()).toBe(0)
    expect(t.fetch.urls).toEqual([])
    expect(t.rows.size).toBe(0)
  })

  it('es-419 Titus is v3 and its rows land', async () => {
    setServer('staging')
    const t = await setup()
    const first = ensureLanguageV3('es-419', 'tit', t.deps)
    expect(readV3Mode('es-419')).toBe('checking')
    expect(await first).toBe('v3')
    expect(readV3Mode('es-419')).toBe('v3')
    expect(keysOf(t.rows, `scripture-usj:${GLT}:tit`).length).toBeGreaterThan(3)
    expect(t.catalogRows.has(GLT)).toBe(true)
    await settle()
  }, 120_000)

  it('Genesis, which the pack lacks, goes to Door43 with no format 3 rows for it', async () => {
    setServer('staging')
    const t = await setup()
    expect(await ensureLanguageV3('es-419', 'gen', t.deps)).toBe('door43')
    expect(readV3Mode('es-419')).toBe('door43')
    expect(keysOf(t.rows, 'scripture-usj:')).toEqual([])
    expect(keysOf(t.rows, 'tn:')).toEqual([])
  }, 120_000)

  it('helps in pt (no pack) are Door43 while the es-419 text is v3', async () => {
    setServer('staging')
    const t = await setup()
    const [text, helps] = await Promise.all([ensureLanguageV3('es-419', 'tit', t.deps), ensureLanguageV3('pt', 'tit', t.deps)])
    expect([text, helps]).toEqual(['v3', 'door43'])
    expect(keysOf(t.rows, `tn:es-419_gl/es-419/tn:tit`).length).toBeGreaterThan(1)
    expect(keysOf(t.rows, 'tn:').every((k) => k.includes('/es-419/'))).toBe(true)
    // Door43's download keeps pt and drops what format 3 serves, originals included.
    const keys = [GLT, 'es-419_gl/es-419/tn', 'pt_gl/pt/tn', 'unfoldingWord/el-x-koine/ugnt']
    expect(keysForDoor43(keys, 'es-419')).toEqual(['pt_gl/pt/tn'])
    await settle()
  }, 120_000)

  it('after a book change the language follows the book it has', async () => {
    setServer('staging')
    const t = await setup()
    expect(await ensureLanguageV3('es-419', 'tit', t.deps)).toBe('v3')
    expect(await ensureLanguageV3('es-419', 'gen', t.deps)).toBe('door43')
    expect(readV3Mode('es-419')).toBe('door43')
    expect(await ensureLanguageV3('es-419', 'tit', t.deps)).toBe('v3')
    expect(readV3Mode('es-419')).toBe('v3')
    await settle()
  }, 120_000)
})

describe('keysForDoor43 (the background download gate)', () => {
  const keys = ['x/es-419/glt', 'x/es-419/tn', 'x/pt/tn', 'unfoldingWord/el-x-koine/ugnt', 'unfoldingWord/hbo/uhb']
  const modes = (m: Record<string, ReadV3Mode>) => (lang: string) => m[lang] ?? 'door43'

  it('skips the resources of a v3 or checking language and the originals', () => {
    expect(keysForDoor43(keys, 'es-419', modes({ 'es-419': 'v3' }))).toEqual(['x/pt/tn'])
    expect(keysForDoor43(keys, 'es-419', modes({ 'es-419': 'checking' }))).toEqual(['x/pt/tn'])
  })
  it('keeps everything for languages with no pack', () => {
    expect(keysForDoor43(keys, 'es-419', modes({}))).toEqual(keys)
  })
  it('skips a v3 helps language but keeps the originals of a Door43 text language', () => {
    expect(keysForDoor43(keys, 'es-419', modes({ pt: 'v3' }))).toEqual(['x/es-419/glt', 'x/es-419/tn', 'unfoldingWord/el-x-koine/ugnt', 'unfoldingWord/hbo/uhb'])
  })
})
