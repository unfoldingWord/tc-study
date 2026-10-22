import { describe, expect, test } from 'bun:test'
import { compatKeyOf } from '../catalog'
import { PACK_FORMAT_VERSION, type PackVersions } from '../types'
import { LIST_DROPPED_FIELDS, partsListPath, serializePartsList, type PartEntry, type PartsList } from './partsList'

const VERSIONS: PackVersions = {
  sot: { usjProcessing: '2.3.0-usj' },
  prepared: { scripturePrepare: 6000230 },
  quote: { helpsQuote: 9 },
  align: { helpsAlign: 12 },
  text: { helpsText: 1 },
}

const PARTS: PartEntry[] = [
  { sha256: 'c3', bytes: 30, rows: 3, kind: 'tw', resource: 'unfoldingWord/en/tw', group: 'kt:3', layers: ['sot', 'prepared'] },
  { sha256: 'a1', bytes: 10, rows: 1, kind: 'book', resource: 'unfoldingWord/en/ult', book: 'rut', layers: ['sot', 'prepared'] },
  { sha256: 'b2', bytes: 20, rows: 2, kind: 'book', resource: 'unfoldingWord/en/tn', book: 'jon', layers: ['sot', 'prepared', 'quote'] },
  { sha256: 'b1', bytes: 20, rows: 2, kind: 'book', resource: 'unfoldingWord/en/tn', book: 'rut', layers: ['sot', 'prepared', 'quote'] },
  { sha256: 'd4', bytes: 40, rows: 4, kind: 'alignments', resource: 'unfoldingWord/en/tn', book: 'rut', layers: ['align'] },
]

function list(parts: PartEntry[], resourcesReversed = false, dated = false): PartsList {
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
    compat: compatKeyOf(PACK_FORMAT_VERSION, VERSIONS),
    versions: VERSIONS,
    resources: resourcesReversed ? [...resources].reverse() : resources,
    parts,
    originals: { path: 'catalog/x/originals.json', sha256: 'ff' },
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

  test('is filed under format 2.0', () => {
    expect(PACK_FORMAT_VERSION).toBe('2.0.0')
    expect(compatKeyOf(PACK_FORMAT_VERSION, VERSIONS).startsWith('f2.0-')).toBe(true)
  })
})
