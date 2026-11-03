import { beforeAll, describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import JSZip from 'jszip'
import { hex, readHeader, readSegment } from '../codec/container'
import type { About, CatalogModel, XtopicsCore } from '../model'
import { xtopicsView } from '../read/topics'
import { partsSource } from '../node/partsSource'
import { CATALOG_TABLES, catalogView } from '../read/catalog'
import { ORIGINALS, type ResourceRef, type Row, type RowFilter, type RowSource } from '../source/rows'
import { zipSource } from '../source/zipSource'
import { type BuiltSegment } from './catalog'
import { BUILDER, buildCommon, buildLanguage, inputsOf, licenseId } from './language'

// The sample is real files (spec/tests/data/README.md): es-419 Titus of the format 2.0 parts, three common parts (tW, the Greek
// lexicon), and the UGNT Titus.
const join = (...path: string[]) => path.join('/')
const DATA = join(import.meta.dir, '..', '..', 'spec', 'tests', 'data')
const LIST = join(DATA, 'es-419', 'list.json')
const ORIGINALS_LIST = join(DATA, 'originals', 'list.json')
const PARTS = join(DATA, 'parts')
const ES = 'es-419'
const TN = 'es-419_gl/es-419/tn'
const TQ = 'es-419_gl/es-419/tq'
const TW = 'es-419_gl/es-419/tw'
const UGL = 'es-419_gl/es-419/ugl'

const about: Omit<About, 'catalog'> = { format: '3.0', publisher: 'unfoldingWord', origin: 'published', revision: 1, built: '2026-11-01T10:00:00Z', builder: BUILDER }
const registry = () => ({})

const sample = () => partsSource({ list: LIST, partsDir: PARTS, originals: ORIGINALS_LIST })
const originalsOnly = () => partsSource({ list: ORIGINALS_LIST, partsDir: PARTS })

async function catalogOf(built: BuiltSegment): Promise<CatalogModel> {
  return catalogView((await readSegment(built.bytes, { known: CATALOG_TABLES })).seg)
}
const idsOf = (segments: BuiltSegment[]) => segments.map((s) => s.id)
const byClass = (segments: BuiltSegment[], cls: string) => segments.filter((s) => s.seg.h.class === cls)
const inputsByUnit = (segments: BuiltSegment[]) =>
  Object.fromEntries(segments.map((s) => [s.seg.h.class === 'map' ? `map:${s.seg.h.part}` : (s.seg.h.book ?? s.seg.h.group ?? s.seg.h.class), s.inputs]))

type Tweak = { ref?: (ref: ResourceRef, lang: string) => Partial<ResourceRef>; row?: (row: Row, f: RowFilter) => Row | null }
/** A source that is `source` with some resources or rows changed. */
function tweak(source: RowSource, t: Tweak): RowSource {
  return {
    async resources(lang) {
      return (await source.resources(lang)).map((ref) => ({ ...ref, ...t.ref?.(ref, lang) }))
    },
    async *rows(f) {
      for await (const row of source.rows(f)) {
        const out = t.row === undefined ? row : t.row(row, f)
        if (out !== null) yield out
      }
    },
  }
}

describe('inputsOf', () => {
  const rows = [
    { layer: 'sot', key: 'tn:a:tit' },
    { layer: 'quote', key: 'helps-quote:a:tit:1' },
  ]
  const resources = [
    { key: 'x/y/tn', stamp: 'v1#2026-01-01T00_00_00Z' },
    { key: 'x/y/tq', stamp: 'v2#2026-01-01T00_00_00Z' },
  ]

  test('is 64 lowercase hex digits and does not depend on the order of the rows or of the resources', () => {
    const one = inputsOf(rows, resources)
    expect(one).toMatch(/^[0-9a-f]{64}$/)
    expect(inputsOf([...rows].reverse(), [...resources].reverse())).toBe(one)
    expect(inputsOf(rows, [...resources, ...resources])).toBe(one)
  })

  test('changes with a stamp, with a resource, with a row, with a layer and with a row twice', () => {
    const one = inputsOf(rows, resources)
    expect(inputsOf(rows, [{ ...resources[0], stamp: 'v1#2027-01-01T00_00_00Z' }, resources[1]])).not.toBe(one)
    expect(inputsOf(rows, resources.slice(0, 1))).not.toBe(one)
    expect(inputsOf(rows.slice(0, 1), resources)).not.toBe(one)
    expect(inputsOf([rows[0], { layer: 'sot', key: rows[1].key }], resources)).not.toBe(one)
    expect(inputsOf([...rows, rows[0]], resources)).not.toBe(one)
  })

  test('does not mistake a row for a resource', () => {
    expect(inputsOf([{ layer: 'sot', key: 'a' }], [])).not.toBe(inputsOf([], [{ key: 'sot', stamp: 'a' }]))
  })
})

describe('licenseId', () => {
  test('maps the common texts without case, spaces and hyphens, and keeps the rest', () => {
    for (const text of ['CC BY-SA 4.0', 'cc-by-sa-4.0', 'CC BY SA 4.0', ' CC_BY-SA  4.0 ']) expect(licenseId(text)).toBe('CC-BY-SA-4.0')
    for (const text of ['CC BY 4.0', 'CC-BY-4.0']) expect(licenseId(text)).toBe('CC-BY-4.0')
    for (const text of ['CC0', 'cc0', 'CC0 1.0', 'CC0-1.0']) expect(licenseId(text)).toBe('CC0-1.0')
    expect(licenseId('MIT')).toBe('MIT')
    expect(licenseId('Some custom terms')).toBe('Some custom terms')
  })

  test('is "unknown" when there is no text', () => {
    expect(licenseId(undefined)).toBe('unknown')
    expect(licenseId('')).toBe('unknown')
    expect(licenseId('  ')).toBe('unknown')
  })
})

describe('buildLanguage: es-419 Titus and the common parts', () => {
  let first: Awaited<ReturnType<typeof buildLanguage>>
  let second: Awaited<ReturnType<typeof buildLanguage>>
  let catalog: CatalogModel

  beforeAll(async () => {
    first = await buildLanguage({ source: await sample(), lang: ES, registry: registry(), about })
    second = await buildLanguage({ source: await sample(), lang: ES, registry: registry(), about })
    catalog = await catalogOf(first.catalog)
  })

  test('twice gives the same ids, the same inputs and the same catalog', () => {
    expect(first.segments.length).toBeGreaterThan(0)
    expect(idsOf(second.segments)).toEqual(idsOf(first.segments))
    expect(second.segments.map((s) => s.inputs)).toEqual(first.segments.map((s) => s.inputs))
    expect(second.catalog.id).toBe(first.catalog.id)
    expect(second.report).toEqual(first.report)
  })

  test('has the book of Titus, the tW group of the sample and the Greek lexicon group, in the order of the catalog', () => {
    expect(first.segments.map((s) => [s.seg.h.class, s.seg.h.part ?? s.seg.h.book ?? s.seg.h.group])).toEqual([
      ['map', 'core'],
      ['map', 'tit'],
      ['book', 'tit'],
      ['art', 'tw:kt'],
      ['lex', 'G0'],
    ])
    // The segments are listed by the catalog in the order they are returned in.
    expect(catalog.segments.map((s) => hex(s.id))).toEqual(idsOf(first.segments))
    expect(catalog.units.map((u) => u.id)).toEqual(['art:tw:kt', 'book:tit', 'lex:G0', 'map'])
  })

  test('case 4: the Titus book segment is at most 40 KB', () => {
    const [tit] = byClass(first.segments, 'book')
    expect(tit.bytes.length).toBeLessThanOrEqual(40 * 1024)
    // The segments of the other classes are only listed here, to see what a language weighs.
    expect(byClass(first.segments, 'art')[0].bytes.length).toBeGreaterThan(0)
  })

  test('the catalog is the language catalog: its about, its segments with their sizes and inputs, no signature', async () => {
    expect(catalog.lang).toBe(ES)
    expect(catalog.about).toEqual({ ...about, catalog: ES })
    expect(catalog.requires).toBeUndefined()
    catalog.segments.forEach((entry, i) => {
      expect(entry.size).toBe(first.segments[i].bytes.length)
      expect(hex(entry.inputs)).toBe(first.segments[i].inputs)
      expect(entry.class).toBe(first.segments[i].seg.h.class)
    })
    expect(readHeader(first.catalog.bytes).header.sig).toBeUndefined()
  })

  test('the book unit needs its original, the map and the article groups its notes point to; the others need nothing', () => {
    const book = catalog.units.find((u) => u.id === 'book:tit')!
    expect(book.needs).toEqual(expect.arrayContaining(['orig:tit', 'map', 'art:tw:kt']))
    expect(book.needs).toEqual([...book.needs!].sort())
    expect(book.segments).toEqual([catalog.segments.findIndex((s) => s.class === 'book')])
    for (const id of ['art:tw:kt', 'lex:G0']) expect(catalog.units.find((u) => u.id === id)!.needs).toBeUndefined()
  })

  test('the resources are the ones some segment used, with what their lists say of them', () => {
    expect(catalog.resources.map((r) => r.key)).toEqual(['glt', 'gst', 'tn', 'tq', 'tw', 'twl', 'ugl'].map((id) => `es-419_gl/es-419/${id}`))
    const by = new Map(catalog.resources.map((r) => [r.key, r]))
    const tn = by.get(TN)!
    expect(tn).toEqual({
      key: TN,
      title: 'Notas de Traducción',
      subject: 'TSV Translation Notes',
      release: 'v66',
      license: 'CC-BY-SA-4.0',
      books: Uint8Array.from([0, 0, 0, 0, 0, 0, 128, 0, 0]),
    })
    expect(by.get(TW)!.books).toEqual(new Uint8Array(9))
    expect(by.get(UGL)).toMatchObject({ title: 'Español Latinoamericano', subject: 'Greek Lexicon', release: '60a78e039b', license: 'CC-BY-SA-4.0' })
    // Neither the lists nor the pack say who holds the rights or what credit to show.
    for (const resource of catalog.resources) expect('rights' in resource || 'attribution' in resource).toBe(false)
  })

  test('the report has a line for what the builders worked around, each with its scope', () => {
    expect(first.report.length).toBeGreaterThan(0)
    for (const line of first.report) expect(line).toMatch(/^(book [0-9a-z]{3}|art( (tw|ta):[^:\s]+)?|lex( [GH][0-9]+)?|obs): \S/)
    expect(first.report.some((line) => line.startsWith('book tit: es-419_gl/es-419/tn '))).toBe(true)
    expect(first.report.some((line) => line.startsWith('art tw:kt: tw:kt/believe '))).toBe(true)
    // A line about a whole lexicon file or resource has no group.
    expect(first.report.some((line) => line.startsWith(`lex: ${UGL}: `))).toBe(true)
  })

  test('the registry returned feeds a second build that gives the same articles', async () => {
    expect(Object.keys(first.registry).length).toBeGreaterThan(0)
    expect(Object.keys(first.registry)[0]).toContain(TW)
    const again = await buildLanguage({ source: await sample(), lang: ES, registry: JSON.parse(JSON.stringify(first.registry)), about })
    expect(idsOf(byClass(again.segments, 'art'))).toEqual(idsOf(byClass(first.segments, 'art')))
    expect(again.registry).toEqual(first.registry)
    expect(again.catalog.id).toBe(first.catalog.id)
  })

  test('requires is passed to the catalog as it is', async () => {
    const common = '0123456789abcdef'.repeat(4)
    const built = await buildLanguage({ source: await sample(), lang: ES, registry: registry(), about, requires: [['common', 7, common]] })
    const model = await catalogOf(built.catalog)
    expect(model.requires).toHaveLength(1)
    expect(model.requires![0][0]).toBe('common')
    expect(model.requires![0][1]).toBe(7)
    expect(hex(model.requires![0][2])).toBe(common)
    // The segments do not change: only the catalog does.
    expect(idsOf(built.segments)).toEqual(idsOf(first.segments))
    expect(built.catalog.id).not.toBe(first.catalog.id)
  })

  test('books restricts the books built, and the other classes stay', async () => {
    const same = await buildLanguage({ source: await sample(), lang: ES, books: ['tit'], registry: registry(), about })
    expect(same.catalog.id).toBe(first.catalog.id)

    const none = await buildLanguage({ source: await sample(), lang: ES, books: [], registry: registry(), about })
    expect(byClass(none.segments, 'book')).toEqual([])
    expect(none.segments.map((s) => s.seg.h.class)).toEqual(['map', 'art', 'lex'])
    expect(idsOf(none.segments).slice(1)).toEqual(idsOf(first.segments).slice(3))

    // A book the language has no resource of is left out, with a line.
    const rut = await buildLanguage({ source: await sample(), lang: ES, books: ['rut', 'tit', 'rut'], registry: registry(), about })
    expect(idsOf(byClass(rut.segments, 'book'))).toEqual(idsOf(byClass(first.segments, 'book')))
    expect(rut.report).toContain('book rut: es-419 has no resource of this book: left out')
  })

  test('a book that only a plain Bible (t4t) has is left out with a line: it is not a throw, and the rest is built', async () => {
    const t4t: ResourceRef = { key: 'es-419_gl/es-419/t4t', stamp: 'v1#2026-01-01T00_00_00Z', kind: 'Bible', books: ['tit'] }
    // The resources that make a book segment lose the book, and a Bible keeps it.
    const inner = tweak(await sample(), { ref: (_ref, lang) => (lang === ES ? { books: [] } : {}) })
    const source: RowSource = {
      rows: (f) => inner.rows(f),
      async resources(lang) {
        const refs = await inner.resources(lang)
        return lang === ES ? [...refs, t4t] : refs
      },
    }
    const built = await buildLanguage({ source, lang: ES, registry: registry(), about })
    expect(byClass(built.segments, 'book')).toEqual([])
    expect(built.report).toContain(
      'book tit: es-419 has resources of this book, but none of the subjects a book segment keeps (Aligned Bible, TSV Translation Notes, TSV Translation Questions, TSV Translation Words Links): left out',
    )
    // The same with the book named.
    const named = await buildLanguage({ source, lang: ES, books: ['tit'], registry: registry(), about })
    expect(byClass(named.segments, 'book')).toEqual([])
  })

  test('a code that is not one of the 66 books is refused', async () => {
    await expect(buildLanguage({ source: await sample(), lang: ES, books: ['xyz'], registry: registry(), about })).rejects.toThrow(RangeError)
  })

  test('a book whose originals the source lacks is left out with a line, and the rest is built', async () => {
    // No originals list at all.
    const bare = await partsSource({ list: LIST, partsDir: PARTS })
    // The originals are listed and have no book (a source that lists the resource and has no rows of it).
    const hidden = tweak(await sample(), { ref: (ref, lang) => (lang === ORIGINALS ? { books: [] } : {}), row: (row, f) => (f.lang === ORIGINALS ? null : row) })
    for (const source of [bare, hidden]) {
      const built = await buildLanguage({ source, lang: ES, registry: registry(), about })
      expect(built.segments.map((s) => s.seg.h.class)).toEqual(['map', 'art', 'lex'])
      const line = built.report.find((l) => l.startsWith('book tit: the source has no originals'))
      expect(line).toBeDefined()
      expect(line).toContain('waits for them')
      const model = await catalogOf(built.catalog)
      expect(model.units.map((u) => u.id)).toEqual(['art:tw:kt', 'lex:G0', 'map'])
      // The map lists every resource of the language (coverage), with no book in the ones of the book.
      expect(model.resources.map((r) => r.key)).toEqual(['glt', 'gst', 'tn', 'tq', 'tw', 'twl', 'ugl'].map((id) => `es-419_gl/es-419/${id}`))
    }
  })

  describe('inputs', () => {
    let base: Record<string, string>
    beforeAll(() => {
      base = inputsByUnit(first.segments)
    })
    const build = async (t: Tweak) => buildLanguage({ source: tweak(await sample(), t), lang: ES, registry: registry(), about })

    const changedUnits = (segments: BuiltSegment[]) => {
      const now = inputsByUnit(segments)
      return Object.keys(base).filter((k) => now[k] !== base[k]).sort()
    }

    test('are 64 hex digits and differ from one segment to another', () => {
      expect(Object.keys(base)).toEqual(['map:core', 'map:tit', 'tit', 'tw:kt', 'G0'])
      for (const value of Object.values(base)) expect(value).toMatch(/^[0-9a-f]{64}$/)
      expect(new Set(Object.values(base)).size).toBe(5)
    })

    test('do not change when nothing does', async () => {
      const same = await build({})
      expect(inputsByUnit(same.segments)).toEqual(base)
      expect(same.catalog.id).toBe(first.catalog.id)
    })

    test('change with the stamp of a resource the segment was read from, and only that segment', async () => {
      // The same release (v66) with another date: the segment is the same, its inputs are not.
      const notes = await build({ ref: (ref) => (ref.key === TN ? { stamp: 'v66#2030-01-01T00_00_00Z' } : {}) })
      expect(inputsByUnit(notes.segments)['tit']).not.toBe(base.tit)
      // the map part of the book carries the stamp of its tN, as the segment id does not change (catalog.md, "What changes")
      expect(changedUnits(notes.segments)).toEqual(['map:core', 'map:tit', 'tit'])
      expect(inputsByUnit(notes.segments)['tw:kt']).toBe(base['tw:kt'])
      expect(inputsByUnit(notes.segments)['G0']).toBe(base.G0)
      expect(notes.segments.find((s) => s.seg.h.class === 'book')!.id).toBe(first.segments.find((s) => s.seg.h.class === 'book')!.id)
      expect(notes.catalog.id).not.toBe(first.catalog.id)

      const words = await build({ ref: (ref) => (ref.key === TW ? { stamp: 'v37#2030-01-01T00_00_00Z' } : {}) })
      expect(inputsByUnit(words.segments)['tw:kt']).not.toBe(base['tw:kt'])
      expect(inputsByUnit(words.segments)['tit']).toBe(base.tit)
      expect(inputsByUnit(words.segments)['G0']).toBe(base.G0)

      const lexicon = await build({ ref: (ref) => (ref.key === UGL ? { stamp: '60a78e039c#2030-01-01T00_00_00Z' } : {}) })
      expect(inputsByUnit(lexicon.segments)['G0']).not.toBe(base.G0)
      expect(inputsByUnit(lexicon.segments)['tit']).toBe(base.tit)
    })

    test('change with the stamp of the book in the original', async () => {
      const moved = await build({ ref: (ref, lang) => (lang === ORIGINALS ? { bookStamps: { tit: 'gffffffffff' } } : {}) })
      expect(inputsByUnit(moved.segments)['tit']).not.toBe(base.tit)
      expect(inputsByUnit(moved.segments)['G0']).toBe(base.G0)
    })

    test('change with the set of rows read, and not with what they hold', async () => {
      // A quote row less in the notes: the notes lose a quote, and so do the inputs.
      let dropped = 0
      const fewer = await build({
        row: (row) => {
          if (row.layer === 'quote' && row.key.includes(TN) && row.key.endsWith(':tit:1')) {
            dropped++
            return null
          }
          return row
        },
      })
      expect(dropped).toBeGreaterThan(0)
      expect(inputsByUnit(fewer.segments)['tit']).not.toBe(base.tit)
      expect(changedUnits(fewer.segments)).toEqual(['map:core', 'map:tit', 'tit'])

      // Another word in a question: another segment with the same inputs (the stamp stands for the contents).
      const edited = await build({
        row: (row) => (row.layer === 'sot' && row.key.startsWith(`tq:${TQ}:tit`) ? { ...row, value: JSON.parse(JSON.stringify(row.value).replaceAll('Pablo', 'PABLO')) } : row),
      })
      expect(inputsByUnit(edited.segments)).toEqual(base)
      expect(edited.segments.find((s) => s.seg.h.class === 'book')!.id).not.toBe(first.segments.find((s) => s.seg.h.class === 'book')!.id)
    })
  })
})

describe('buildLanguage: a language with Open Bible Stories and a lexicon, and no books', () => {
  const OBS = 'unfoldingWord/en/obs'
  const OBS_OTHER = 'unfoldingWord/en/obs2'
  const LEX = 'unfoldingWord/en/ugl'
  const refs: ResourceRef[] = [
    { key: OBS, stamp: 'v12#2026-01-01T00_00_00Z', kind: 'Open Bible Stories', books: [], license: 'CC BY 4.0', rights: 'unfoldingWord', attribution: 'Open Bible Stories, by unfoldingWord' },
    { key: OBS_OTHER, stamp: 'v1#2026-01-01T00_00_00Z', kind: 'Open Bible Stories', books: [] },
    { key: LEX, stamp: 'a1#2026-01-02T00_00_00Z', kind: 'Greek Lexicon', books: [], title: 'English Lexicon', license: 'CC0' },
  ]
  const rows: Row[] = [
    {
      layer: 'sot',
      key: `obs:${OBS}:10`,
      value: {
        content: { storyNumber: 10, title: '10. The plagues', sourceReference: 'A Bible story from: Exodus 5-14', frames: [{ frameNumber: 1, imageUrl: 'u', text: 'God sent plagues.' }] },
        timestamp: 1,
        resourceKey: OBS,
        storyId: '10',
      },
    },
    {
      layer: 'sot',
      key: `${LEX}/content/5.json`,
      value: { brief: 'b', long: 'l', entries: [{ strong: 'G5', lemma: 'ἀβαρής', pos: ['adj.'], senses: [{ definition: 'light' }], weird: 'x' }] },
    },
    { layer: 'sot', key: `${LEX}/content/2005.json`, value: { brief: 'b', long: 'l', entries: [{ strong: 'G2005', lemma: 'ἐπί', senses: [{ definition: 'on' }] }] } },
  ]
  const synthetic = (changes: Tweak = {}): RowSource =>
    tweak(
      {
        async resources(lang) {
          return lang === ORIGINALS ? [] : refs
        },
        async *rows(f) {
          if (f.lang === ORIGINALS) return
          for (const row of rows) {
            const owner = row.key.startsWith('obs:') ? OBS : LEX
            if ((f.resource === undefined || f.resource === owner) && (f.layer === undefined || f.layer === row.layer)) yield row
          }
        },
      },
      changes,
    )

  test('builds an obs segment and one lexicon segment per group, with the scopes of the report', async () => {
    const built = await buildLanguage({ source: synthetic(), lang: 'en', registry: registry(), about })
    expect(built.segments.map((s) => [s.seg.h.class, s.seg.h.group ?? null])).toEqual([
      ['map', null],
      ['lex', 'G0'],
      ['lex', 'G2'],
      ['obs', null],
    ])
    expect(built.report.some((line) => line.startsWith('lex G0: G5 (unfoldingWord/en/ugl): has a key "weird"'))).toBe(true)
    expect(built.report.some((line) => line.startsWith('obs: 2 resources of Open Bible Stories'))).toBe(true)
    for (const line of built.report) expect(line).toMatch(/^(lex( G[0-9]+)?|obs): \S/)

    const catalog = await catalogOf(built.catalog)
    expect(catalog.units.map((u) => [u.id, u.needs])).toEqual([
      ['lex:G0', undefined],
      ['lex:G2', undefined],
      ['map', undefined],
      ['obs', undefined],
    ])
    // The map lists every resource of the language; the title is the key's last part when the source has none; the license is an SPDX id when it is a known text.
    expect(catalog.resources.map((r) => r.key)).toEqual([OBS, OBS_OTHER, LEX])
    expect(catalog.resources.filter((r) => r.key === OBS || r.key === LEX)).toEqual([
      { key: OBS, title: 'obs', subject: 'Open Bible Stories', release: 'v12', license: 'CC-BY-4.0', rights: 'unfoldingWord', attribution: 'Open Bible Stories, by unfoldingWord', books: new Uint8Array(9) },
      { key: LEX, title: 'English Lexicon', subject: 'Greek Lexicon', release: 'a1', license: 'CC0-1.0', books: new Uint8Array(9) },
    ])
  })

  test('the inputs of a lexicon group are the files of its numbers; those of the story, its rows', async () => {
    const base = inputsByUnit((await buildLanguage({ source: synthetic(), lang: 'en', registry: registry(), about })).segments)
    // Another file of group 2 changes group 2 only.
    const extraRow: Row = { layer: 'sot', key: `${LEX}/content/2006.json`, value: { brief: 'b', long: 'l', entries: [{ strong: 'G2006', lemma: 'x', senses: [{ definition: 'y' }] }] } }
    const plus = tweak(synthetic(), {})
    const withRow: RowSource = {
      resources: (lang) => plus.resources(lang),
      async *rows(f) {
        yield* plus.rows(f)
        if (f.lang !== ORIGINALS && (f.resource === undefined || f.resource === LEX) && f.layer === 'sot') yield extraRow
      },
    }
    const grown = inputsByUnit((await buildLanguage({ source: withRow, lang: 'en', registry: registry(), about })).segments)
    expect(grown['G2']).not.toBe(base['G2'])
    expect(grown['G0']).toBe(base['G0'])
    expect(grown['obs']).toBe(base['obs'])

    const restamped = inputsByUnit((await buildLanguage({ source: synthetic({ ref: (ref) => (ref.key === OBS ? { stamp: 'v12#2027-01-01T00_00_00Z' } : {}) }), lang: 'en', registry: registry(), about })).segments)
    expect(restamped['obs']).not.toBe(base['obs'])
    expect(restamped['G0']).toBe(base['G0'])
  })
})

describe('buildCommon: the original of Titus', () => {
  test('gives the orig segment and a common catalog with no language, no requires and no signature', async () => {
    const source = await originalsOnly()
    const built = await buildCommon({ source, about })
    expect(built.segments.map((s) => [s.seg.h.class, s.seg.h.book])).toEqual([['orig', 'tit']])

    const catalog = await catalogOf(built.catalog)
    expect(catalog.lang).toBeUndefined()
    await expect(readSegment(built.catalog.bytes, { known: CATALOG_TABLES }).then((r) => r.seg.h.lang)).resolves.toBeUndefined()
    expect(catalog.about).toEqual({ ...about, catalog: 'common' })
    expect(catalog.requires).toBeUndefined()
    expect(catalog.units).toEqual([{ id: 'orig:tit', segments: [0] }])
    expect(catalog.segments).toHaveLength(1)
    expect(hex(catalog.segments[0].id)).toBe(built.segments[0].id)
    expect(hex(catalog.segments[0].inputs)).toBe(built.segments[0].inputs)
    expect(catalog.resources).toEqual([
      {
        key: 'unfoldingWord/el-x-koine/ugnt',
        title: 'unfoldingWord® Greek New Testament',
        subject: 'Greek New Testament',
        release: 'v0.34',
        license: 'CC-BY-SA-4.0',
        books: Uint8Array.from([0, 0, 0, 0, 0, 0, 128, 0, 0]),
      },
    ])
    expect(readHeader(built.catalog.bytes).header.sig).toBeUndefined()
  })

  test('is the same twice; the orig segment is the one of the language build\'s Titus (same original, same positions)', async () => {
    const a = await buildCommon({ source: await originalsOnly(), about })
    const b = await buildCommon({ source: await originalsOnly(), books: ['tit'], about })
    expect(b.catalog.id).toBe(a.catalog.id)
    expect(idsOf(b.segments)).toEqual(idsOf(a.segments))
    const book = (await buildLanguage({ source: await sample(), lang: ES, registry: registry(), about })).segments.find((s) => s.seg.h.class === 'book')!
    expect(book.seg.h.orig).toEqual(a.segments[0].seg.h.orig)
  })

  test('its inputs change with the stamp of the book in the original', async () => {
    const base = await buildCommon({ source: await originalsOnly(), about })
    const moved = await buildCommon({
      source: tweak(await originalsOnly(), { ref: () => ({ bookStamps: { tit: 'gffffffffff' } }) }),
      about,
    })
    expect(moved.segments[0].inputs).not.toBe(base.segments[0].inputs)
    const same = await buildCommon({ source: tweak(await originalsOnly(), {}), about })
    expect(same.segments[0].inputs).toBe(base.segments[0].inputs)
  })

  test('a book the originals lack, or a code that is not a book, is an error', async () => {
    await expect(buildCommon({ source: await originalsOnly(), books: ['rut'], about })).rejects.toThrow('rut')
    await expect(buildCommon({ source: await originalsOnly(), books: ['xyz'], about })).rejects.toThrow(RangeError)
  })

  test('a source with no originals gives a catalog with no segments', async () => {
    const built = await buildCommon({ source: await partsSource({ list: LIST, partsDir: PARTS }), about })
    expect(built.segments).toEqual([])
    const catalog = await catalogOf(built.catalog)
    expect(catalog.units).toEqual([])
    expect(catalog.resources).toEqual([])
  })
})

describe('buildCommon: the xmap unit', () => {
  const english = () => partsSource({ list: join(DATA, 'en', 'list.json'), partsDir: PARTS, originals: ORIGINALS_LIST })
  const partOf = (b: { segments: BuiltSegment[] }) => b.segments.find((s) => s.seg.h.class === 'xmap' && s.seg.h.part === 'tit')!

  test('lists the unit xmap (core and the part of Titus, no needs); the orig unit is unchanged', async () => {
    const plain = await buildCommon({ source: await english(), about })
    const mapped = await buildCommon({ source: await english(), about, mapLang: 'en' })
    expect(plain.segments.map((s) => s.seg.h.class)).toEqual(['orig'])
    const catalog = await catalogOf(mapped.catalog)
    const xmap = catalog.units.find((u) => u.id === 'xmap')!
    expect(xmap.needs).toBeUndefined()
    expect(xmap.segments.map((i) => mapped.segments[i].seg.h.part).sort()).toEqual(['core', 'tit'])
    expect(catalog.units.map((u) => u.id)).toEqual(['orig:tit', 'xmap'])
    expect(catalog.units[0].needs).toBeUndefined()
    const orig = mapped.segments.find((s) => s.seg.h.class === 'orig')!
    expect(orig.id).toBe(plain.segments[0].id)
    expect(orig.inputs).toBe(plain.segments[0].inputs)
  })

  test('without mapLang the catalog is the phase 1 one; with it, twice gives the same catalog id', async () => {
    const a = await buildCommon({ source: await english(), about })
    const b = await buildCommon({ source: await originalsOnly(), about })
    expect(a.catalog.id).toBe(b.catalog.id)
    expect(a.report).toEqual([])
    const one = await buildCommon({ source: await english(), about, mapLang: 'en' })
    const two = await buildCommon({ source: await english(), about, mapLang: 'en' })
    expect(two.catalog.id).toBe(one.catalog.id)
    expect(one.catalog.id).not.toBe(a.catalog.id)
  })

  test('the catalog lists the helps the map read, with their licenses; without mapLang only the originals', async () => {
    const mapped = await catalogOf((await buildCommon({ source: await english(), about, mapLang: 'en' })).catalog)
    const plain = await catalogOf((await buildCommon({ source: await english(), about })).catalog)
    expect(plain.resources.map((r) => r.key)).toEqual(['unfoldingWord/el-x-koine/ugnt'])
    const keys = mapped.resources.map((r) => r.key)
    expect(keys).toEqual([...keys].sort())
    for (const suffix of ['/tn', '/twl', '/tw', '/ta']) expect(keys.some((k) => k.endsWith(suffix))).toBe(true)
    for (const r of mapped.resources) expect(r.license).not.toBe('unknown')
  })

  test('the core inputs follow the help rows and stamps', async () => {
    const base = await buildCommon({ source: await english(), about, mapLang: 'en' })
    const core = (b: typeof base) => b.segments.find((s) => s.seg.h.class === 'xmap' && s.seg.h.part === 'core')!
    const moved = await buildCommon({
      source: tweak(await english(), { ref: (ref, lang) => (lang === 'en' && ref.key.endsWith('/tw') ? { stamp: 'v99#2030-01-01T00_00_00Z' } : {}) }),
      about,
      mapLang: 'en',
    })
    expect(core(moved).inputs).not.toBe(core(base).inputs)
    const fewer = await buildCommon({ source: tweak(await english(), { row: (row, f) => (f.resource?.endsWith('/tn') && f.book === 'tit' && row.key.endsWith(':1') ? null : row) }), about, mapLang: 'en' })
    expect(core(fewer).inputs).not.toBe(core(base).inputs)
  })

  /** `source` with a second book, Matthew, that is Titus under another code (rows copied with the key rewritten). */
  function withMatthew(source: RowSource, titStamp?: string): RowSource {
    const base = tweak(source, {
      ref: (ref, lang) => {
        if (!ref.books.includes('tit')) return {}
        const out: Partial<ResourceRef> = { books: ['mat', 'tit'] }
        if (lang === ORIGINALS && ref.bookStamps !== undefined) {
          out.bookStamps = { ...ref.bookStamps, mat: ref.bookStamps.tit, ...(titStamp === undefined ? {} : { tit: titStamp }) }
        }
        return out
      },
    })
    return {
      resources: (lang) => base.resources(lang),
      async *rows(f) {
        if (f.book !== 'mat') return yield* base.rows(f)
        for await (const row of base.rows({ ...f, book: 'tit' })) yield { ...row, key: row.key.replaceAll(':tit', ':mat') }
      },
    }
  }

  test('each part carries the stamp of its own book of the original; the core one stamp per book', async () => {
    const base = await buildCommon({ source: withMatthew(await english()), about, mapLang: 'en', books: ['mat', 'tit'] })
    const moved = await buildCommon({ source: withMatthew(await english(), 'gffffffffff'), about, mapLang: 'en', books: ['mat', 'tit'] })
    const inputs = (b: typeof base) =>
      Object.fromEntries(b.segments.map((s) => [s.seg.h.class === 'xmap' || s.seg.h.class === 'orig' ? `${s.seg.h.class}:${s.seg.h.part ?? s.seg.h.book}` : s.seg.h.class, s.inputs]))
    const was = inputs(base)
    const now = inputs(moved)
    expect(Object.keys(was).sort()).toEqual(['orig:mat', 'orig:tit', 'xmap:core', 'xmap:mat', 'xmap:tit'])
    const changed = Object.keys(was).filter((k) => was[k] !== now[k]).sort()
    expect(changed).toEqual(['orig:tit', 'xmap:core', 'xmap:tit'])
  })

  test('a new release of a source changes inputs, not the id of the part', async () => {
    const base = await buildCommon({ source: await english(), about, mapLang: 'en' })
    const moved = await buildCommon({
      source: tweak(await english(), { ref: (ref, lang) => (lang === 'en' && ref.key.endsWith('/tn') ? { stamp: 'v99#2030-01-01T00_00_00Z' } : {}) }),
      about,
      mapLang: 'en',
    })
    expect(partOf(moved).inputs).not.toBe(partOf(base).inputs)
    expect(partOf(moved).id).toBe(partOf(base).id)
  })
})

describe('a language read from a zip pack: each layer file is read once, however many books', () => {
  const XX = 'xx'
  const GLT_KEY = 'o_gl/xx/glt'
  const UGNT_KEY = 'unfoldingWord/el-x-koine/ugnt'
  const BOOKS = ['mat', 'mrk', 'luk', 'jhn', 'act', 'rom', '1co', '2co', 'gal', 'eph']
  const enc = (key: string) => encodeURIComponent(key).replace(/%/g, '~')
  const word = (form: string) => ({ type: 'char', marker: 'w', 'x-occurrence': '1', 'x-occurrences': '1', content: [form] })
  const chapter = (content: unknown[]) => ({ content: { usj: { type: 'USJ', version: '3.1', content } } })
  const body = (...nodes: unknown[]) => [{ type: 'chapter', marker: 'c', number: '1' }, { type: 'para', marker: 'p', content: [{ type: 'verse', marker: 'v', number: '1' }, ...nodes] }]
  const milestone = { type: 'ms', marker: 'zaln-s', 'x-content': 'Παῦλος', 'x-occurrence': '1', 'x-occurrences': '1' }

  async function pack(): Promise<Uint8Array> {
    const zip = new JSZip()
    const resource = (key: string, role: string, subject: string, rows: Record<string, number>) => ({ key, role, stamp: 'v1#2026-01-01T00_00_00Z', subject, rows, books: BOOKS })
    zip.file(
      'manifest.json',
      JSON.stringify({
        format: 'bt-synergy-language-pack',
        formatVersion: '1.1.0',
        language: XX,
        kind: 'language',
        resources: [resource(GLT_KEY, 'language', 'Aligned Bible', { sot: BOOKS.length, prepared: BOOKS.length }), resource(UGNT_KEY, 'original', 'Greek New Testament', { sot: 2 * BOOKS.length })],
      }),
    )
    const file = (layer: string, key: string, rows: [string, unknown][]) => zip.file(`rows/${layer}/${enc(key)}.jsonl`, rows.map(([k, entry]) => JSON.stringify({ key: k, entry })).join('\n') + '\n')
    file('sot', GLT_KEY, BOOKS.map((book) => [`scripture-usj:${GLT_KEY}:${book}:1`, chapter(body(milestone, word('Pablo'), { type: 'ms', marker: 'zaln-e' }))]))
    // A layer no builder asks for: a file nobody should open.
    file('prepared', GLT_KEY, BOOKS.map((book) => [`prepared:text:${GLT_KEY}:${book}:1`, { junk: true }]))
    file(
      'sot',
      UGNT_KEY,
      BOOKS.flatMap((book): [string, unknown][] => [
        [`scripture-usj:${UGNT_KEY}:${book}`, { content: { chapterNumbers: [1] } }],
        [`scripture-usj:${UGNT_KEY}:${book}:1`, chapter(body(word('Παῦλος')))],
      ]),
    )
    return zip.generateAsync({ type: 'uint8array' })
  }

  test('a build of 10 books inflates each layer file once at most, never the layer it does not read, and gives the ids of ten builds of one book', async () => {
    const bytes = await pack()
    const reads: Record<string, number> = {}
    const loadAsync = JSZip.loadAsync
    ;(JSZip as any).loadAsync = async (data: unknown, options: unknown) => {
      const zip = await loadAsync.call(JSZip, data as Uint8Array, options as never)
      const file = zip.file.bind(zip) as (name: unknown) => any
      ;(zip as any).file = (name: unknown) => {
        const entry = file(name)
        if (typeof name === 'string' && entry) {
          const inflate = entry.async.bind(entry)
          entry.async = (...args: unknown[]) => {
            reads[name] = (reads[name] ?? 0) + 1
            return inflate(...args)
          }
        }
        return entry
      }
      return zip
    }
    let all: Awaited<ReturnType<typeof buildLanguage>>
    try {
      all = await buildLanguage({ source: await zipSource(bytes), lang: XX, registry: registry(), about })
    } finally {
      ;(JSZip as any).loadAsync = loadAsync
    }
    const books = byClass(all.segments, 'book')
    expect(books.map((s) => s.seg.h.book)).toEqual(BOOKS)
    expect(books.every((s) => s.seg.t.align !== undefined)).toBe(true)

    const layerFiles = Object.entries(reads).filter(([name]) => name.startsWith('rows/'))
    expect(layerFiles.length).toBeGreaterThan(0)
    for (const [name, count] of layerFiles) expect(`${name}: ${count}`).toBe(`${name}: 1`)
    expect(Object.keys(reads).some((name) => name.startsWith('rows/prepared/'))).toBe(false)

    // The cache changes nothing: one build per book, each from a source of its own, gives the same segments and inputs.
    for (const book of BOOKS) {
      const one = await buildLanguage({ source: await zipSource(bytes), lang: XX, books: [book], registry: registry(), about })
      const [alone] = byClass(one.segments, 'book')
      const together = books.find((s) => s.seg.h.book === book)!
      expect(alone.id).toBe(together.id)
      expect(alone.inputs).toBe(together.inputs)
    }
  }, 60_000)
})

describe('buildLanguage: the map unit', () => {
  test('lists the unit map, and every need names a unit of the language or of the common catalog', async () => {
    const built = await buildLanguage({ source: await sample(), lang: ES, registry: registry(), about })
    const catalog = await catalogOf(built.catalog)
    const map = catalog.units.find((u) => u.id === 'map')!
    expect(map).toBeDefined()
    expect(map.segments.map((i) => built.segments[i].seg.h.part).sort()).toEqual(['core', 'tit'])
    const ids = new Set(catalog.units.map((u) => u.id))
    // The sample has no article group of ta, tw:names or tw:other: the book does not need them (it could never activate), and says so.
    for (const unit of catalog.units) for (const need of unit.needs ?? []) expect(ids.has(need) || need.startsWith('orig:')).toBe(true)
    expect(catalog.units.find((u) => u.id === 'book:tit')!.needs).toEqual(['art:tw:kt', 'map', 'orig:tit'])
    expect(built.report.some((line) => line.startsWith('book tit: its notes point to art:ta:translate, art:tw:names, art:tw:other, which this catalog does not build'))).toBe(true)
  })
})

describe('buildCommon: the xtopics unit', () => {
  const english = () => partsSource({ list: join(DATA, 'en', 'list.json'), partsDir: PARTS, originals: ORIGINALS_LIST })
  const TOPICS = join(DATA, 'topics')
  const read = (path: string) => readFileSync(join(TOPICS, path), 'utf8')
  const topics = () => {
    const obs = new Map<number, string>()
    let n = 0
    for (const line of read('obs-refs.txt').split(/\r?\n/)) {
      const h = /^=== (\d+)$/.exec(line)
      if (h) obs.set((n = Number(h[1])), '')
      else if (n > 0) obs.set(n, `${obs.get(n)}${line}\n`)
    }
    const theo = (name: string) => read(`theographic-subset/${name}.json`)
    return { tipnr: read('tipnr-subset.txt'), theographic: { events: theo('events'), verses: theo('verses'), people: theo('people'), places: theo('places') }, obs }
  }

  test('lists the unit xtopics (no needs); the xmap and orig segments are the same bytes as without topics', async () => {
    const plain = await buildCommon({ source: await english(), about, mapLang: 'en' })
    const withTopics = await buildCommon({ source: await english(), about, mapLang: 'en', topics: topics() })
    const catalog = await catalogOf(withTopics.catalog)
    expect(catalog.units.map((u) => u.id)).toEqual(['orig:tit', 'xmap', 'xtopics'])
    expect(catalog.units.find((u) => u.id === 'xtopics')!.needs).toBeUndefined()
    const mapLike = (b: { segments: BuiltSegment[] }) => b.segments.filter((s) => s.seg.h.class === 'xmap' || s.seg.h.class === 'orig')
    expect(mapLike(withTopics).map((s) => [s.id, s.inputs, hex(s.bytes)])).toEqual(mapLike(plain).map((s) => [s.id, s.inputs, hex(s.bytes)]))
    for (const s of mapLike(withTopics)) expect(JSON.stringify(s.seg.h)).not.toContain('topics')
    const keys = catalog.resources.map((r) => r.key)
    expect(keys).toEqual([...keys].sort())
    expect(keys).toContain('STEPBible/STEPBible-Data/TIPNR')
    for (const r of catalog.resources) expect(r.license).not.toBe('unknown')
    expect(withTopics.report.every((line) => !plain.report.includes(line) ? line.startsWith('topics: ') : true)).toBe(true)
    // The sections of the outline of the English tN introduction of Titus, whole chapters to the UHB's last verse
    const core = withTopics.segments.find((s) => s.seg.h.class === 'xtopics' && s.seg.h.part === 'core')!
    const view = xtopicsView(core.seg) as XtopicsCore
    expect([...view.topics.keys()].filter((id) => id.startsWith('sec:tit/')).length).toBeGreaterThan(0)
    expect(withTopics.report.some((line) => line.startsWith('topics: outline tit: no introduction'))).toBe(false)
    expect(keys).toContain('unfoldingWord/en/tn')
    const again = await buildCommon({ source: await english(), about, mapLang: 'en', topics: topics() })
    expect(again.catalog.id).toBe(withTopics.catalog.id)
  })
})
