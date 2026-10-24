import { describe, expect, test } from 'bun:test'
import { compatKeyOf } from '../catalog'
import { PACK_FORMAT_VERSION, PARTS_FORMAT_VERSION, type PackVersions } from '../types'
import { LIST_DROPPED_FIELDS, originalsListPath, partsListPath, restoreCatalogBookkeeping, serializePartsList, unitOfPart, type PartEntry, type PartsList } from './partsList'

const VERSIONS: PackVersions = {
  sot: { usjProcessing: '2.3.0-usj' },
  prepared: { scripturePrepare: 6000230 },
  quote: { helpsQuote: 9 },
  align: { helpsAlign: 12 },
  text: { helpsText: 1 },
}

const FP = 'f'.repeat(64)
const CODE = `${compatKeyOf(PARTS_FORMAT_VERSION, VERSIONS)}+0123456789abcdef`

const PARTS: PartEntry[] = [
  { sha256: 'c3', bytes: 30, rows: 3, kind: 'tw', resource: 'unfoldingWord/en/tw', group: 'kt:3', fingerprint: FP, layers: ['sot', 'prepared'] },
  { sha256: 'a1', bytes: 10, rows: 1, kind: 'book', resource: 'unfoldingWord/en/ult', book: 'rut', fingerprint: FP, layers: ['sot', 'prepared'] },
  { sha256: 'b2', bytes: 20, rows: 2, kind: 'book', resource: 'unfoldingWord/en/tn', book: 'jon', fingerprint: FP, layers: ['sot', 'prepared', 'quote'] },
  { sha256: 'b1', bytes: 20, rows: 2, kind: 'book', resource: 'unfoldingWord/en/tn', book: 'rut', fingerprint: FP, layers: ['sot', 'prepared', 'quote'] },
  { sha256: 'd4', bytes: 40, rows: 4, kind: 'alignments', resource: 'unfoldingWord/en/tn', book: 'rut', fingerprint: FP, layers: ['align'] },
]

const UNITS = [
  { id: 'book rut', fingerprint: 'a'.repeat(64) },
  { id: 'shared', fingerprint: 'b'.repeat(64) },
  { id: 'book jon', fingerprint: 'c'.repeat(64) },
]

function list(parts: PartEntry[], resourcesReversed = false, dated = false, units = UNITS): PartsList {
  const resources: PartsList['resources'] = [
    {
      key: 'unfoldingWord/en/tn',
      stamp: 'v80#2026-01-01T00:00:00Z',
      role: 'language',
      subject: 'TSV Translation Notes',
      title: 'Notes',
      books: ['rut', 'jon'],
      metadata: {
        resourceKey: 'unfoldingWord/en/tn',
        contentMetadata: { bookBlobs: { rut: 'aa', jon: 'bb' }, ...(dated ? { downloadStats: { lastDownload: '2026-10-22' } } : {}) },
        release: { tag_name: 'v80', published_at: '2026-01-01T00:00:00Z' },
        ...(dated ? { catalogedAt: '2026-10-22T10:00:00Z', updatedAt: '2026-10-22T10:00:01Z', accessedAt: 'x', accessCount: 3, timestamp: 9 } : {}),
      },
    },
    { key: 'unfoldingWord/en/tw', stamp: 'v80#2026-01-01T00:00:00Z', role: 'language', subject: 'Translation Words', title: 'Words', metadata: {} },
    { key: 'unfoldingWord/en/ult', stamp: 'v80#2026-01-01T00:00:00Z', role: 'language', subject: 'Aligned Bible', title: 'ULT', books: ['rut'], metadata: {} },
  ]
  return {
    schema: 2,
    language: 'en',
    compat: compatKeyOf(PARTS_FORMAT_VERSION, VERSIONS),
    code: CODE,
    versions: VERSIONS,
    resources: resourcesReversed ? [...resources].reverse() : resources,
    parts,
    originals: { path: 'catalog/x/originals/ff.json', sha256: 'ff' },
    units,
  }
}

describe('the parts list', () => {
  test('serializes the same whatever order its parts and resources were added in', () => {
    expect(serializePartsList(list([...PARTS].reverse(), true))).toBe(serializePartsList(list(PARTS)))
  })

  test('sorts parts by kind, resource, book and group', () => {
    const parsed = JSON.parse(serializePartsList(list([...PARTS].reverse()))) as PartsList
    expect(parsed.parts.map((p) => p.sha256)).toEqual(['d4', 'b2', 'b1', 'a1', 'c3'])
    expect(parsed.resources.map((r) => r.key)).toEqual(['unfoldingWord/en/tn', 'unfoldingWord/en/tw', 'unfoldingWord/en/ult'])
  })

  test('carries no date of the build: catalog bookkeeping is left out of each resource’s metadata', () => {
    const text = serializePartsList(list(PARTS, false, true))
    expect(text).toBe(serializePartsList(list(PARTS)))
    for (const field of LIST_DROPPED_FIELDS) expect(text).not.toContain(`"${field}"`)
    // What Door43 published stays: it is the same on every build of the same release.
    expect(text).toContain('"published_at"')
    expect(text).toContain('"bookBlobs"')
  })

  test('lives at catalog/<compat>/<language>.json', () => {
    expect(partsListPath('f2.0-u2.3.0-p6000230-q9-a12-t1', 'es-419')).toBe('catalog/f2.0-u2.3.0-p6000230-q9-a12-t1/es-419.json')
    expect(partsListPath('f2.0-x', 'originals')).toBe('catalog/f2.0-x/originals.json')
  })

  test('is filed under format 2.0, while whole packs stay 1.1 for the apps already out there', () => {
    expect(PARTS_FORMAT_VERSION).toBe('2.0.0')
    expect(compatKeyOf(PARTS_FORMAT_VERSION, VERSIONS).startsWith('f2.0-')).toBe(true)
    // Deployed apps refuse a whole pack of format major 2; the f1.1 lists stay until every app has moved (spec §3).
    expect(PACK_FORMAT_VERSION).toBe('1.1.0')
  })

  test('sorts each resource’s books', () => {
    const parsed = JSON.parse(serializePartsList(list(PARTS))) as PartsList
    expect(parsed.resources.find((r) => r.key === 'unfoldingWord/en/tn')?.books).toEqual(['jon', 'rut'])
  })

  test('writes a date in metadata the way JSON.stringify does, not as an empty object', () => {
    const at = new Date('2026-01-01T00:00:00.000Z')
    const base = list(PARTS)
    const withDate = { ...base, resources: base.resources.map((r) => ({ ...r, metadata: { ...(r.metadata as object), releasedOn: at } })) }
    const parsed = JSON.parse(serializePartsList(withDate)) as PartsList
    expect((parsed.resources[0].metadata as { releasedOn: unknown }).releasedOn).toBe('2026-01-01T00:00:00.000Z')
  })
})

describe('fingerprints and units in the list', () => {
  test('units serialize alike whatever order they were added in, sorted by id', () => {
    expect(serializePartsList(list(PARTS, false, false, [...UNITS].reverse()))).toBe(serializePartsList(list(PARTS)))
    const parsed = JSON.parse(serializePartsList(list(PARTS))) as PartsList
    expect(parsed.units?.map((u) => u.id)).toEqual(['book jon', 'book rut', 'shared'])
  })

  test('every part carries its fingerprint, and a part without one is a type error', () => {
    const parsed = JSON.parse(serializePartsList(list(PARTS))) as PartsList
    expect(parsed.parts.every((p) => p.fingerprint === FP)).toBe(true)
    // The build must give one: a part the next run cannot compare would never be carried, or worse, always be.
    // @ts-expect-error fingerprint is required
    const missing: PartEntry = { sha256: 'e5', bytes: 1, rows: 1, kind: 'titles', resource: 'unfoldingWord/en/tw', layers: ['text'] }
    expect(missing.fingerprint).toBeUndefined()
  })

  test('names the code its fingerprints were computed with, and a list without it is a type error', () => {
    expect((JSON.parse(serializePartsList(list(PARTS))) as PartsList).code).toBe(CODE)
    // A reader (delivery 3's Worker) recomputes fingerprints with the list's code, not with versions of its own.
    const { code: _, ...rest } = list(PARTS)
    // @ts-expect-error code is required
    const missing: PartsList = rest
    expect(missing.code).toBeUndefined()
  })

  test('a list without units (the originals list) serializes without them', () => {
    const { units: _, ...rest } = list(PARTS)
    expect(JSON.parse(serializePartsList(rest)).units).toBeUndefined()
  })

  test('the originals list a language names lives at its content address', () => {
    const sha = '0123456789abcdef'.repeat(4)
    expect(originalsListPath('f2.0-u2.3.0-p6000230-q9-a12-t1', sha)).toBe(`catalog/f2.0-u2.3.0-p6000230-q9-a12-t1/originals/${sha}.json`)
  })

  test('a part’s unit: its book for book, alignments and original parts; shared for the rest', () => {
    expect(unitOfPart({ kind: 'book', book: 'rut' })).toBe('book rut')
    expect(unitOfPart({ kind: 'alignments', book: 'jon' })).toBe('book jon')
    expect(unitOfPart({ kind: 'original', book: 'tit' })).toBe('book tit')
    expect(unitOfPart({ kind: 'macula', book: 'rut' })).toBe('shared')
    for (const kind of ['tw', 'ta', 'titles', 'lexicon', 'obs'] as const) expect(unitOfPart({ kind })).toBe('shared')
    expect(() => unitOfPart({ kind: 'book' })).toThrow(/no book/)
  })
})

describe('restoreCatalogBookkeeping', () => {
  test('gives an imported catalog row back the fields the list leaves out and the catalog requires', () => {
    const now = Date.parse('2026-10-22T12:00:00.000Z')
    const metadata = { resourceKey: 'unfoldingWord/en/tn', release: { tag_name: 'v80', published_at: '2026-01-01T00:00:00Z' } }
    const row = restoreCatalogBookkeeping(metadata, now)
    expect(row.catalogedAt).toBe('2026-10-22T12:00:00.000Z')
    expect(row.resourceKey).toBe('unfoldingWord/en/tn')
    expect(row.release?.published_at).toBe('2026-01-01T00:00:00Z')
    expect('catalogedAt' in metadata).toBe(false)
  })
})
