import { describe, expect, test } from 'bun:test'
import {
  expectedIngestReleaseStamp,
  ingestSchemaForResourceType,
  isMatchingIngestReceipt,
  type ResourceMetadata,
} from '@bt-synergy/resource-catalog'
import type { PackVersions } from '../types'
import type { PartEntry, PartKind, PartsList } from './partsList'
import { slotId, slotOfEntry } from './partSlots'
import type { Register } from './register'
import { receiptChanges, receiptKey, type ReceiptInput } from './receipts'

const NOW = Date.parse('2026-10-27T12:00:00.000Z')
const VERSIONS: PackVersions = { sot: { usjProcessing: '2.3.0-usj' } }

const TN = 'o/es-419/tn'
const ULT = 'o/es-419/ult'
const UHB = 'unfoldingWord/hbo/uhb'
const STAMP = 'v1#2026-10-01T00_00_00Z'

const meta = (key: string, type: string, release: Record<string, string> = { tag_name: 'v1', published_at: '2026-10-01T00:00:00Z' }) =>
  ({ resourceKey: key, type, subject: key, title: key, release }) as unknown as ResourceMetadata

const CATALOG = new Map<string, ResourceMetadata>([
  [TN, meta(TN, 'notes')],
  [ULT, meta(ULT, 'scripture')],
  [UHB, meta(UHB, 'scripture')],
])

const entry = (kind: PartKind, resource: string, book: string, sha: string): PartEntry => ({
  sha256: sha,
  bytes: 10,
  rows: 1,
  kind,
  resource,
  book,
  fingerprint: 'f'.repeat(64),
  layers: ['sot'],
})

const TN_RUT = entry('book', TN, 'rut', 'a1')
const TN_JON = entry('book', TN, 'jon', 'a2')
const ULT_RUT = entry('book', ULT, 'rut', 'b1')
const UHB_RUT = entry('original', UHB, 'rut', 'c1')

const listOf = (language: string, parts: PartEntry[]): PartsList =>
  ({ schema: 2, language, compat: 'c', code: 'c+0', versions: VERSIONS, resources: [], parts }) as PartsList

const LISTS = [listOf('es-419', [TN_RUT, TN_JON, ULT_RUT]), listOf('originals', [UHB_RUT])]

const held = (...entries: PartEntry[]): Register =>
  new Map(entries.map((e) => [slotId(slotOfEntry(e)), { sha256: e.sha256, keys: [], list: e.kind === 'original' ? 'originals' : 'es-419', at: '' }]))

const changes = (extra: Partial<ReceiptInput>) =>
  receiptChanges({ lists: LISTS, register: new Map(), catalog: CATALOG, stored: CATALOG, versions: VERSIONS, touched: [TN, ULT, UHB], existing: new Map(), now: NOW, ...extra })

const receiptFrom = (method: string) => ({
  content: {},
  metadata: { downloadComplete: true, downloadCompletedAt: '2026-01-01T00:00:00.000Z', releaseStamp: 'v0', ingestSchema: 'helps:1', downloadMethod: method },
})

describe('receiptChanges', () => {
  test('a whole resource gets the receipt a whole download leaves, from parts, that readers accept', () => {
    const { puts, deletes } = changes({ register: held(TN_RUT, TN_JON, ULT_RUT, UHB_RUT) })

    expect(deletes).toEqual([])
    expect(puts.map((p) => p.key)).toEqual([receiptKey(TN), receiptKey(ULT), receiptKey(UHB)])
    const tn = puts.find((p) => p.key === `resource:${TN}`)!
    expect(tn.entry).toEqual({
      content: {},
      metadata: {
        downloadComplete: true,
        downloadCompletedAt: new Date(NOW).toISOString(),
        releaseStamp: STAMP,
        ingestSchema: 'helps:1',
        downloadMethod: 'parts',
      },
    })
    expect((puts.find((p) => p.key === `resource:${ULT}`)!.entry as { metadata: { ingestSchema: string } }).metadata.ingestSchema).toBe('usj:2.3.0-usj')
    expect((puts.find((p) => p.key === `resource:${UHB}`)!.entry as { metadata: { ingestSchema: string } }).metadata.ingestSchema).toBe('usj:2.3.0-usj')

    for (const put of puts) {
      const m = CATALOG.get(put.key.slice('resource:'.length))!
      expect(isMatchingIngestReceipt(put.entry, expectedIngestReleaseStamp(m), ingestSchemaForResourceType(m.type, '2.3.0-usj'))).toBe(true)
    }
  })

  test('a resource held in part gets no receipt', () => {
    const { puts, deletes } = changes({ register: held(TN_RUT, ULT_RUT, UHB_RUT) })

    expect(puts.map((p) => p.key)).toEqual([receiptKey(ULT), receiptKey(UHB)])
    expect(deletes).toEqual([])
  })

  test('a part held with another sha does not count', () => {
    const { puts } = changes({ register: held(TN_RUT, { ...TN_JON, sha256: 'old' }) })

    expect(puts.map((p) => p.key)).not.toContain(receiptKey(TN))
  })

  test('a resource no longer whole loses its receipt from parts; a receipt not from parts stays', () => {
    const existing = new Map<string, unknown>([
      [receiptKey(TN), receiptFrom('parts')],
      [receiptKey(ULT), receiptFrom('zip')],
      [receiptKey(UHB), { content: {}, metadata: { downloadComplete: true } }],
    ])
    const { puts, deletes } = changes({ register: held(TN_RUT), existing })

    expect(puts).toEqual([])
    expect(deletes).toEqual([receiptKey(TN)])
  })

  test('a touched resource the lists no longer name any part of loses its receipt from parts', () => {
    const existing = new Map<string, unknown>([[receiptKey(TN), receiptFrom('parts')]])
    const { puts, deletes } = changes({ lists: [listOf('es-419', [ULT_RUT]), listOf('originals', [])], register: new Map(), touched: [TN], existing })

    expect(puts).toEqual([])
    expect(deletes).toEqual([receiptKey(TN)])
  })

  test('a whole resource replaces a receipt not from parts with its own', () => {
    const existing = new Map<string, unknown>([[receiptKey(TN), receiptFrom('zip')]])
    const { puts, deletes } = changes({ register: held(TN_RUT, TN_JON), touched: [TN], existing })

    expect(deletes).toEqual([])
    expect(puts).toHaveLength(1)
    expect(puts[0].entry).toMatchObject({ content: {}, metadata: { releaseStamp: STAMP, downloadMethod: 'parts' } })
  })

  test('a resource the lists do not name and this call did not touch is left alone', () => {
    const existing = new Map<string, unknown>([[receiptKey(TN), receiptFrom('parts')]])
    const { puts, deletes } = changes({ lists: [listOf('es-419', [ULT_RUT]), listOf('originals', [UHB_RUT])], register: new Map(), touched: [], existing })

    expect(puts).toEqual([])
    expect(deletes).toEqual([])
  })

  test('a named whole resource without a receipt gets one though this call touched nothing (a failed pass heals)', () => {
    const { puts, deletes } = changes({ register: held(ULT_RUT, UHB_RUT), touched: [] })

    expect(puts.map((p) => p.key)).toEqual([receiptKey(ULT), receiptKey(UHB)])
    expect(deletes).toEqual([])
  })

  test('a named resource held in part loses its receipt from parts though this call touched nothing', () => {
    const existing = new Map<string, unknown>([[receiptKey(TN), receiptFrom('parts')]])
    const { deletes } = changes({ register: held(TN_RUT), touched: [], existing })

    expect(deletes).toEqual([receiptKey(TN)])
  })

  test('a receipt readers already accept for this release is not written again, whoever wrote it', () => {
    const matching = { content: {}, metadata: { downloadComplete: true, releaseStamp: STAMP, ingestSchema: 'helps:1', downloadMethod: 'zip' } }
    const existing = new Map<string, unknown>([[receiptKey(TN), matching]])
    const { puts } = changes({ register: held(TN_RUT, TN_JON), touched: [TN], existing })

    expect(puts).toEqual([])
  })

  test('books absent from the release are carried from a receipt of the same release', () => {
    const sameRelease = { content: {}, metadata: { downloadComplete: true, releaseStamp: STAMP, ingestSchema: 'usj:2.2.0-usj', absentFromRelease: ['oba'] } }
    const olderRelease = { content: {}, metadata: { downloadComplete: true, releaseStamp: 'v0', ingestSchema: 'usj:2.3.0-usj', absentFromRelease: ['jon'] } }
    const existing = new Map<string, unknown>([
      [receiptKey(ULT), sameRelease],
      [receiptKey(UHB), olderRelease],
    ])
    const { puts } = changes({ register: held(ULT_RUT, UHB_RUT), existing })

    const metaOf = (key: string) => (puts.find((p) => p.key === receiptKey(key))!.entry as { metadata: Record<string, unknown> }).metadata
    expect(metaOf(ULT)).toMatchObject({ releaseStamp: STAMP, ingestSchema: 'usj:2.3.0-usj', downloadMethod: 'parts', absentFromRelease: ['oba'] })
    expect(metaOf(UHB)).not.toHaveProperty('absentFromRelease')
  })

  test('a catalog row without a release stamp gets no receipt, and a receipt from parts is not deleted for it', () => {
    const catalog = new Map(CATALOG).set(TN, meta(TN, 'notes', {}))
    const existing = new Map<string, unknown>([[receiptKey(TN), receiptFrom('parts')]])
    const { puts, deletes } = changes({ register: held(TN_RUT, TN_JON), catalog, touched: [TN], existing })

    expect(puts).toEqual([])
    expect(deletes).toEqual([])
  })

  test('a whole resource whose device catalog row names another release keeps the receipt it has', () => {
    const v0 = { content: {}, metadata: { downloadComplete: true, releaseStamp: 'v0', ingestSchema: 'helps:1', downloadMethod: 'parts' } }
    const existing = new Map<string, unknown>([[receiptKey(TN), v0]])
    const stored = new Map<string, ResourceMetadata | null>(CATALOG).set(TN, meta(TN, 'notes', { tag_name: 'v0' }))
    stored.delete(ULT)
    const { puts, deletes } = changes({ register: held(TN_RUT, TN_JON, ULT_RUT, UHB_RUT), stored, existing })

    // TN: the device still says v0; ULT: the device has no row. Only UHB's matches.
    expect(puts.map((p) => p.key)).toEqual([receiptKey(UHB)])
    expect(deletes).toEqual([])
  })

  test('resources kept by the call are neither written nor deleted', () => {
    const existing = new Map<string, unknown>([[receiptKey(TN), receiptFrom('parts')]])
    const { puts, deletes } = changes({ register: held(TN_RUT, ULT_RUT, UHB_RUT), kept: [TN, ULT], existing })

    expect(puts.map((p) => p.key)).toEqual([receiptKey(UHB)])
    expect(deletes).toEqual([])
  })

  test('a whole resource the catalog does not have gets no receipt', () => {
    const catalog = new Map(CATALOG)
    catalog.delete(TN)
    const { puts } = changes({ register: held(TN_RUT, TN_JON), catalog, touched: [TN] })

    expect(puts).toEqual([])
  })
})
