import { afterEach, beforeAll, describe, expect, test } from 'bun:test'
import { artSegment, type BookModel, bookSegment, type HelpRow, writeSegment } from '@bt-synergy/language-pack-v3'
import { createClient } from './client'
import { patchedReader } from './patch'
import { openFromSegments, type PackReader } from './reader'
import { httpSource } from './source/http'
import { memoryStore } from './store/memory'
import type { VerifiedCatalog } from './verify'
import { type FakeServer, startFakeServer, type WithCatalogs } from '../test/fakeServer'
import { aquiferRow, PATCH, withPatch } from '../test/patch'
import { buildSample, type Sample } from '../test/sample'

const bytesOf = (h: string) => Uint8Array.from(h.match(/../g)!, (p) => parseInt(p, 16))
const row = (id: string, from: number, concept?: string): HelpRow => ({ id, ref: '1:1', from, to: from, ...(concept !== undefined ? { concept } : {}), cols: { note: `row ${id}` } })

const TIT = 56001001
const RUT = 8001001
type Fix = { catalog: VerifiedCatalog; get: (id: string) => Promise<Uint8Array | undefined> }

/** Builds a hand-made catalog (one unit per segment) and its bytes. `lists` are units the catalog lists but whose bytes are missing. */
async function fixture(lang: string, parts: { unit: string; seg: Parameters<typeof writeSegment>[0]; group?: string; book?: string }[], resources: object[], lists: string[] = []): Promise<Fix> {
  const written = await Promise.all(parts.map((p) => writeSegment(p.seg)))
  const entries = parts.map((p, i) => ({ id: bytesOf(written[i]!.id), class: p.seg.h.class, ...(p.group ? { group: p.group } : {}), ...(p.book ? { book: p.book } : {}), size: written[i]!.bytes.length, ulen: 0, inputs: new Uint8Array() }))
  const missing = lists.map((u, i) => ({ id: bytesOf((100 + i).toString(16).padStart(64, '0')), class: 'book', book: u.slice(5), size: 321, ulen: 0, inputs: new Uint8Array() }))
  const catalog = {
    id: 'x',
    bytes: new Uint8Array(),
    name: lang,
    publisher: 'x',
    revision: 1,
    origin: 'published',
    catalog: {
      lang,
      about: { revision: 1 },
      resources,
      segments: [...entries, ...missing],
      units: [...parts.map((p, i) => ({ id: p.unit, segments: [i] })), ...lists.map((u, i) => ({ id: u, segments: [parts.length + i] }))],
    },
  } as unknown as VerifiedCatalog
  const bytes = new Map(written.map((w) => [w.id, w.bytes]))
  return { catalog, get: async (id) => bytes.get(id) }
}

const ORIG: [string, string] = ['unfoldingWord/el-x-koine/ugnt', 'g1']
const sec = (sid: string, role: 'description') => ({ sid, level: 1, role, lang: 'hi', md: `${sid} body` })

let base: PackReader
let patch: PackReader
let bareSource: PackReader

beforeAll(async () => {
  // The base language: Titus with notes only (no questions, no links), a tA group, and Ruth listed but not available.
  const tit: BookModel = {
    lang: 'hi',
    book: 'tit',
    orig: ORIG,
    res: [['door43/hi/tn', 'v1']],
    texts: [],
    notes: { res: 'door43/hi/tn', rows: [row('base-n1', TIT, 'ta:translate/figs-metaphor')] },
  }
  const art = artSegment('hi', 'ta:translate', [['door43/hi/ta', 'v2']], [{ id: 'ta:translate/figs-metaphor', res: 'door43/hi/ta', title: 'Metaphor', sections: [sec('d', 'description')] }])
  const b = await fixture('hi', [{ unit: 'book:tit', seg: bookSegment(tit), book: 'tit' }, { unit: 'art:ta:translate', seg: art, group: 'ta:translate' }], [], ['book:rut'])
  base = openFromSegments({ lang: 'hi', catalogs: [b.catalog], get: b.get })

  // The patch: Titus with notes AND questions (the notes must lose to the base), and Ruth with notes (the base lacks the book).
  const aq = (book: string, kinds: ('notes' | 'questions')[], from: number): BookModel => ({
    lang: PATCH,
    book,
    orig: ORIG,
    res: [['aquifer/hi/tn', 'UWTranslationNotes@abc'], ['aquifer/hi/tq', 'UWTranslationQuestions@abc']],
    texts: [],
    ...(kinds.includes('notes') ? { notes: { res: 'aquifer/hi/tn', rows: [aquiferRow(`aq-n-${book}`, from, 'ta:translate/figs-metaphor')] } } : {}),
    ...(kinds.includes('questions') ? { questions: { res: 'aquifer/hi/tq', rows: [aquiferRow(`aq-q-${book}`, from)] } } : {}),
  })
  const resources = (['tn', 'tq'] as const).map((k) => ({
    key: `aquifer/hi/${k}`,
    title: k,
    subject: k,
    release: k === 'tn' ? 'UWTranslationNotes@abc' : 'UWTranslationQuestions@abc',
    license: 'CC-BY-SA-4.0',
    rights: '© 2022 unfoldingWord; adapted by Mission Mutual',
    attribution: `Adapted by Mission Mutual ${k}`,
    source: 'aquifer',
    review: k === 'tn' ? 'professional' : 'community',
  }))
  const p = await fixture(PATCH, [{ unit: 'book:tit', seg: bookSegment(aq('tit', ['notes', 'questions'], TIT)), book: 'tit' }, { unit: 'book:rut', seg: bookSegment(aq('rut', ['notes'], RUT)), book: 'rut' }], resources)
  patch = openFromSegments({ lang: PATCH, catalogs: [p.catalog], get: p.get })
  // The same books under a catalog that lists no resource entry at all.
  const bare = { ...p.catalog, catalog: { ...p.catalog.catalog, resources: [] } } as VerifiedCatalog
  bareSource = openFromSegments({ lang: PATCH, catalogs: [bare], get: p.get })
})

const mark = (res: 'tn' | 'tq', review: string) => ({
  patch: PATCH,
  source: 'aquifer',
  review,
  license: 'CC-BY-SA-4.0',
  rights: '© 2022 unfoldingWord; adapted by Mission Mutual',
  attribution: `Adapted by Mission Mutual ${res}`,
  release: res === 'tn' ? 'UWTranslationNotes@abc' : 'UWTranslationQuestions@abc',
})

describe('patchedReader', () => {
  test('the base wins: its notes stay, the patch notes of the same book are left out', async () => {
    const a = await patchedReader(base, [patch]).passage('tit 1:1')
    expect(a.data!.notes.map((r) => r.id)).toEqual(['base-n1'])
    expect(a.data!.notes[0]!.patch).toBeUndefined()
    expect(a.cites.filter((c) => c.res === 'door43/hi/tn')).toHaveLength(1)
    expect(a.cites.some((c) => c.res === 'aquifer/hi/tn')).toBe(false)
  })

  test('the patch fills a table the base lacks for that book, and marks the rows and the cites', async () => {
    const a = await patchedReader(base, [patch]).passage('tit 1:1')
    expect(a.data!.questions.map((r) => r.id)).toEqual(['aq-q-tit'])
    expect(a.data!.questions[0]!.patch).toEqual(mark('tq', 'community'))
    const cite = a.cites.find((c) => c.res === 'aquifer/hi/tq')!
    expect(cite).toMatchObject({ release: 'UWTranslationQuestions@abc', id: 'aq-q-tit', patch: mark('tq', 'community') })
    // the base's own cite is not marked
    expect(a.cites.find((c) => c.res === 'door43/hi/tn')!.patch).toBeUndefined()
  })

  test('a book the base lacks: the patch rows alone (no text), the base unit reported as not installed', async () => {
    const a = await patchedReader(base, [patch]).passage('rut 1:1')
    expect(a.data!.texts).toEqual([])
    expect(a.data!.notes.map((r) => r.id)).toEqual(['aq-n-rut'])
    expect(a.data!.notes[0]!.patch).toEqual(mark('tn', 'professional'))
    expect(a.notInstalled).toEqual([{ book: 'rut', unit: 'book:rut', bytes: 321 }])
  })

  test('the ta: concept of a patch row resolves through the base article group', async () => {
    const c = await patchedReader(base, [patch]).context('rut 1:1')
    expect(c.data!.passage.notes[0]!.patch?.patch).toBe(PATCH)
    expect(c.data!.concepts).toHaveLength(1)
    expect(c.data!.concepts[0]!.concept).toBe('ta:translate/figs-metaphor')
    expect(c.data!.concepts[0]!.article?.title).toBe('Metaphor')
    expect(c.cites.some((x) => x.patch !== undefined && x.res === 'aquifer/hi/tn')).toBe(true)
    expect(c.revision.units['art:ta:translate']).toBe(1)
    // the patch has no art group: only the base answered the article
    expect(patch.listed('art:ta:translate')).toBe(false)
  })

  test('a patch table with no resource entry: the book the base lacks gives no rows and one E_PATCH_RES', async () => {
    const r = patchedReader(base, [bareSource])
    const a = await r.passage('rut 1:1')
    expect(a.data!.notes).toEqual([])
    expect(a.cites.some((c) => c.patch !== undefined)).toBe(false)
    await r.passage('rut 1:1')
    expect(r.problems.filter((x) => x.code === 'E_PATCH_RES')).toEqual([{ id: 'aquifer/hi/tn', code: 'E_PATCH_RES' }])
  })

  test('a patch table with no resource entry: the table the base lacks stays absent and is reported once', async () => {
    const r = patchedReader(base, [bareSource])
    const a = await r.passage('tit 1:1')
    expect(a.data!.questions).toEqual([])
    expect(a.data!.notes.map((x) => x.id)).toEqual(['base-n1'])
    expect(a.cites.some((c) => c.patch !== undefined || c.res === 'aquifer/hi/tq')).toBe(false)
    await r.passage('tit 1:1')
    expect(r.problems.filter((x) => x.code === 'E_PATCH_RES')).toEqual([{ id: 'aquifer/hi/tq', code: 'E_PATCH_RES' }])
    expect(JSON.stringify(a)).not.toContain('"license":""')
  })

  test('a book neither has: not installed as before', async () => {
    const a = await patchedReader(base, [patch]).passage('gen 1:1')
    expect(a.data).toBeNull()
  })

  test('no patch: the same reader, and the base rows come out unchanged', async () => {
    expect(patchedReader(base, [])).toBe(base)
    const alone = await base.passage('tit 1:1')
    const both = await patchedReader(base, [patch]).passage('tit 1:1')
    expect(both.data!.notes).toEqual(alone.data!.notes)
    expect(both.data!.texts).toEqual(alone.data!.texts)
  })
})

describe('a patch catalog through the client', () => {
  let sample: Sample
  let served: WithCatalogs
  let trust: { trustedKeys: Record<string, Uint8Array> }
  let server: FakeServer | undefined
  afterEach(() => server?.stop())
  beforeAll(async () => {
    sample = await buildSample()
    served = await withPatch(sample)
    trust = { trustedKeys: { [sample.keys.keyId]: bytesOf(sample.keys.publicKey) } }
  }, 120_000)
  const make = () => {
    server?.stop()
    server = startFakeServer(served, {})
    return createClient({ store: memoryStore(), source: httpSource({ base: server.url }), trust })
  }

  test('a -x- tag refreshes and installs like a language; its book needs only the common orig', async () => {
    const client = make()
    const r = await client.refresh(PATCH)
    expect(r.catalogs.map((c) => c.name).sort()).toEqual(['common', PATCH])
    await client.install(PATCH, { books: ['tit'] })
    const s = await client.status(PATCH)
    const keys = s.units.filter((u) => u.installed).map((u) => u.key)
    expect(keys).toContain(`${PATCH}/book:tit`)
    expect(keys).toContain('common/orig:tit')
    // no map and no article group of the patch itself: only its book, and the common units the install brings
    expect(keys.filter((k) => k.startsWith(`${PATCH}/`))).toEqual([`${PATCH}/book:tit`])
    const a = await (await client.open(PATCH)).passage('tit 1:1')
    expect(a.data!.notes.map((n) => n.id)).toEqual(['aq-n1'])
  })

  test('open with patches: the patch fills the book the base lacks, the base wins once it has it', async () => {
    const client = make()
    await client.install(PATCH, { books: ['tit'] })
    await client.install('es-419', { books: [] })
    const none = await (await client.open('es-419', { patches: [PATCH] })).passage('tit 1:1')
    expect(none.data!.texts).toEqual([])
    expect(none.data!.notes[0]!.patch).toMatchObject({ patch: PATCH, source: 'aquifer', review: 'professional', license: 'CC-BY-SA-4.0', release: 'UWTranslationNotes@abc123' })
    expect(none.notInstalled.map((n) => n.unit)).toContain('book:tit')
    await client.install('es-419', { books: ['tit'] })
    const both = await (await client.open('es-419', { patches: [PATCH] })).passage('tit 1:1')
    expect(both.data!.texts.length).toBeGreaterThan(0)
    expect(both.data!.notes.some((n) => n.patch !== undefined || n.id === 'aq-n1')).toBe(false)
    expect(both.data!.questions.some((n) => n.patch !== undefined)).toBe(false)
  })

  test('no patch option, an empty list or a patch that is not installed: the same answers as before', async () => {
    const client = make()
    await client.install('es-419', { books: ['tit'] })
    const plain = await (await client.open('es-419')).passage('tit 1:1-3')
    const absent = await (await client.open('es-419', { patches: [PATCH] })).passage('tit 1:1-3')
    const empty = await (await client.open('es-419', { patches: [] })).passage('tit 1:1-3')
    expect(absent).toEqual(plain)
    expect(empty).toEqual(plain)
  })
})
