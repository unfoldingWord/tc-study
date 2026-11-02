import { describe, expect, test } from 'bun:test'
import { buildCatalog, builtSegment } from '../build/catalog'
import { readSegment, type Segment, writeSegment } from '../codec/container'
import { FormatError } from '../codec/errors'
import { bookSet } from '../ids'
import type { About, CatalogModel } from '../model'
import { CATALOG_TABLES, catalogView } from './catalog'

const about: About = {
  format: '3.0',
  catalog: 'es-419',
  publisher: 'unfoldingWord',
  origin: 'published',
  revision: 4,
  previous: new Uint8Array(32).fill(7),
  built: '2026-11-01T10:00:00Z',
  builder: 'bt-synergy language-pack-v3 0.1.0',
  name: 'español',
  direction: 'ltr',
}
const fingerprint = (n: number): string => n.toString(16).padStart(64, '0')
const idBytes = (n: number): Uint8Array => Uint8Array.from(fingerprint(n).match(/../g)!, (pair) => parseInt(pair, 16))

const stubs = [
  await builtSegment({ h: { class: 'book', v: 1, tables: {}, lang: 'es-419', book: 'tit' }, t: {} }, fingerprint(1)),
  await builtSegment({ h: { class: 'map', v: 1, tables: {}, lang: 'es-419', part: 'core' }, t: {} }, fingerprint(2)),
  await builtSegment({ h: { class: 'map', v: 1, tables: {}, lang: 'es-419', part: 'tit', book: 'tit' }, t: {} }, fingerprint(3)),
  await builtSegment({ h: { class: 'art', v: 1, tables: {}, lang: 'es-419', group: 'tw:kt' }, t: {} }, fingerprint(4)),
]

const catalog = await buildCatalog({
  about,
  resources: [{ key: 'es-419_gl/es-419/tn', title: 'tN', subject: 'TSV Translation Notes', release: 'v66', license: 'CC-BY-SA-4.0', rights: 'unfoldingWord', attribution: 'unfoldingWord', books: bookSet(['tit', 'rut']) }],
  segments: stubs,
  requires: [['common', 3, fingerprint(9)]],
  complements: [{ kind: 'vectors', lang: 'es-419', id: idBytes(8), size: 100, media: 'application/octet-stream', version: '2', for: 'queries-1', license: 'MIT' }],
  needs: (s) => (s.seg.h.class === 'book' ? ['map', 'art:tw:kt', 'orig:tit'] : []),
})

const fresh = (): Segment => structuredClone(catalog.seg)
const tables = (s: Segment) => s.t as Record<string, any>

describe('catalogView', () => {
  test('the untouched copy is fine, and has the tables of the catalog', () => {
    const view = catalogView(fresh())
    expect(view.lang).toBe('es-419')
    expect(view.about).toEqual(about)
    expect(view.resources).toHaveLength(1)
    expect(view.resources[0].books).toEqual(bookSet(['tit', 'rut']))
    expect(view.segments.map((e) => e.class)).toEqual(['map', 'map', 'book', 'art'])
    expect(view.units).toEqual([
      { id: 'art:tw:kt', segments: [3] },
      { id: 'book:tit', segments: [2], needs: ['art:tw:kt', 'map', 'orig:tit'] },
      { id: 'map', segments: [0, 1] },
    ])
    expect(view.requires).toEqual([['common', 3, idBytes(9)]])
    expect(view.complements).toEqual([{ kind: 'vectors', lang: 'es-419', id: idBytes(8), size: 100, media: 'application/octet-stream', version: '2', for: 'queries-1', license: 'MIT' }])
  })

  test('gives copies: changing the model does not change the segment it came from', () => {
    const seg = fresh()
    const before = structuredClone(seg)
    const view: CatalogModel = catalogView(seg)
    for (const bytes of [view.about.previous!, view.resources[0].books, view.segments[0].id, view.segments[0].inputs, view.requires![0][2], view.complements![0].id]) {
      bytes.fill(255)
    }
    view.units[1].needs![0] = 'x'
    view.units[2].segments[0] = 99
    expect(seg).toEqual(before)
  })

  test('keys it does not know are left alone, and so are tables it does not know', () => {
    const seg = fresh()
    tables(seg).about.future = 1
    tables(seg).resources[0].future = 'x'
    tables(seg).segments[0].future = [1]
    tables(seg).units[0].future = {}
    tables(seg).complements[0].future = 1
    seg.t.future = []
    seg.h.tables.future = [1, false]
    expect(catalogView(seg).about).toEqual(about)
  })

  test('the known tables are the six tables, version 1', () => {
    expect(CATALOG_TABLES).toEqual({ about: [1], resources: [1], segments: [1], units: [1], requires: [1], complements: [1] })
  })

  test('a segment that readSegment gave: write, read, view', async () => {
    const { bytes } = await writeSegment(fresh())
    const { seg } = await readSegment(bytes, { known: CATALOG_TABLES })
    expect(catalogView(seg).units).toHaveLength(3)
  })

  test('a reader that does not know requires and complements gets a catalog without them', async () => {
    const { seg, skipped } = await readSegment(catalog.bytes, { known: { about: [1], resources: [1], segments: [1], units: [1] } })
    expect(skipped.sort()).toEqual(['complements', 'requires'])
    const view = catalogView(seg)
    expect(view.requires).toBeUndefined()
    expect(view.complements).toBeUndefined()
    expect(view.units).toHaveLength(3)
  })

  test('the common catalog has no lang in its header', async () => {
    const common = await buildCatalog({ about: { ...about, catalog: 'common' }, resources: [], segments: [] })
    const view = catalogView(common.seg)
    expect('lang' in view).toBe(false)
    expect(view.segments).toEqual([])
    expect(view.units).toEqual([])
  })

  test('a catalog with no segments, no units and no resources is a catalog', () => {
    const seg = fresh()
    tables(seg).segments = []
    tables(seg).units = []
    tables(seg).resources = []
    expect(catalogView(seg).units).toEqual([])
  })

  test('an about without the optional keys is fine', () => {
    const seg = fresh()
    for (const key of ['previous', 'name', 'direction']) delete tables(seg).about[key]
    const { previous, name, direction, ...rest } = about
    const view = catalogView(seg).about
    expect(view).toEqual(rest)
    expect(Object.keys(view).sort()).toEqual(Object.keys(rest).sort())
  })

  test('both origins and both directions are accepted', () => {
    for (const origin of ['published', 'local']) {
      for (const direction of ['ltr', 'rtl']) {
        const seg = fresh()
        tables(seg).about.origin = origin
        tables(seg).about.direction = direction
        expect(catalogView(seg).about.origin).toBe(origin as never)
        expect(catalogView(seg).about.direction).toBe(direction as never)
      }
    }
  })

  const broken: [string, (s: Segment) => void][] = [
    ['another class', (s) => void (s.h.class = 'book')],
    ['a language catalog without lang', (s) => void delete s.h.lang],
    ['a lang that is not the catalog', (s) => void (s.h.lang = 'fr')],
    ['a common catalog with a lang', (s) => void (tables(s).about.catalog = 'common')],
    ['no about', (s) => void delete s.t.about],
    ['no resources', (s) => void delete s.t.resources],
    ['no segments', (s) => void delete s.t.segments],
    ['no units', (s) => void delete s.t.units],
    ['about that is a list', (s) => void (s.t.about = [])],
    ['a format that is not 3.0', (s) => void (tables(s).about.format = '2.0')],
    ['no format', (s) => void delete tables(s).about.format],
    ['an origin that is neither published nor local', (s) => void (tables(s).about.origin = 'remote')],
    ['no origin', (s) => void delete tables(s).about.origin],
    ['a catalog name that is not text', (s) => void (tables(s).about.catalog = 3)],
    ['no publisher', (s) => void delete tables(s).about.publisher],
    ['a revision that is not a number', (s) => void (tables(s).about.revision = '4')],
    ['a negative revision', (s) => void (tables(s).about.revision = -1)],
    ['a previous that is not 32 bytes', (s) => void (tables(s).about.previous = new Uint8Array(31))],
    ['a previous that is text', (s) => void (tables(s).about.previous = 'abc')],
    ['a built that is not text', (s) => void (tables(s).about.built = 1)],
    ['no builder', (s) => void delete tables(s).about.builder],
    ['a name that is not text', (s) => void (tables(s).about.name = 1)],
    ['a direction that is neither ltr nor rtl', (s) => void (tables(s).about.direction = 'up')],
    ['resources that is not a list', (s) => void (s.t.resources = {})],
    ['a resource that is not a map', (s) => void (tables(s).resources[0] = 'x')],
    ['a resource without key', (s) => void delete tables(s).resources[0].key],
    ['a resource without title', (s) => void delete tables(s).resources[0].title],
    ['a resource without subject', (s) => void delete tables(s).resources[0].subject],
    ['a resource without release', (s) => void delete tables(s).resources[0].release],
    ['a resource without license', (s) => void delete tables(s).resources[0].license],
    ['rights that are not text', (s) => void (tables(s).resources[0].rights = 1)],
    ['an attribution that is not text', (s) => void (tables(s).resources[0].attribution = [])],
    ['books of 8 bytes', (s) => void (tables(s).resources[0].books = new Uint8Array(8))],
    ['books of 10 bytes', (s) => void (tables(s).resources[0].books = new Uint8Array(10))],
    ['books that is a list', (s) => void (tables(s).resources[0].books = [0, 0, 0, 0, 0, 0, 0, 0, 0])],
    ['a resource key twice', (s) => void tables(s).resources.push({ ...tables(s).resources[0] })],
    ['segments that is not a list', (s) => void (s.t.segments = 'x')],
    ['a segment that is not a map', (s) => void (tables(s).segments[0] = 1)],
    ['a segment id of 31 bytes', (s) => void (tables(s).segments[0].id = new Uint8Array(31))],
    ['a segment id that is text', (s) => void (tables(s).segments[0].id = 'ab')],
    ['no segment id', (s) => void delete tables(s).segments[0].id],
    ['a segment id twice', (s) => void (tables(s).segments[1].id = tables(s).segments[0].id)],
    ['a class that is not a class', (s) => void (tables(s).segments[0].class = 'video')],
    ['no class', (s) => void delete tables(s).segments[0].class],
    ['a book that is not a book code', (s) => void (tables(s).segments[2].book = 'titus')],
    ['a book that is a number', (s) => void (tables(s).segments[2].book = 56)],
    ['a part that is neither core nor a book', (s) => void (tables(s).segments[0].part = 'everything')],
    ['a part that is a number', (s) => void (tables(s).segments[0].part = 1)],
    ['a group that is not text', (s) => void (tables(s).segments[3].group = 5)],
    ['a size that is not a number', (s) => void (tables(s).segments[0].size = '10')],
    ['a negative size', (s) => void (tables(s).segments[0].size = -1)],
    ['no ulen', (s) => void delete tables(s).segments[0].ulen],
    ['inputs of 31 bytes', (s) => void (tables(s).segments[0].inputs = new Uint8Array(31))],
    ['no inputs', (s) => void delete tables(s).segments[0].inputs],
    ['units that is not a list', (s) => void (s.t.units = {})],
    ['a unit that is not a map', (s) => void (tables(s).units[0] = [])],
    ['a unit without id', (s) => void delete tables(s).units[0].id],
    ['a unit with an empty id', (s) => void (tables(s).units[0].id = '')],
    ['a unit id twice', (s) => void (tables(s).units[1].id = tables(s).units[0].id)],
    ['a unit without segments', (s) => void delete tables(s).units[0].segments],
    ['a unit with an empty list of segments', (s) => void (tables(s).units[0].segments = [])],
    ['a unit with a segment index beyond the list', (s) => void (tables(s).units[0].segments = [4])],
    ['a unit with a negative segment index', (s) => void (tables(s).units[0].segments = [-1])],
    ['a unit with a segment index that is text', (s) => void (tables(s).units[0].segments = ['0'])],
    ['needs that is not a list', (s) => void (tables(s).units[1].needs = 'map')],
    ['needs with a number', (s) => void (tables(s).units[1].needs = ['map', 1])],
    ['requires that is not a list', (s) => void (s.t.requires = {})],
    ['a require that is not a list', (s) => void (tables(s).requires[0] = {})],
    ['a require of two items', (s) => void (tables(s).requires[0] = ['common', 3])],
    ['a require with a revision that is text', (s) => void (tables(s).requires[0][1] = '3')],
    ['a require with an id that is not 32 bytes', (s) => void (tables(s).requires[0][2] = new Uint8Array(3))],
    ['a require with a catalog that is not text', (s) => void (tables(s).requires[0][0] = 1)],
    ['complements that is not a list', (s) => void (s.t.complements = 'x')],
    ['a complement that is not a map', (s) => void (tables(s).complements[0] = 1)],
    ['a complement without kind', (s) => void delete tables(s).complements[0].kind],
    ['a complement id of 33 bytes', (s) => void (tables(s).complements[0].id = new Uint8Array(33))],
    ['a complement size that is not a number', (s) => void (tables(s).complements[0].size = 'big')],
    ['a complement without media', (s) => void delete tables(s).complements[0].media],
    ['a complement without version', (s) => void delete tables(s).complements[0].version],
    ['a complement lang that is not text', (s) => void (tables(s).complements[0].lang = 1)],
    ['a complement for that is not text', (s) => void (tables(s).complements[0].for = 1)],
    ['a complement license that is not text', (s) => void (tables(s).complements[0].license = 1)],
  ]
  for (const [name, change] of broken) {
    test(`rejects ${name} with E_BODY`, () => {
      const seg = fresh()
      change(seg)
      let error: unknown
      try {
        catalogView(seg)
      } catch (e) {
        error = e
      }
      expect(error).toBeInstanceOf(FormatError)
      expect((error as FormatError).code).toBe('E_BODY')
    })
  }
})
