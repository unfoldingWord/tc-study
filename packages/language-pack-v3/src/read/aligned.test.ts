import { describe, expect, test } from 'bun:test'
import { alignedSegment } from '../build/aligned/segment'
import { buildCatalog, builtSegment } from '../build/catalog'
import { encodeTexts, encodeUvarints } from '../codec/columns'
import { CLASS_NAMES, readSegment, type Segment, writeSegment } from '../codec/container'
import { FormatError } from '../codec/errors'
import type { AlignedModel } from '../model'
import { ALIGNED_TABLES, alignedView } from './aligned'
import { catalogView } from './catalog'
import { readerOutput } from './output'

const GLT = 'es-419_gl/es-419/glt'
const GST = 'es-419_gl/es-419/gst'

const books = (rows: [string, number, number][]) => new Map(rows.map(([b, v, o]) => [b, [v, o] as [number, number]]))

const model = (): AlignedModel => ({
  lang: 'es-419',
  group: 'a-d',
  res: [[GLT, 'v1'], [GST, 'v2']],
  entries: new Map([
    ['amor', new Map([['G26', books([['jhn', 3, 5], ['rom', 1, 1]])], ['H157', books([['psa', 2, 2]])]])],
    ['a la diestra', new Map([['G1188', books([['mrk', 1, 2]])]])],
    ['dios', new Map([['G2316', books([['gen', 4, 9]])]])],
  ]),
})

const fresh = (m: AlignedModel = model()): Segment => structuredClone(alignedSegment(m))

describe('alignedSegment and alignedView', () => {
  test('round trip: write, read, view gives the model, keys sorted', async () => {
    const { bytes } = await writeSegment(fresh())
    const { seg } = await readSegment(bytes, { known: ALIGNED_TABLES })
    const view = alignedView(seg)
    expect(view).toEqual(model())
    expect([...view.entries.keys()]).toEqual(['a la diestra', 'amor', 'dios'])
    expect(seg.h).toMatchObject({ class: 'aligned', v: 1, lang: 'es-419', group: 'a-d' })
  })

  test('the same model in another order gives the same bytes', async () => {
    const m = model()
    const reversed: AlignedModel = { ...m, entries: new Map([...m.entries].reverse()) }
    expect((await writeSegment(alignedSegment(m))).id).toBe((await writeSegment(alignedSegment(reversed))).id)
  })

  test('the strongs table has the most used first, each once', () => {
    const m = model()
    m.entries.get('dios')!.set('G26', books([['gen', 1, 1]]))
    expect(fresh(m).t.strongs).toEqual(['G26', 'G1188', 'G2316', 'H157'])
  })

  test('the class is known, after topics', () => {
    expect(CLASS_NAMES.indexOf('aligned')).toBe(CLASS_NAMES.indexOf('topics') + 1)
    expect(ALIGNED_TABLES).toEqual({ keys: [1], strongs: [1], data: [1] })
  })

  test('the reader output has entries by key, Strong key and book', async () => {
    const { bytes } = await writeSegment(fresh())
    const out = (await readerOutput(bytes)) as any
    expect(out.entries.amor.G26).toEqual({ jhn: [3, 5], rom: [1, 1] })
    expect(out.h.group).toBe('a-d')
  })

  test('a letter group, and keys outside basic Latin in other', () => {
    const m: AlignedModel = { lang: 'es-419', group: 'other', res: [[GLT, 'v1']], entries: new Map([['¿qué', new Map([['G5101', books([['mat', 1, 1]])]])], ['ἰησοῦς', new Map([['G2424', books([['mat', 1, 1]])]])]]) }
    expect(alignedView(fresh(m)).entries.size).toBe(2)
    expect(alignedView(fresh({ ...m, group: 'b', entries: new Map([['bien', new Map([['G1', books([['mat', 1, 1]])]])]]) })).group).toBe('b')
  })

  test('a segment alone does not check "other" against ranges; with the catalog groups it does', () => {
    const m: AlignedModel = { lang: 'es-419', group: 'other', res: [[GLT, 'v1']], entries: new Map([['bien', new Map([['G1', books([['mat', 1, 1]])]])]]) }
    expect(alignedView(fresh(m)).entries.size).toBe(1)
    expect(() => alignedView(fresh(m), ['a', 'b-c', 'other'])).toThrow(FormatError)
    expect(alignedView(fresh(m), ['a', 'c-d', 'other']).entries.size).toBe(1)
  })

  test('the writer refuses a key outside the range, an empty key, a bad group, bad counts', () => {
    const one = (key: string, g = 'a'): AlignedModel => ({ lang: 'es', group: g, res: [[GLT, 'v1']], entries: new Map([[key, new Map([['G1', books([['mat', 1, 1]])]])]]) })
    expect(() => alignedSegment(one('bien'))).toThrow('range')
    expect(() => alignedSegment(one('', 'other'))).toThrow('empty')
    expect(() => alignedSegment(one('a', 'd-b'))).toThrow('group')
    expect(() => alignedSegment(one('a', 'A'))).toThrow('group')
    expect(() => alignedSegment({ ...one('a'), res: [] })).toThrow('resource')
    const bad = one('a')
    bad.entries.get('a')!.set('G1', books([['mat', 3, 2]]))
    expect(() => alignedSegment(bad)).toThrow('verses')
    bad.entries.get('a')!.set('G1', books([['mat', 0, 0]]))
    expect(() => alignedSegment(bad)).toThrow('verses')
    bad.entries.get('a')!.set('G1', new Map())
    expect(() => alignedSegment(bad)).toThrow('no book')
  })

  const rebuild = (s: Segment, keys: string[], data: number[], strongs: string[] = ['G1', 'G2']): void => {
    s.t.keys = encodeTexts(keys)
    s.t.data = encodeUvarints(data)
    s.t.strongs = strongs
  }
  const broken: [string, (s: Segment) => void][] = [
    ['another class', (s) => void (s.h.class = 'lex')],
    ['no lang', (s) => void delete s.h.lang],
    ['no group', (s) => void delete s.h.group],
    ['no res', (s) => void delete s.h.res],
    ['an empty res', (s) => void (s.h.res = [])],
    ['a group in uppercase', (s) => void (s.h.group = 'A')],
    ['a range backwards', (s) => void (s.h.group = 'd-b')],
    ['a range of equal letters', (s) => void (s.h.group = 'b-b')],
    ['a group of three letters', (s) => void (s.h.group = 'a-d-f')],
    ['a group that is a word', (s) => void (s.h.group = 'others')],
    ['keys not sorted', (s) => rebuild(s, ['b', 'a'], [1, 0, 1, 1, 1, 1, 1, 0, 1, 1, 1, 1])],
    ['a key repeated', (s) => rebuild(s, ['a', 'a'], [1, 0, 1, 1, 1, 1, 1, 0, 1, 1, 1, 1])],
    ['an empty key', (s) => rebuild(s, ['', 'a'], [1, 0, 1, 1, 1, 1, 1, 0, 1, 1, 1, 1])],
    ['a key before the range', (s) => rebuild(s, ['1a'], [1, 0, 1, 1, 1, 1])],
    ['a key after the range', (s) => rebuild(s, ['e'], [1, 0, 1, 1, 1, 1])],
    ['numbers left over', (s) => rebuild(s, ['a'], [1, 0, 1, 1, 1, 1, 7])],
    ['data cut short', (s) => rebuild(s, ['a'], [1, 0, 1, 1, 1])],
    ['data cut short at the start', (s) => rebuild(s, ['a'], [])],
    ['an entry with no Strong key', (s) => rebuild(s, ['a'], [0])],
    ['a Strong index outside strongs', (s) => rebuild(s, ['a'], [1, 2, 1, 1, 1, 1])],
    ['a Strong index repeated', (s) => rebuild(s, ['a'], [2, 0, 1, 1, 1, 1, 0, 1, 1, 1, 1])],
    ['a Strong key with no book', (s) => rebuild(s, ['a'], [1, 0, 0])],
    ['a book delta of 0', (s) => rebuild(s, ['a'], [1, 0, 1, 0, 1, 1])],
    ['a second book delta of 0', (s) => rebuild(s, ['a'], [1, 0, 2, 3, 1, 1, 0, 1, 1])],
    ['a book above 66', (s) => rebuild(s, ['a'], [1, 0, 1, 67, 1, 1])],
    ['books that pass 66', (s) => rebuild(s, ['a'], [1, 0, 2, 60, 1, 1, 7, 1, 1])],
    ['verses 0', (s) => rebuild(s, ['a'], [1, 0, 1, 1, 0, 1])],
    ['verses above occurrences', (s) => rebuild(s, ['a'], [1, 0, 1, 1, 3, 2])],
    ['keys that is not texts', (s) => void (s.t.keys = ['a'] as never)],
    ['keys with a length past utf8', (s) => void (s.t.keys = { utf8: new Uint8Array(1), len: encodeUvarints([5]) } as never)],
    ['strongs that is not a list of text', (s) => void (s.t.strongs = [1] as never)],
    ['data that is not bytes', (s) => void (s.t.data = [1] as never)],
    ['data not minimal', (s) => void (s.t.data = Uint8Array.of(0x81, 0x00) as never)],
  ]
  for (const [name, change] of broken) {
    test(`E_BODY: ${name}`, () => {
      const seg = fresh({ lang: 'es', group: 'a-d', res: [[GLT, 'v1']], entries: new Map([['a', new Map([['G1', books([['mat', 1, 1]])]])]]) })
      change(seg)
      let code = ''
      try {
        alignedView(seg)
      } catch (error) {
        code = (error as FormatError).code
      }
      expect(code).toBe('E_BODY')
    })
  }
})

describe('the catalog and the aligned units', () => {
  const about = {
    format: '3.0' as const,
    catalog: 'es-419',
    publisher: 'unfoldingWord',
    origin: 'published' as const,
    revision: 1,
    built: '2026-11-03T10:00:00Z',
    builder: 'test',
  }
  const part = (group: string, key: string) =>
    builtSegment(alignedSegment({ lang: 'es-419', group, res: [[GLT, 'v1']], entries: new Map([[key, new Map([['G1', books([['mat', 1, 1]])]])]]) }), '0'.repeat(63) + '1')

  test('two parts are the units aligned:a and aligned:b-c, optional and without needs', async () => {
    const a = await part('a', 'amor')
    const b = await part('b-c', 'bien')
    const cat = await buildCatalog({ about, resources: [], segments: [b, a], needs: () => ['map'] })
    const view = catalogView(cat.seg)
    expect(view.units).toEqual([
      { id: 'aligned:a', segments: [0], optional: true },
      { id: 'aligned:b-c', segments: [1], optional: true },
    ])
    expect(view.segments.map((s) => s.group)).toEqual(['a', 'b-c'])
    const { seg } = await readSegment(cat.bytes, { known: { about: [1], resources: [1], segments: [1], units: [1] } })
    expect(catalogView(seg).units[0].optional).toBe(true)
  })

  test('no other unit carries optional, and no needs lists an aligned unit', async () => {
    const a = await part('a', 'amor')
    const other = await builtSegment({ h: { class: 'obs', v: 1, tables: {} }, t: {} }, '0'.repeat(63) + '2')
    const cat = await buildCatalog({ about, resources: [], segments: [a, other] })
    expect(catalogView(cat.seg).units.find((u) => u.id === 'obs')).toEqual({ id: 'obs', segments: [1] })
    await expect(buildCatalog({ about, resources: [], segments: [a, other], needs: (s) => (s.seg.h.class === 'obs' ? ['aligned:a'] : []) })).rejects.toThrow('aligned')
  })

  test('the catalog reader refuses optional that is not true, optional on another unit, an aligned unit without it', async () => {
    const a = await part('a', 'amor')
    const other = await builtSegment({ h: { class: 'obs', v: 1, tables: {} }, t: {} }, '0'.repeat(63) + '2')
    const cat = await buildCatalog({ about, resources: [], segments: [a, other] })
    const units = (s: Segment) => s.t.units as any[]
    const mutations: ((s: Segment) => void)[] = [
      (s) => void (units(s)[0].optional = false),
      (s) => void (units(s)[0].optional = 1),
      (s) => void delete units(s)[0].optional,
      (s) => void (units(s)[1].optional = true),
    ]
    for (const change of mutations) {
      const seg = structuredClone(cat.seg)
      change(seg)
      expect(() => catalogView(seg)).toThrow(FormatError)
    }
    expect(() => catalogView(structuredClone(cat.seg))).not.toThrow()
  })
})
