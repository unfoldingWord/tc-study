import { beforeAll, describe, expect, test } from 'bun:test'
import { type BookModel, bookSegment, type HelpRow, plainText, writeSegment } from '@bt-synergy/language-pack-v3'
import { patchedReader } from './patch'
import { openFromSegments, type PackReader } from './reader'
import type { VerifiedCatalog } from './verify'

const bytesOf = (h: string) => Uint8Array.from(h.match(/../g)!, (p) => parseInt(p, 16))
const ORIG: [string, string] = ['unfoldingWord/el-x-koine/ugnt', 'g1']
const TIT = 56001001
const row = (id: string, from: number): HelpRow => ({ id, ref: '1:1', from, to: from, cols: { note: `row ${id}` } })

async function fixture(lang: string, parts: { unit: string; seg: Parameters<typeof writeSegment>[0]; book: string }[], resources: object[]) {
  const written = await Promise.all(parts.map((p) => writeSegment(p.seg)))
  const entries = parts.map((p, i) => ({ id: bytesOf(written[i]!.id), class: p.seg.h.class, book: p.book, size: written[i]!.bytes.length, ulen: 0, inputs: new Uint8Array() }))
  const catalog = {
    id: 'x',
    bytes: new Uint8Array(),
    name: lang,
    publisher: 'x',
    revision: 1,
    origin: 'published',
    catalog: { lang, about: { revision: 1 }, resources, segments: entries, units: parts.map((p, i) => ({ id: p.unit, segments: [i] })) },
  } as unknown as VerifiedCatalog
  const bytes = new Map(written.map((w) => [w.id, w.bytes]))
  return { catalog, get: async (id: string) => bytes.get(id) }
}
const open = (lang: string, f: Awaited<ReturnType<typeof fixture>>): PackReader => openFromSegments({ lang, catalogs: [f.catalog], get: f.get })

const YP = 'hi-x-yaapi'
const AP = 'hi-x-aquifer'
const yres = ['A', 'B'].map((v) => ({ key: `yaapi/hi/${v}`, title: v, subject: 'Bible', release: `${v}@sha256:abc`, license: 'CC-BY-4.0', rights: `© ${v}`, attribution: `credit ${v}`, source: 'yaapi' }))
const text = (v: string, t: string) => plainText(`yaapi/hi/${v}`, [{ chapter: 1, verse: 1, text: `${t} uno` }, { chapter: 1, verse: 2, text: `${t} dos` }])
const ybook = (book: string): BookModel => {
  const texts = [text('A', 'a'), text('B', 'b')]
  return { lang: YP, book, orig: ORIG, res: texts.map((t) => [t.res, `${t.res.slice(-1)}@sha256:abc`] as [string, string]), texts }
}

let base: PackReader
let aquifer: PackReader
beforeAll(async () => {
  const tit: BookModel = { lang: 'hi', book: 'tit', orig: ORIG, res: [['door43/hi/tn', 'v1']], texts: [], notes: { res: 'door43/hi/tn', rows: [row('base-n1', TIT)] } }
  base = open('hi', await fixture('hi', [{ unit: 'book:tit', seg: bookSegment(tit), book: 'tit' }], []))
  const aq: BookModel = { lang: AP, book: 'rut', orig: ORIG, res: [['aquifer/hi/tn', 'r@abc']], texts: [], notes: { res: 'aquifer/hi/tn', rows: [row('aq-n-rut', 8001001)] } }
  const res = [{ key: 'aquifer/hi/tn', title: 'tn', subject: 'tn', release: 'r@abc', license: 'CC-BY-SA-4.0', source: 'aquifer', review: 'professional' }]
  aquifer = open(AP, await fixture(AP, [{ unit: 'book:rut', seg: bookSegment(aq), book: 'rut' }], res))
})

describe('patchedReader with a Bible-text patch (-x-yaapi)', () => {
  test('a book the base lacks gets all the texts, in order, each marked; no review', async () => {
    const y = open(YP, await fixture(YP, [{ unit: 'book:rut', seg: bookSegment(ybook('rut')), book: 'rut' }], yres))
    const a = await patchedReader(base, [y]).passage('rut 1:1-2')
    expect(a.data!.texts.map((t) => [t.res, t.text])).toEqual([['yaapi/hi/A', 'a uno a dos'], ['yaapi/hi/B', 'b uno b dos']])
    expect(a.data!.texts[0]!.patch).toMatchObject({ patch: YP, source: 'yaapi', license: 'CC-BY-4.0', attribution: 'credit A' })
    expect(a.data!.texts[0]!.patch!.review).toBeUndefined()
    expect(a.cites.find((c) => c.res === 'yaapi/hi/B')!.patch?.source).toBe('yaapi')
  })

  test('the base wins by book: a base book with any text takes none of the patch texts', async () => {
    const withText: BookModel = { lang: 'hi', book: 'tit', orig: ORIG, res: [['door43/hi/glt', 'v1']], texts: [{ ...text('A', 'x'), res: 'door43/hi/glt' }] }
    const b = open('hi', await fixture('hi', [{ unit: 'book:tit', seg: bookSegment(withText), book: 'tit' }], []))
    const y = open(YP, await fixture(YP, [{ unit: 'book:tit', seg: bookSegment(ybook('tit')), book: 'tit' }], yres))
    const a = await patchedReader(b, [y]).passage('tit 1:1')
    expect(a.data!.texts.map((t) => t.res)).toEqual(['door43/hi/glt'])
  })

  test('a base book with notes and no text takes the patch texts; the base notes stay', async () => {
    const y = open(YP, await fixture(YP, [{ unit: 'book:tit', seg: bookSegment(ybook('tit')), book: 'tit' }], yres))
    const a = await patchedReader(base, [y]).passage('tit 1:1')
    expect(a.data!.texts.map((t) => t.res)).toEqual(['yaapi/hi/A', 'yaapi/hi/B'])
    expect(a.data!.notes.map((r) => r.id)).toEqual(['base-n1'])
  })

  test('an Aquifer patch and a yaapi patch on the same book combine, and the first patch model is not mutated', async () => {
    const y = open(YP, await fixture(YP, [{ unit: 'book:rut', seg: bookSegment(ybook('rut')), book: 'rut' }], yres))
    const before = JSON.stringify((await aquifer.book('rut'))!.res)
    const m = await patchedReader(base, [aquifer, y]).passage('rut 1:1')
    expect(m.data!.notes.map((r) => r.id)).toEqual(['aq-n-rut'])
    expect(m.data!.texts).toHaveLength(2)
    expect(JSON.stringify((await aquifer.book('rut'))!.res)).toBe(before)
  })

  test('texts of a resource the patch catalog does not list are left out and reported', async () => {
    const y = open(YP, await fixture(YP, [{ unit: 'book:rut', seg: bookSegment(ybook('rut')), book: 'rut' }], []))
    const r = patchedReader(base, [y])
    expect((await r.passage('rut 1:1')).data!.texts).toEqual([])
    expect(r.problems.some((x) => x.code === 'E_PATCH_RES')).toBe(true)
  })
})
