import { afterEach, beforeAll, describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { artSegment, writeSegment } from '@bt-synergy/language-pack-v3'
import { createClient } from '../client'
import { openFromSegments } from '../reader'
import { httpSource } from '../source/http'
import { memoryStore } from '../store/memory'
import type { VerifiedCatalog } from '../verify'
import { type FakeServer, startFakeServer } from '../../test/fakeServer'
import { buildSample, type Sample } from '../../test/sample'

let sample: Sample
let trust: { trustedKeys: Record<string, Uint8Array> }
const bytesOf = (h: string) => Uint8Array.from(h.match(/../g)!, (p) => parseInt(p, 16))
let server: FakeServer | undefined
afterEach(() => server?.stop())

beforeAll(async () => {
  sample = await buildSample()
  trust = { trustedKeys: { [sample.keys.keyId]: bytesOf(sample.keys.publicKey) } }
}, 120_000)

async function installed(books: string[]) {
  server?.stop()
  server = startFakeServer(sample, {})
  const client = createClient({ store: memoryStore(), source: httpSource({ base: server.url }), trust })
  await client.install('es-419', { books })
  return client.open('es-419')
}

const FIXTURE = join(import.meta.dir, '..', '..', '..', 'language-pack-v3', 'spec', 'tests', 'articulo-mal-titulado')

describe('article', () => {
  test('related: the spec case 21, each id with its title', async () => {
    const dir = join(import.meta.dir, '..', '..', '..', 'language-pack-v3', 'spec', 'tests', 'articulos-relacionados')
    const bytes = new Uint8Array(readFileSync(join(dir, 'art.seg')))
    const { id } = JSON.parse(readFileSync(join(dir, 'art.expected.json'), 'utf8')) as { id: string }
    const catalog = {
      id: 'x',
      bytes: new Uint8Array(),
      name: 'es-419',
      publisher: 'x',
      revision: 1,
      origin: 'published',
      catalog: {
        lang: 'es-419',
        about: { revision: 1 },
        resources: [],
        segments: [{ id: bytesOf(id), class: 'art', group: 'ta:translate', size: bytes.length, ulen: 0, inputs: new Uint8Array() }],
        units: [{ id: 'art:ta:translate', segments: [0] }],
      },
    } as unknown as VerifiedCatalog
    const r = openFromSegments({ lang: 'es-419', catalogs: [catalog], get: async (want) => (want === id ? bytes : undefined) })
    const metaphor = await r.article('ta:translate/figs-metaphor')
    expect(metaphor.data!.related).toEqual([
      { id: 'ta:translate/bita-part1', title: 'Imaginería bíblica: patrones comunes' },
      { id: 'ta:translate/figs-exmetaphor', title: 'Metáforas extendidas' },
      { id: 'ta:translate/figs-simetaphor', title: 'Metáfora simple' },
    ])
    expect((await r.article('ta:translate/figs-simetaphor')).data!.related).toEqual([{ id: 'ta:translate/figs-metaphor', title: 'Metáfora' }])
  })

  test('related: a title from another installed group, and no title when that group is not installed', async () => {
    const TA = 'es-419_gl/es-419/ta'
    const section = { sid: 'intro', level: 0, role: 'intro' as const, lang: 'es-419', md: 'x' }
    const translate = await writeSegment(
      artSegment('es-419', 'ta:translate', [[TA, 'v4']], [{ id: 'ta:translate/a', res: TA, title: 'A', related: ['ta:checking/b', 'ta:process/c'], sections: [section] }]),
    )
    const checking = await writeSegment(artSegment('es-419', 'ta:checking', [[TA, 'v4']], [{ id: 'ta:checking/b', res: TA, title: 'B', related: ['ta:translate/a'], sections: [section] }]))
    const segments = [
      { id: bytesOf(translate.id), class: 'art', group: 'ta:translate', size: translate.bytes.length, ulen: 0, inputs: new Uint8Array() },
      { id: bytesOf(checking.id), class: 'art', group: 'ta:checking', size: checking.bytes.length, ulen: 0, inputs: new Uint8Array() },
      { id: bytesOf('00'.repeat(32)), class: 'art', group: 'ta:process', size: 10, ulen: 0, inputs: new Uint8Array() },
    ]
    const catalog = {
      id: 'x',
      bytes: new Uint8Array(),
      name: 'es-419',
      publisher: 'x',
      revision: 1,
      origin: 'published',
      catalog: {
        lang: 'es-419',
        about: { revision: 1 },
        resources: [],
        segments,
        units: [
          { id: 'art:ta:translate', segments: [0] },
          { id: 'art:ta:checking', segments: [1] },
          { id: 'art:ta:process', segments: [2] },
        ],
      },
    } as unknown as VerifiedCatalog
    const files = new Map([
      [translate.id, translate.bytes],
      [checking.id, checking.bytes],
    ])
    const r = openFromSegments({ lang: 'es-419', catalogs: [catalog], get: async (id) => files.get(id) })
    expect((await r.article('ta:translate/a')).data!.related).toEqual([{ id: 'ta:checking/b', title: 'B' }, { id: 'ta:process/c' }])
  })

  test('the spec fixture, loaded with openFromSegments over a catalog the test builds: sections and otherLang', async () => {
    const bytes = new Uint8Array(readFileSync(join(FIXTURE, 'art.seg')))
    const expected = JSON.parse(readFileSync(join(FIXTURE, 'art.expected.json'), 'utf8')) as { id: string; articles: { sections: { sid: string }[] }[] }
    const catalog = {
      id: 'x',
      bytes: new Uint8Array(),
      name: 'es-419',
      publisher: 'x',
      revision: 1,
      origin: 'published',
      catalog: {
        lang: 'es-419',
        about: { revision: 1 },
        resources: [],
        segments: [{ id: bytesOf(expected.id), class: 'art', group: 'tw:kt', size: bytes.length, ulen: 0, inputs: new Uint8Array() }],
        units: [{ id: 'art:tw:kt', segments: [0] }],
      },
    } as unknown as VerifiedCatalog
    const r = openFromSegments({ lang: 'es-419', catalogs: [catalog], get: async (id) => (id === expected.id ? bytes : undefined) })
    const all = await r.article('tw:kt/faith', 'all')
    expect(all.data!.title).toBe('fe')
    expect(all.data!.sections.map((s) => s.sid)).toEqual(expected.articles[0]!.sections.map((s) => s.sid))
    expect(all.data!.sections.map((s) => s.otherLang)).toEqual([false, false, false, true])
    expect(all.data!.more).toEqual([])
    expect(all.cites[0]).toEqual({ res: 'es-419_gl/es-419/tw', release: 'v37', id: 'tw:kt/faith', section: 'intro' })
    const def = await r.article('tw:kt/faith')
    expect(def.data!.sections.map((s) => s.sid)).toEqual(['definition'])
    expect(def.data!.more.map((m) => m.sid)).toEqual(['intro', 's1', 'translation-suggestions'])
    expect(def.data!.more[2]).toEqual({ sid: 'translation-suggestions', title: 'Translation Suggestions', role: 'translation-suggestions' })
    expect((await r.article('tw:kt/faith', 'translation-suggestions')).data!.sections[0]!.otherLang).toBe(true)
  })

  test('a tW article gives its definition by default and the rest in more; all gives all', async () => {
    const r = await installed(['tit'])
    const a = await r.article('tw:kt/believe')
    expect(a.data!.sections.map((s) => s.role)).toEqual(['definition'])
    expect(a.data!.more.length).toBeGreaterThan(0)
    expect(a.revision.units['art:tw:kt']).toBe(1)
    const all = await r.article('tw:kt/believe', 'all')
    expect(all.data!.sections.length).toBe(a.data!.sections.length + a.data!.more.length)
    expect(all.data!.sections.every((s) => !s.otherLang)).toBe(true)
  })

  test('an article whose group is not installed', async () => {
    const r = await installed(['tit'])
    const a = await r.article('tw:names/paul')
    expect(a.data).toBeNull()
    expect(a.notInstalled).toEqual([{ unit: 'art:tw:names', bytes: 0, what: 'tw:names/paul' }])
  })
})

describe('context', () => {
  test('the passage, a concept with its article and the books not installed', async () => {
    const r = await installed(['tit'])
    const c = await r.context('tit 1:1-4')
    expect(c.query).toBe('context')
    expect(c.data!.passage.book).toBe('tit')
    expect(c.data!.concepts.length).toBeGreaterThan(0)
    const withArticle = c.data!.concepts.filter((x) => x.article !== null)
    expect(withArticle.length).toBeGreaterThan(0)
    expect(withArticle[0]!.article!.sections.length).toBeGreaterThan(0)
    expect(c.notInstalled.some((n) => n.unit.startsWith('art:'))).toBe(true)
    expect(c.notInstalled.every((n, i) => c.notInstalled.findIndex((m) => m.unit === n.unit) === i)).toBe(true)
    expect(c.revision.units['book:tit']).toBe(1)
  })

  test('a book that is not installed gives null and its entry', async () => {
    const r = await installed([])
    const c = await r.context('tit 1:1')
    expect(c.data).toBeNull()
    expect(c.notInstalled[0]!.unit).toBe('book:tit')
  })
})
