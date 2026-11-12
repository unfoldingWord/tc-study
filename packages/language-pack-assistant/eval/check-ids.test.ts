/** `checkIds` and `checkCall` on the client's spec fixture (es-419, Titus): one good and one bad id per kind. No network. */
import { afterAll, beforeAll, expect, test } from 'bun:test'
import { createClient, httpSource, memoryStore, type PackReader } from '@bt-synergy/language-pack-client'
import { type FakeServer, startFakeServer } from '../../language-pack-client/test/fakeServer'
import { buildSample } from '../../language-pack-client/test/sample'
import { checkCall, checkFile, checkIds, lastVerse, strongsOf } from './check-ids'

let reader: PackReader
let server: FakeServer
const bytesOf = (h: string) => Uint8Array.from(h.match(/../g)!, (p) => parseInt(p, 16))

beforeAll(async () => {
  const sample = await buildSample()
  server = startFakeServer(sample, {})
  const client = createClient({
    store: memoryStore(),
    source: httpSource({ base: server.url }),
    trust: { trustedKeys: { [sample.keys.keyId]: bytesOf(sample.keys.publicKey) } },
  })
  await client.install('es-419', { books: ['tit'] })
  reader = await client.open('es-419')
}, 120_000)

afterAll(() => server?.stop())

const verdict = async (id: string) => (await checkIds(reader, [id]))[0]!.ok

test('a verse: the text by key or by its last part, and the verse in that text', async () => {
  const b = (await reader.book('tit'))!
  const res = b.texts[0]!.res
  expect(await verdict(`verse:${res} tit 2:11`)).toBe(true)
  expect(await verdict(`verse:${res.slice(res.lastIndexOf('/') + 1)} tit 2:11`)).toBe(true)
  expect(await verdict(`verse:${res} tit 2:99`)).toBe(false)
  expect(await verdict('verse:nope tit 2:11')).toBe(false)
  expect(await verdict(`verse:${res} rut 1:1`)).toBe(false)
})

test('note, question and link: the row id in the table of the book', async () => {
  const b = (await reader.book('tit'))!
  for (const [kind, table] of [['note', b.notes], ['question', b.questions], ['link', b.links]] as const) {
    expect(await verdict(`${kind}:tit/${table!.rows[0]!.id}`)).toBe(true)
    expect(await verdict(`${kind}:tit/zzzz`)).toBe(false)
  }
  expect(await verdict('note:rut/abcd')).toBe(false)
})

test('a section: the article and the sid', async () => {
  const sections = (await reader.article('tw:kt/grace', 'all')).data!.sections
  expect(await verdict(`section:tw:kt/grace#${sections[0]!.sid}`)).toBe(true)
  expect(await verdict('section:tw:kt/grace#nope')).toBe(false)
  expect(await verdict(`section:tw:kt/nothing#${sections[0]!.sid}`)).toBe(false)
})

test('a concept: the maps name it', async () => {
  expect(await verdict('concept:tw:kt/grace')).toBe(true)
  expect(await verdict('concept:tw:kt/nothing')).toBe(false)
})

test('a rendering: the form is one of the strong number', async () => {
  const r = (await reader.renderings({ strong: 'G5485' })).data!.renderings[0]!
  expect(await verdict(`rendering:G5485/${r.text}`)).toBe(true)
  expect(await verdict('rendering:G5485/no such form')).toBe(false)
})

test('a book and a topic', async () => {
  expect(await verdict('book:tit')).toBe(true)
  expect(await verdict('book:xyz')).toBe(false)
  const m = await reader.mapsOf(['xtopics'], { coreOnly: true })
  const topic = [...(m.xtopics!.core as unknown as { topics: Map<string, unknown> }).topics.keys()][0]!
  expect(await verdict(`topic:${topic}`)).toBe(true)
  expect(await verdict('topic:ev:nothing')).toBe(false)
  expect(await verdict('what:ever')).toBe(false)
})

test('the args of an expected call: refs parse, ids exist', async () => {
  const ok = async (query: Parameters<typeof checkCall>[1]['query'], args: Record<string, unknown>) => (await checkCall(reader, { query, args })).every((c) => c.ok)
  expect(await ok('passage', { ref: 'tit 2:11' })).toBe(true)
  expect(await ok('passage', { ref: 'tit front:intro' })).toBe(true)
  expect(await ok('passage', { ref: 'titus 2:11' })).toBe(false)
  expect(await ok('context', { ref: 'tit 2:99-1' })).toBe(false)
  expect(await ok('concept', { id: 'tw:kt/grace' })).toBe(true)
  expect(await ok('concept', { id: 'tw:kt/nothing' })).toBe(false)
  expect(await ok('article', { id: 'tw:kt/grace' })).toBe(true)
  expect(await ok('article', { id: 'ta:translate/none' })).toBe(false)
  expect(await ok('renderings', { strong: 'G5485' })).toBe(true)
  expect(await ok('renderings', { strong: 'grace' })).toBe(false)
  expect(await ok('renderings', { concept: 'tw:kt/grace' })).toBe(false)
  expect(await ok('books', { concept: 'G5485' })).toBe(true)
  expect(await ok('topics', { category: 'person' })).toBe(true)
  expect(await ok('topics', { category: 'persona' })).toBe(false)
  expect(await ok('books', { concept: 'tw:kt/grace' })).toBe(true)
  expect(await ok('books', { concept: 'tw:kt/grace', article: 'tw:kt/grace' })).toBe(false)
  expect(await ok('search', { text: 'el hijo pródigo' })).toBe(true)
})

test('the last verse of a chapter comes from the installed text', async () => {
  expect(await lastVerse(reader, 'tit', 2)).toBe(15)
  expect(await lastVerse(reader, 'tit', 9)).toBeUndefined()
  expect(await lastVerse(reader, 'rut', 1)).toBeUndefined()
})

test('strongsOf: keys of a concept, catch-alls dropped, most specific first; none for a concept without', async () => {
  const keys = await strongsOf(reader, 'tw:kt/grace')
  expect(keys.length).toBeGreaterThan(0)
  expect(keys).toContain('G54850')
  const core = (await reader.mapsOf(['xmap'], { coreOnly: true })).xmap!.core
  const lists = Object.entries(core.strongs ?? {}).filter(([id]) => id.startsWith('tw:'))
  const seen = new Map<string, number>()
  for (const [, ks] of lists) for (const k of new Set(ks)) seen.set(k, (seen.get(k) ?? 0) + 1)
  const total = (k: string) => [...(core.strong.rows.get(k)?.values() ?? [])].reduce((n, [c]) => n + c, 0)
  // R10c: fewest concepts first, then most occurrences
  for (const [id] of lists) {
    const ks = await strongsOf(reader, id)
    for (let i = 1; i < ks.length; i++) {
      const [p, q] = [ks[i - 1]!, ks[i]!]
      expect(seen.get(p)! < seen.get(q)! || (seen.get(p) === seen.get(q) && total(p) >= total(q))).toBe(true)
    }
  }
  expect(await strongsOf(reader, 'tw:kt/nothing')).toEqual([])
  // the catch-all keys (in more than 2 % of the tW concepts) are dropped
  const common = [...seen].filter(([, n]) => n > lists.length * 0.02).map(([k]) => k)
  expect(common.length).toBeGreaterThan(0)
  for (const [id] of lists) for (const k of await strongsOf(reader, id)) expect(common).not.toContain(k)
})

test('checkFile flags a line whose expect has none of call, choose and search', async () => {
  const lines = [{ q: 'a', expect: { search: true }, pieces: [] }, { q: 'b', expect: {}, pieces: [] }, { q: 'c', pieces: [] }]
  const out = await checkFile(reader, lines.map((l) => JSON.stringify(l)).join('\n'))
  expect(out.filter((r) => !r.check.ok).map((r) => r.line)).toEqual([2, 3])
})
