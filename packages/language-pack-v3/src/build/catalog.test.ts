import { describe, expect, test } from 'bun:test'
import { hex, readHeader, readSegment, type Segment, writeSegment } from '../codec/container'
import type { LogicalHeader } from '../codec/container'
import { bookSet } from '../ids'
import type { About, ArticleModel, BookModel, CatalogResource, Complement, HelpRow } from '../model'
import { partsSource } from '../node/partsSource'
import { CATALOG_TABLES, catalogView } from '../read/catalog'
import { artSegment } from './art'
import { type BuiltSegment, buildCatalog, builtSegment, needsOfBook, unitsOf } from './catalog'
import { bookSegment } from './book'
import { extractBook } from './bookHelps'
import { extractOrig, origSegment } from './orig'

// The data is a sample of real files (spec/tests/data/README.md): es-419 Titus and the UGNT.
const join = (...path: string[]) => path.join('/')
const DATA = join(import.meta.dir, '..', '..', 'spec', 'tests', 'data')
const source = () =>
  partsSource({ list: join(DATA, 'es-419', 'list.json'), partsDir: join(DATA, 'parts'), originals: join(DATA, 'originals', 'list.json') })

const TN = 'es-419_gl/es-419/tn'
const BUILT = '2026-11-01T10:00:00Z'

const about: About = {
  format: '3.0',
  catalog: 'es-419',
  publisher: 'unfoldingWord',
  origin: 'published',
  revision: 4,
  built: BUILT,
  builder: 'bt-synergy language-pack-v3 0.1.0',
  name: 'español latinoamericano',
  direction: 'ltr',
}

const resource = (key: string, extra: Partial<CatalogResource> = {}): CatalogResource => ({
  key,
  title: `Title of ${key}`,
  subject: 'TSV Translation Notes',
  release: 'v66',
  license: 'CC-BY-SA-4.0',
  books: bookSet(['tit']),
  ...extra,
})

/** The fingerprint of a stub: the number in 64 hex digits. */
const fingerprint = (n: number): string => n.toString(16).padStart(64, '0')

/** A segment with the header given and no tables: the catalog does not look inside a segment, only at its header and its file. */
const stub = (h: Partial<LogicalHeader> & Pick<LogicalHeader, 'class'>, n = 1): Promise<BuiltSegment> =>
  builtSegment({ h: { v: 1, tables: {}, ...h }, t: {} }, fingerprint(n))

const sha256Hex = async (text: string): Promise<string> =>
  Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))), (b) => b.toString(16).padStart(2, '0')).join('')

const bytesOfHex = (text: string): Uint8Array => Uint8Array.from(text.match(/../g)!, (pair) => parseInt(pair, 16))

type Sample = { book: BookModel; built: BuiltSegment[]; needs: string[] }
let cached: Promise<Sample> | undefined
/** The Titus of the data folder, as a language catalog would list it, built once. Tests only read it. */
const titus = () =>
  (cached ??= (async (): Promise<Sample> => {
    const src = await source()
    const orig = await extractOrig(src, 'tit')
    const book = await extractBook(src, 'es-419', 'tit', orig)
    const needs = needsOfBook(book)
    const built: BuiltSegment[] = [
      await builtSegment(bookSegment(book), fingerprint(1)),
      await builtSegment(origSegment(orig), fingerprint(2)),
      await stub({ class: 'map', lang: 'es-419', part: 'core' }, 3),
      await stub({ class: 'map', lang: 'es-419', part: 'tit', book: 'tit' }, 4),
    ]
    for (const unit of needs.filter((id) => id.startsWith('art:'))) {
      const group = unit.slice('art:'.length)
      const article: ArticleModel = {
        id: `${group.slice(0, 2)}:${group.slice(3)}/x`,
        res: TN,
        title: 'x',
        sections: [{ sid: 'intro', level: 0, role: 'intro', lang: 'es-419', md: 'x' }],
      }
      built.push(await builtSegment(artSegment('es-419', group, [[TN, 'v66']], [article]), fingerprint(10 + built.length)))
    }
    return { book, built, needs }
  })())

const needsFor = (sample: Sample) => (s: BuiltSegment) => (s.seg.h.class === 'book' ? sample.needs : [])

describe('needsOfBook', () => {
  const row = (id: string, concept?: string): HelpRow => ({ id, ref: '1:1', from: 56_001_001, to: 56_001_001, ...(concept === undefined ? {} : { concept }), cols: {} })
  const model = (notes: HelpRow[], links: HelpRow[], questions: HelpRow[] = []): BookModel => ({
    lang: 'es-419',
    book: 'tit',
    orig: ['unfoldingWord/el-x-koine/ugnt', 'g987ab2025a'],
    res: [],
    texts: [],
    notes: { res: TN, rows: notes },
    links: { res: 'es-419_gl/es-419/twl', rows: links },
    questions: { res: 'es-419_gl/es-419/tq', rows: questions },
  })

  test('the original, the map, and the article group of each concept of the notes and links, sorted without repeats', () => {
    const needs = needsOfBook(
      model(
        [row('a', 'ta:translate/figs-metaphor'), row('b', 'ta:translate/figs-metonymy'), row('c', 'ta:checking/vol'), row('d')],
        [row('e', 'tw:kt/grace'), row('f', 'tw:names/paul'), row('g', 'tw:kt/god'), row('h', 'per:paul')],
        [row('i', 'tw:other/never')],
      ),
    )
    expect(needs).toEqual(['art:ta:checking', 'art:ta:translate', 'art:tw:kt', 'art:tw:names', 'map', 'orig:tit'])
  })

  test('a book without helps needs its original and the map', () => {
    expect(needsOfBook({ lang: 'es-419', book: 'rut', orig: ['x', 'y'], res: [], texts: [] })).toEqual(['map', 'orig:rut'])
  })

  test('es-419 Titus: its original, the map and the article groups its notes and links point to', async () => {
    const { book, needs } = await titus()
    // The independent side: the concepts of the rows, cut at the first "/" with plain string functions.
    const groups = new Set<string>()
    for (const table of [book.notes, book.links]) {
      for (const { concept } of table!.rows) {
        if (concept === undefined) continue
        const slash = concept.indexOf('/')
        if (concept.startsWith('tw:') || concept.startsWith('ta:')) groups.add(`art:${concept.slice(0, slash)}`)
      }
    }
    expect(groups.size).toBeGreaterThan(2)
    expect(needs).toEqual(['map', 'orig:tit', ...groups].sort())
    // The sample is frozen: the notes point to the Academy `translate` manual, the links to the three word categories.
    expect(needs).toEqual(['art:ta:translate', 'art:tw:kt', 'art:tw:names', 'art:tw:other', 'map', 'orig:tit'])
  })
})

describe('unitsOf', () => {
  test('one unit per book, orig book, art group, lex group, obs, map and xmap, ordered by id', async () => {
    const segments = [
      await stub({ class: 'xmap', part: 'core' }, 1),
      await stub({ class: 'xmap', part: 'tit', book: 'tit' }, 2),
      await stub({ class: 'map', lang: 'es-419', part: 'core' }, 3),
      await stub({ class: 'map', lang: 'es-419', part: 'rut', book: 'rut' }, 4),
      await stub({ class: 'map', lang: 'es-419', part: 'tit', book: 'tit' }, 5),
      await stub({ class: 'book', lang: 'es-419', book: 'tit' }, 6),
      await stub({ class: 'orig', book: 'tit' }, 7),
      await stub({ class: 'art', lang: 'es-419', group: 'tw:kt' }, 8),
      await stub({ class: 'art', lang: 'es-419', group: 'ta:translate' }, 9),
      await stub({ class: 'lex', lang: 'es-419', group: 'G5' }, 10),
      await stub({ class: 'obs', lang: 'es-419' }, 11),
    ]
    expect(unitsOf(segments, () => [])).toEqual([
      { id: 'art:ta:translate', segments: [8] },
      { id: 'art:tw:kt', segments: [7] },
      { id: 'book:tit', segments: [5] },
      { id: 'lex:G5', segments: [9] },
      { id: 'map', segments: [2, 3, 4] },
      { id: 'obs', segments: [10] },
      { id: 'orig:tit', segments: [6] },
      { id: 'xmap', segments: [0, 1] },
    ])
  })

  test('the unit codes order lex:G10 before lex:G5, as code points do', async () => {
    const segments = [await stub({ class: 'lex', group: 'G5' }, 1), await stub({ class: 'lex', group: 'G10' }, 2)]
    expect(unitsOf(segments, () => []).map((unit) => unit.id)).toEqual(['lex:G10', 'lex:G5'])
  })

  test('needs of a unit: the sorted union over its segments, and none when empty', async () => {
    const core = await stub({ class: 'map', part: 'core' }, 1)
    const part = await stub({ class: 'map', part: 'tit', book: 'tit' }, 2)
    const book = await stub({ class: 'book', book: 'tit' }, 3)
    const orig = await stub({ class: 'orig', book: 'tit' }, 4)
    const units = unitsOf([core, part, book, orig], (s) =>
      s === core ? ['xmap', 'orig:tit'] : s === part ? ['orig:tit', 'art:tw:kt'] : s === book ? ['orig:tit', 'map', 'map'] : [],
    )
    expect(units).toEqual([
      { id: 'book:tit', segments: [2], needs: ['map', 'orig:tit'] },
      { id: 'map', segments: [0, 1], needs: ['art:tw:kt', 'orig:tit', 'xmap'] },
      { id: 'orig:tit', segments: [3] },
    ])
    expect('needs' in units[2]).toBe(false)
  })

  test('the indexes are those of the list given', async () => {
    const [a, b] = [await stub({ class: 'book', book: 'tit' }, 1), await stub({ class: 'book', book: 'rut' }, 2)]
    expect(unitsOf([b, a], () => [])).toEqual([
      { id: 'book:rut', segments: [0] },
      { id: 'book:tit', segments: [1] },
    ])
  })

  test('two segments of the same unit are an error, except the core and the parts of a map', async () => {
    const [a, b] = [await stub({ class: 'book', book: 'tit' }, 1), await stub({ class: 'book', book: 'tit', lang: 'es-419' }, 2)]
    expect(() => unitsOf([a, b], () => [])).toThrow('book:tit')
    const [c, d] = [await stub({ class: 'art', group: 'tw:kt' }, 1), await stub({ class: 'art', group: 'tw:kt', lang: 'es-419' }, 2)]
    expect(() => unitsOf([c, d], () => [])).toThrow(Error)
    const [e, f] = [await stub({ class: 'map', part: 'tit', book: 'tit' }, 1), await stub({ class: 'map', part: 'tit', book: 'tit', lang: 'es-419' }, 2)]
    expect(() => unitsOf([e, f], () => [])).toThrow('part')
  })

  test('a catalog and a gen segment are not units', async () => {
    const [catalog, gen] = [await stub({ class: 'catalog' }), await stub({ class: 'gen' })]
    expect(() => unitsOf([catalog], () => [])).toThrow('catalog')
    expect(() => unitsOf([gen], () => [])).toThrow('gen')
  })

  test('a segment without the key of its unit is an error', async () => {
    const [book, art] = [await stub({ class: 'book' }), await stub({ class: 'art' })]
    expect(() => unitsOf([book], () => [])).toThrow('book')
    expect(() => unitsOf([art], () => [])).toThrow('group')
  })

  test('needs that is not a list of unit ids is an error', async () => {
    const a = await stub({ class: 'obs' })
    expect(() => unitsOf([a], () => 'map' as never)).toThrow('needs')
    expect(() => unitsOf([a], () => [1] as never)).toThrow('needs')
    expect(() => unitsOf([a], () => [''])).toThrow('needs')
  })
})

describe('builtSegment', () => {
  test('keeps the segment, its file, its id and its inputs', async () => {
    const seg: Segment = { h: { class: 'obs', v: 1, tables: {}, lang: 'es-419' }, t: {} }
    const built = await builtSegment(seg, fingerprint(7))
    const written = await writeSegment(seg)
    expect(built.seg).toBe(seg)
    expect(built.id).toBe(written.id)
    expect(built.bytes).toEqual(written.bytes)
    expect(built.inputs).toBe(fingerprint(7))
  })

  test('inputs that are not 64 lowercase hex digits are an error', async () => {
    const seg: Segment = { h: { class: 'obs', v: 1, tables: {} }, t: {} }
    for (const inputs of ['', 'abc', 'A'.repeat(64), 'g'.repeat(64), '0'.repeat(63), '0'.repeat(65)]) {
      await expect(builtSegment(seg, inputs)).rejects.toThrow('inputs')
    }
  })
})

describe('buildCatalog', () => {
  const build = async (extra: Partial<Parameters<typeof buildCatalog>[0]> = {}, segments?: BuiltSegment[]) => {
    const sample = await titus()
    return buildCatalog({
      about,
      resources: [resource(TN), resource('es-419_gl/es-419/twl')],
      segments: segments ?? sample.built,
      needs: needsFor(sample),
      ...extra,
    })
  }

  test('a catalog of es-419 Titus lists the unit book:tit with the units it needs', async () => {
    const sample = await titus()
    const catalog = await build()
    const view = catalogView((await readSegment(catalog.bytes, { known: CATALOG_TABLES })).seg)
    const unit = view.units.find((u) => u.id === 'book:tit')!
    expect(unit.needs).toEqual(sample.needs)
    expect(unit.needs).toContain('orig:tit')
    expect(unit.needs).toContain('map')
    expect(unit.needs!.some((id) => id.startsWith('art:'))).toBe(true)
    // One unit per book, orig, map (core and part) and art group; the others need nothing.
    expect(view.units.map((u) => u.id)).toEqual([...sample.needs.filter((id) => id.startsWith('art:')), 'book:tit', 'map', 'orig:tit'].sort())
    expect(view.units.filter((u) => u.id !== 'book:tit').every((u) => u.needs === undefined)).toBe(true)
  })

  test('catalogView gives back what the catalog was built from (a language catalog)', async () => {
    const sample = await titus()
    const previous = bytesOfHex(fingerprint(255))
    const complements: Complement[] = [
      { kind: 'vectors', lang: 'es-419', id: bytesOfHex(fingerprint(21)), size: 1234, media: 'application/octet-stream', version: '2', for: 'queries-1', license: 'MIT' },
      { kind: 'classifier', id: bytesOfHex(fingerprint(20)), size: 10, media: 'application/json', version: '1' },
    ]
    const catalog = await build({
      about: { ...about, previous },
      resources: [resource('z/es-419/tw', { subject: 'Translation Words', books: new Uint8Array(9) }), resource(TN, { rights: 'unfoldingWord', attribution: 'Based on unfoldingWord' })],
      requires: [['common', 3, fingerprint(99)]],
      complements,
    })
    const { seg } = await readSegment(catalog.bytes, { known: CATALOG_TABLES })
    const view = catalogView(seg)

    expect(view.lang).toBe('es-419')
    expect(view.about).toEqual({ ...about, previous })
    expect(view.resources).toEqual([resource(TN, { rights: 'unfoldingWord', attribution: 'Based on unfoldingWord' }), resource('z/es-419/tw', { subject: 'Translation Words', books: new Uint8Array(9) })])
    expect(view.requires).toEqual([['common', 3, bytesOfHex(fingerprint(99))]])
    expect(view.complements).toEqual([complements[1], complements[0]])

    // The independent side of the segments: the files and the bodies written apart from the builder.
    expect(view.segments).toHaveLength(sample.built.length)
    for (const entry of view.segments) {
      const built = sample.built.find((b) => b.id === hex(entry.id))!
      const written = await writeSegment(built.seg)
      expect(entry.class).toBe(built.seg.h.class)
      expect(entry.size).toBe(built.bytes.length)
      expect(entry.ulen).toBe(written.body.length)
      expect(entry.inputs).toEqual(bytesOfHex(built.inputs))
      expect(entry.book).toBe(built.seg.h.book)
      expect(entry.part).toBe(built.seg.h.part)
      expect(entry.group).toBe(built.seg.h.group)
    }
  })

  test('the common catalog has no lang; a catalog may have no requires and no complements', async () => {
    const orig = (await titus()).built[1]
    const catalog = await buildCatalog({
      about: { ...about, catalog: 'common', publisher: 'unfoldingWord', origin: 'local', revision: 0 },
      resources: [],
      segments: [orig, await stub({ class: 'xmap', part: 'core' }, 40)],
    })
    const { seg, header } = await readSegment(catalog.bytes, { known: CATALOG_TABLES })
    expect('lang' in seg.h).toBe(false)
    expect(seg.h.tables).toEqual({ about: [1, true], resources: [1, true], segments: [1, true], units: [1, true] })
    expect('sig' in header).toBe(false)
    const view = catalogView(seg)
    expect('lang' in view).toBe(false)
    expect(view.requires).toBeUndefined()
    expect(view.complements).toBeUndefined()
    expect(view.resources).toEqual([])
    expect(view.about.origin).toBe('local')
    expect(view.units.map((u) => u.id)).toEqual(['orig:tit', 'xmap'])
  })

  test('requires and complements are tables of the header only when they have rows', async () => {
    const empty = await build({ requires: [], complements: [] })
    const plain = await build()
    expect(empty.id).toBe(plain.id)
    expect(plain.seg.h.tables).toEqual({ about: [1, true], resources: [1, true], segments: [1, true], units: [1, true] })
    const both = await build({ requires: [['common', 1, fingerprint(5)]], complements: [{ kind: 'numbers', id: bytesOfHex(fingerprint(6)), size: 1, media: 'text/plain', version: '1' }] })
    expect(both.seg.h.tables).toEqual({
      about: [1, true],
      resources: [1, true],
      segments: [1, true],
      units: [1, true],
      requires: [1, false],
      complements: [1, false],
    })
  })

  test('is unsigned', async () => {
    const catalog = await build()
    expect(readHeader(catalog.bytes).header.sig).toBeUndefined()
  })

  test('twice the same inputs give the same catalog, whatever the order of the lists', async () => {
    const sample = await titus()
    const a = await build()
    const b = await build()
    expect(b.id).toBe(a.id)
    expect(b.bytes).toEqual(a.bytes)
    expect(b.inputs).toBe(a.inputs)

    const shuffled = await build({ resources: [resource('es-419_gl/es-419/twl'), resource(TN)] }, [...sample.built].reverse())
    expect(shuffled.id).toBe(a.id)
  })

  test('another date, another revision or another segment gives another id', async () => {
    const sample = await titus()
    const a = await build()
    expect((await build({ about: { ...about, built: '2026-11-02T10:00:00Z' } })).id).not.toBe(a.id)
    expect((await build({ about: { ...about, revision: 5 } })).id).not.toBe(a.id)
    expect((await build({}, sample.built.slice(1))).id).not.toBe(a.id)
    // The same file with another fingerprint is the same segment for a reader, and another line in the catalog.
    const other = [{ ...sample.built[0], inputs: fingerprint(77) }, ...sample.built.slice(1)]
    expect((await build({}, other)).id).not.toBe(a.id)
  })

  test('the catalog says what it was built from: the sha256 of the sorted ids of its segments, requires and complements', async () => {
    const sample = await titus()
    const complement: Complement = { kind: 'numbers', id: bytesOfHex(fingerprint(6)), size: 1, media: 'text/plain', version: '1' }
    const catalog = await build({ requires: [['common', 1, fingerprint(5)]], complements: [complement] })
    const ids = [...sample.built.map((b) => b.id), fingerprint(5), fingerprint(6)].sort()
    expect(catalog.inputs).toBe(await sha256Hex(ids.join('\n')))
    // About and resources are not in it.
    const other = await build({ about: { ...about, revision: 9 }, requires: [['common', 1, fingerprint(5)]], complements: [complement] })
    expect(other.inputs).toBe(catalog.inputs)
    expect(other.id).not.toBe(catalog.id)
  })

  test('segments are ordered by class, book, part (core first), group and id', async () => {
    const segments = [
      await stub({ class: 'obs', lang: 'es-419' }, 2),
      await stub({ class: 'lex', lang: 'es-419', group: 'G5' }, 3),
      await stub({ class: 'lex', lang: 'es-419', group: 'G10' }, 4),
      await stub({ class: 'lex', lang: 'es-419', group: 'G0' }, 5),
      await stub({ class: 'art', lang: 'es-419', group: 'tw:names' }, 6),
      await stub({ class: 'art', lang: 'es-419', group: 'ta:translate' }, 7),
      await stub({ class: 'art', lang: 'es-419', group: 'tw:kt' }, 8),
      await stub({ class: 'orig', book: 'tit' }, 9),
      await stub({ class: 'orig', book: 'gen' }, 10),
      await stub({ class: 'book', lang: 'es-419', book: 'tit' }, 11),
      await stub({ class: 'book', lang: 'es-419', book: 'mat' }, 12),
      await stub({ class: 'book', lang: 'es-419', book: 'rut' }, 13),
      await stub({ class: 'map', lang: 'es-419', part: 'tit', book: 'tit' }, 14),
      await stub({ class: 'map', lang: 'es-419', part: 'core' }, 15),
      await stub({ class: 'map', lang: 'es-419', part: 'rut', book: 'rut' }, 16),
      await stub({ class: 'xmap', part: 'tit', book: 'tit' }, 17),
      await stub({ class: 'xmap', part: 'core' }, 18),
    ]
    const catalog = await buildCatalog({ about, resources: [], segments })
    const entries = catalogView(catalog.seg).segments.map((e) => [e.class, e.book ?? e.part ?? e.group].filter(Boolean).join(' '))
    expect(entries).toEqual([
      'xmap core',
      'xmap tit',
      'map core',
      'map rut',
      'map tit',
      'book rut',
      'book mat',
      'book tit',
      'orig gen',
      'orig tit',
      'art ta:translate',
      'art tw:kt',
      'art tw:names',
      'lex G0',
      'lex G10',
      'lex G5',
      'obs',
    ])
  })

  test('units point at the segments by their index in the catalog', async () => {
    const catalog = await build()
    const view = catalogView(catalog.seg)
    const segmentsOf = (id: string) => view.units.find((u) => u.id === id)!.segments.map((i) => view.segments[i])
    expect(segmentsOf('book:tit').map((e) => [e.class, e.book])).toEqual([['book', 'tit']])
    expect(segmentsOf('orig:tit').map((e) => [e.class, e.book])).toEqual([['orig', 'tit']])
    expect(segmentsOf('map').map((e) => e.part)).toEqual(['core', 'tit'])
    expect(segmentsOf('art:tw:kt').map((e) => e.group)).toEqual(['tw:kt'])
    for (const unit of view.units) expect(unit.segments).toEqual([...unit.segments].sort((a, b) => a - b))
  })

  test('is a catalog of class catalog, with the version 1 of every table', async () => {
    const catalog = await build()
    expect(catalog.seg.h.class).toBe('catalog')
    expect(catalog.seg.h.v).toBe(1)
    expect(catalog.seg.h.lang).toBe('es-419')
    const { id } = await readSegment(catalog.bytes, { known: CATALOG_TABLES, expectedId: catalog.id })
    expect(id).toBe(catalog.id)
  })

  describe('rejects what cannot go in a catalog', () => {
    const rejects = async (message: string, extra: Partial<Parameters<typeof buildCatalog>[0]>, segments?: BuiltSegment[]) => {
      await expect(build(extra, segments)).rejects.toThrow(message)
    }

    test('a segment twice', async () => {
      const sample = await titus()
      await rejects('twice', {}, [sample.built[0], ...sample.built])
    })
    test('a catalog or a gen segment', async () => {
      await rejects('catalog', {}, [await stub({ class: 'catalog', lang: 'es-419' })])
      await rejects('gen', {}, [await stub({ class: 'gen', lang: 'es-419' })])
    })
    test('two segments for one unit', async () => {
      const sample = await titus()
      await rejects('book:tit', {}, [...sample.built, await stub({ class: 'book', book: 'tit', lang: 'x' })])
    })
    test('a file that is not the segment', async () => {
      const [a, b] = [await stub({ class: 'obs' }, 1), await stub({ class: 'obs', lang: 'x' }, 2)]
      await rejects('another id', {}, [{ ...a, bytes: b.bytes }])
    })
    test('an id of a segment that is not hex', async () => {
      const a = await stub({ class: 'obs' }, 1)
      await expect(buildCatalog({ about, resources: [], segments: [{ ...a, id: 'xyz' }] })).rejects.toThrow('id')
    })
    test('an about with the wrong values', async () => {
      await rejects('format', { about: { ...about, format: '2.0' as never } })
      await rejects('origin', { about: { ...about, origin: 'remote' as never } })
      await rejects('revision', { about: { ...about, revision: -1 } })
      await rejects('revision', { about: { ...about, revision: 1.5 } })
      await rejects('built', { about: { ...about, built: 'yesterday' } })
      await rejects('direction', { about: { ...about, direction: 'up' as never } })
      await rejects('previous', { about: { ...about, previous: new Uint8Array(31) } })
      await rejects('catalog', { about: { ...about, catalog: '' } })
    })
    test('a resource twice, or with a book set that is not 9 bytes', async () => {
      await rejects('twice', { resources: [resource(TN), resource(TN)] })
      await rejects('books', { resources: [resource(TN, { books: new Uint8Array(8) })] })
      await rejects('title', { resources: [{ ...resource(TN), title: undefined as never }] })
    })
    test('a catalog twice in requires, an id that is not hex or a revision that is not a number', async () => {
      await rejects('twice', { requires: [['common', 1, fingerprint(1)], ['common', 2, fingerprint(2)]] })
      await rejects('requires', { requires: [['common', 1, 'abc']] })
      await rejects('revision', { requires: [['common', -1, fingerprint(1)]] })
    })
    test('a complement with an id that is not 32 bytes, twice, or without its version', async () => {
      const complement: Complement = { kind: 'numbers', id: bytesOfHex(fingerprint(6)), size: 1, media: 'text/plain', version: '1' }
      await rejects('id', { complements: [{ ...complement, id: new Uint8Array(31) }] })
      await rejects('twice', { complements: [complement, { ...complement }] })
      await rejects('version', { complements: [{ ...complement, version: undefined as never }] })
      await rejects('size', { complements: [{ ...complement, size: -1 }] })
    })
  })
})
