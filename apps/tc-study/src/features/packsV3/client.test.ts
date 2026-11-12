import { afterEach, beforeEach, describe, expect, it, spyOn } from 'bun:test'
import { memoryStore } from '@bt-synergy/language-pack-client'
import { createPacksV3, forgetReadersV3, packsV3, readerV3, resetPacksV3 } from './client'
import { V3_ORIGIN_STAGING } from './packsFormat'
import { buildSample, fakeFetch } from './testing/sample'

const g = globalThis as unknown as { location?: { search: string }; localStorage?: Storage; indexedDB?: unknown }
const saved = { location: g.location, localStorage: g.localStorage, indexedDB: g.indexedDB }
const opened: string[] = []

function setServer(server: 'staging' | 'production') {
  const m = new Map<string, string>([['tc-study:packs-server', server]])
  g.localStorage = {
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => void m.set(k, v),
    removeItem: (k: string) => void m.delete(k),
  } as Storage
  g.location = { search: '' }
}

beforeEach(() => {
  opened.length = 0
  g.indexedDB = { open: (name: string) => (opened.push(name), { onerror: null }) }
})
afterEach(() => {
  g.location = saved.location
  g.localStorage = saved.localStorage
  g.indexedDB = saved.indexedDB
  resetPacksV3()
})

describe('format 2 (production)', () => {
  it('packsV3() throws and no IndexedDB database is opened', () => {
    setServer('production')
    const open = spyOn(g.indexedDB as { open: (n: string) => unknown }, 'open')
    expect(() => packsV3()).toThrow('format 3 is off')
    expect(open).not.toHaveBeenCalled()
    expect(opened).toEqual([])
  })
})

describe('format 3 (staging)', () => {
  it('installs a signed sample and reads a passage with a note', async () => {
    setServer('staging')
    const sample = await buildSample()
    const fetch = fakeFetch(sample)
    const client = await createPacksV3({ fetch, store: memoryStore(), trustedKeys: { [sample.keyId]: sample.publicKey } })
    await client.refresh('es-419')
    const report = await client.install('es-419', { books: ['tit'] })
    expect(report.activated.some((k) => k.endsWith('book:tit'))).toBe(true)
    expect(fetch.urls.every((u) => u.startsWith(`${V3_ORIGIN_STAGING}/v3/packs/`))).toBe(true)
    expect(opened).toEqual([])
  }, 30_000)

  it('readerV3 answers for an installed language and is null for another', async () => {
    setServer('staging')
    const sample = await buildSample()
    const client = await packsV3({ fetch: fakeFetch(sample), store: memoryStore(), trustedKeys: { [sample.keyId]: sample.publicKey } })
    expect(await packsV3()).toBe(client)
    await client.install('es-419', { books: ['tit'] })
    const reader = await readerV3('es-419')
    expect(reader).not.toBeNull()
    const answer = await reader!.passage('tit 1:1')
    expect(answer.data!.texts.length).toBeGreaterThan(0)
    expect(JSON.stringify(answer.data)).toMatch(/note/i)
    expect(await readerV3('es-419')).toBe(reader)
    expect(await readerV3('fr')).toBeNull()
    forgetReadersV3()
    expect(await readerV3('es-419')).not.toBe(reader)
  }, 30_000)
})
