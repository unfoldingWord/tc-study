import { beforeAll, describe, expect, test } from 'bun:test'
import { readSegment, writeSegment } from '../../codec/container'
import type { About, BookModel, OrigModel, TextModel } from '../../model'
import { partsSource } from '../../node/partsSource'
import { ALIGNED_TABLES, alignedView } from '../../read/aligned'
import { CATALOG_TABLES, catalogView } from '../../read/catalog'
import { BUILDER, buildLanguage } from '../language'
import { ALIGNED_PARTS, buildAligned, isBridgeText, partOf } from './build'
import { alignedSegment, isAlignedGroup } from './segment'

const GLT = 'es-419_gl/es-419/glt'
const GST = 'es-419_gl/es-419/gst'

const orig: OrigModel = {
  book: 'rut',
  key: 'x/ugnt',
  stamp: 's1',
  words: ['H3225', 'G5101', 'G2424', 'H259', ''].map((strong) => ({ form: '', lemma: '', strong, morph: '' })),
  pieces: [],
  events: [],
}
const origs = new Map([['rut', orig]])

const text = (res: string, verse: string, words: [string, number[]][]): TextModel => {
  const pieces: TextModel['pieces'] = []
  const align: number[][] = []
  words.forEach(([w, a], k) => {
    if (k > 0) pieces.push([' ', false])
    pieces.push([w, true])
    align.push(a)
  })
  return { res, pieces, events: [[0, 'chapter', '1'], [0, 'verse', verse]], align }
}

const rut = (texts: TextModel[]): BookModel => ({ lang: 'es-419', book: 'rut', orig: ['x/ugnt', 's1'], res: [[GLT, 'v1'], [GST, 'v2']], texts })

const entriesOf = (parts: ReturnType<typeof buildAligned>['parts']) => new Map(parts.flatMap((p) => [...p.entries].map(([k, v]) => [k, v] as const)))

describe('buildAligned on Ruth-like books', () => {
  const book = rut([
    text(GLT, '1', [['A', [0]], ['la', [0]], ['Diestra', [0]], ['¿Qué', [1]], ['Ἰησοῦς', [2]], ['1', [3]], ['Ácido', [3]], ['sin', []], ['clave', [4]]]),
    text(GST, '1-2', [['diestra', [0]]]),
  ])
  const built = buildAligned({ lang: 'es-419', books: [book], origs, texts: isBridgeText })
  const entries = entriesOf(built.parts)

  test('a phrase in one text only keeps its verse once and the occurrences of that text (Review Focus 1)', () => {
    expect(entries.get('a la diestra')!.get('H3225')!.get('rut')).toEqual([1, 1])
  })

  test('the same word in two texts and two cases is one entry: one verse, two occurrences; the case is folded', () => {
    expect(entries.get('diestra')!.get('H3225')!.get('rut')).toEqual([1, 2])
    expect(entries.has('Diestra')).toBe(false)
  })

  test('a key outside basic Latin, a digit, a decomposed accent land in other and are found (Review Focus 2)', () => {
    const other = built.parts.find((p) => p.group === 'other')!
    expect([...other.entries.keys()].sort()).toEqual(['1', '1 ácido', 'ácido', 'ἰησοῦς', '¿qué'].sort())
    expect(entries.get('ácido')!.get('H259')!.get('rut')).toEqual([1, 1])
  })

  test('words with no Strong key are not stored', () => {
    expect(entries.has('clave')).toBe(false)
    expect(entries.has('sin')).toBe(false)
  })

  test('every part has a valid group, the same res, and writes and reads back', async () => {
    expect(built.parts.map((p) => p.group)).toEqual(['a', 'c-d', 'j-m', 'other'])
    for (const p of built.parts) {
      expect(isAlignedGroup(p.group)).toBe(true)
      expect(p.res).toEqual([[GLT, 'v1'], [GST, 'v2']])
      const { seg } = await readSegment((await writeSegment(alignedSegment(p))).bytes, { known: ALIGNED_TABLES })
      expect(alignedView(seg, ['a', 'c-d', 'j-m'])).toEqual(p)
    }
  })

  test('a book without originals is left out with a line; no text gives no part', () => {
    const none = buildAligned({ lang: 'es-419', books: [book], origs: new Map(), texts: isBridgeText })
    expect(none.parts).toEqual([])
    expect(none.report.length).toBe(2)
    expect(buildAligned({ lang: 'es-419', books: [book], origs, texts: () => false }).parts).toEqual([])
  })
})

describe('partOf and ALIGNED_PARTS', () => {
  test('one part from the first code point; the table is in alphabet order and valid', () => {
    expect(partOf('diestra', ['H3225'])).toEqual(['c-d'])
    expect(partOf('zoe', [])).toEqual(['x-z'])
    for (const key of ['¿qué', 'ἰησοῦς', '1 rey', 'ñandú', 'ácido']) expect(partOf(key, ['G1'])).toEqual(['other'])
    expect(ALIGNED_PARTS.every(isAlignedGroup)).toBe(true)
    const letters = ALIGNED_PARTS.flatMap((g) => (g.length === 1 ? [g] : [g[0], g[2]]))
    expect(letters).toEqual([...letters].sort())
    for (const c of 'abcdefghijklmnopqrstuvwxyz') expect(partOf(c, [])).toHaveLength(1)
    expect(new Set('abcdefghijklmnopqrstuvwxyz'.split('').map((c) => partOf(c, [])[0])).size).toBe(ALIGNED_PARTS.length)
  })
})

describe('buildLanguage with aligned: es-419 Titus', () => {
  const about: Omit<About, 'catalog'> = { format: '3.0', publisher: 'unfoldingWord', origin: 'published', revision: 1, built: '2026-11-01T10:00:00Z', builder: BUILDER }
  const data = `${import.meta.dir}/../../../spec/tests/data`
  const sample = () => partsSource({ list: `${data}/es-419/list.json`, partsDir: `${data}/parts`, originals: `${data}/originals/list.json` })
  let off: Awaited<ReturnType<typeof buildLanguage>>
  let on: Awaited<ReturnType<typeof buildLanguage>>

  beforeAll(async () => {
    off = await buildLanguage({ source: await sample(), lang: 'es-419', registry: {}, about })
    on = await buildLanguage({ source: await sample(), lang: 'es-419', registry: {}, about, aligned: true })
  })

  test('the segments of every other class are the same bytes with or without the index (Review Focus 4)', () => {
    const rest = on.segments.filter((s) => s.seg.h.class !== 'aligned')
    expect(rest.map((s) => s.id)).toEqual(off.segments.map((s) => s.id))
    expect(rest.map((s) => s.inputs)).toEqual(off.segments.map((s) => s.inputs))
    expect(off.segments.some((s) => s.seg.h.class === 'aligned')).toBe(false)
    expect(on.report.filter((l) => !l.startsWith('aligned'))).toEqual(off.report)
  })

  test('the catalog lists the parts as optional units that nothing needs and that need nothing', async () => {
    const catalog = catalogView((await readSegment(on.catalog.bytes, { known: CATALOG_TABLES })).seg)
    const units = catalog.units.filter((u) => u.id.startsWith('aligned:'))
    const parts = on.segments.filter((s) => s.seg.h.class === 'aligned')
    expect(parts.length).toBeGreaterThan(0)
    expect(units.map((u) => u.id).sort()).toEqual(parts.map((s) => `aligned:${s.seg.h.group}`).sort())
    for (const u of units) {
      expect(u.optional).toBe(true)
      expect(u.needs ?? []).toEqual([])
    }
    expect(catalog.units.some((u) => (u.needs ?? []).some((n) => n.startsWith('aligned:')))).toBe(false)
  })

  test('each part reads back with the groups of the catalog, and its keys are folded and in its range', async () => {
    const parts = on.segments.filter((s) => s.seg.h.class === 'aligned')
    const groups = parts.map((s) => s.seg.h.group as string)
    let n = 0
    for (const s of parts) {
      const view = alignedView((await readSegment(s.bytes, { known: ALIGNED_TABLES })).seg, groups)
      for (const key of view.entries.keys()) {
        n++
        expect(key).toBe(key.normalize('NFC').toLocaleLowerCase('es-419'))
        expect(partOf(key, [])).toEqual([view.group])
      }
    }
    expect(n).toBeGreaterThan(0)
  })

  test('twice gives the same bytes', async () => {
    const again = await buildLanguage({ source: await sample(), lang: 'es-419', registry: {}, about, aligned: true })
    expect(again.segments.map((s) => s.id)).toEqual(on.segments.map((s) => s.id))
    expect(again.catalog.id).toBe(on.catalog.id)
  })
})
