import { describe, expect, test } from 'bun:test'
import type { PartEntry } from './partsList'
import { slotId, slotOfEntry } from './partSlots'
import { REGISTER_PREFIX, readRegister, registerRow, unitOfSlotId, type SlotRecord } from './register'

const FP = 'f'.repeat(64)
const entry = (p: Partial<PartEntry> & Pick<PartEntry, 'kind' | 'resource'>): PartEntry => ({ sha256: 's', bytes: 1, rows: 1, fingerprint: FP, layers: ['sot'], ...p })

const RECORD: SlotRecord = { sha256: 'a'.repeat(64), keys: ['k1', 'k2'], list: 'es-419', at: '2026-10-27T00:00:00.000Z' }

describe('slotOfEntry', () => {
  test('keeps kind, resource, book and group, and nothing else', () => {
    expect(slotOfEntry(entry({ kind: 'book', resource: 'o/es/tn', book: 'rut' }))).toEqual({ kind: 'book', resource: 'o/es/tn', book: 'rut' })
    expect(slotOfEntry(entry({ kind: 'tw', resource: 'o/es/tw', group: 'kt:3' }))).toEqual({ kind: 'tw', resource: 'o/es/tw', group: 'kt:3' })
    expect(slotOfEntry(entry({ kind: 'titles', resource: 'o/es/ta' }))).toEqual({ kind: 'titles', resource: 'o/es/ta' })
  })
})

describe('unitOfSlotId', () => {
  test('a book, alignments or original slot is its book unit; the rest are shared', () => {
    expect(unitOfSlotId(slotId({ kind: 'book', resource: 'o/es/tn', book: 'rut' }))).toBe('book rut')
    expect(unitOfSlotId(slotId({ kind: 'alignments', resource: 'o/es/tn', book: '1jn' }))).toBe('book 1jn')
    expect(unitOfSlotId(slotId({ kind: 'original', resource: 'unfoldingWord/el-x-koine/ugnt', book: 'mat' }))).toBe('book mat')
    expect(unitOfSlotId(slotId({ kind: 'macula', resource: 'o/macula', book: 'mat' }))).toBe('shared')
    expect(unitOfSlotId(slotId({ kind: 'tw', resource: 'o/es/tw', group: 'kt:3' }))).toBe('shared')
  })
})

describe('register rows', () => {
  test('registerRow writes the pinned row shape', () => {
    const row = registerRow('book:o/es/tn:rut', RECORD, 1234)
    expect(row).toEqual({ key: 'parts-slot:book:o/es/tn:rut', entry: { content: RECORD, timestamp: 1234 } })
    expect(REGISTER_PREFIX).toBe('parts-slot:')
  })

  test('readRegister reads back what registerRow wrote, keyed by slot id', () => {
    const register = readRegister([registerRow('tw:o/es/tw:kt:3', RECORD, 1), registerRow('book:o/es/tn:rut', { ...RECORD, list: 'originals' }, 2)])
    expect([...register.keys()].sort()).toEqual(['book:o/es/tn:rut', 'tw:o/es/tw:kt:3'])
    expect(register.get('tw:o/es/tw:kt:3')).toEqual(RECORD)
    expect(register.get('book:o/es/tn:rut')?.list).toBe('originals')
  })

  test('readRegister ignores rows that are not register rows, and register rows it cannot read', () => {
    const register = readRegister([
      { key: 'resource:o/es/tn', entry: { content: { downloadComplete: true }, timestamp: 1 } },
      { key: 'o/es/tn/rut', entry: { content: 'x', timestamp: 1 } },
      { key: 'parts-slot:broken', entry: { content: { sha256: 5 }, timestamp: 1 } },
      { key: 'parts-slot:nothing', entry: null },
      registerRow('book:o/es/tn:rut', RECORD, 1),
    ])
    expect([...register.keys()]).toEqual(['book:o/es/tn:rut'])
  })
})
