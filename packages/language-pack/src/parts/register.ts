/**
 * The slot register (spec §2): one row per slot in the resources store, `parts-slot:{slotId}`, saying which part fills
 * the slot on this device and every row key it wrote, so the next part for that slot can delete the keys it no longer
 * has. It lives in the same store as the rows so one transaction changes both.
 */

import { BOOK_KINDS, SHARED_UNIT, bookUnit, type PartKind } from './partsList'

export const REGISTER_PREFIX = 'parts-slot:'

export type SlotRecord = {
  /** The part that fills the slot. */
  sha256: string
  /** Every row key the part wrote, chapter chunks included. */
  keys: string[]
  /** The list that named it: its `language`, or `originals`. */
  list: string
  /** When it was applied (ISO). */
  at: string
}

/** What the device holds, by slot id. */
export type Register = Map<string, SlotRecord>

/** The register row of a slot, as the resources store keeps it: `timestamp` is the apply time, no `expiresAt`. */
export function registerRow(slot: string, record: SlotRecord, now: number): { key: string; entry: unknown } {
  return { key: REGISTER_PREFIX + slot, entry: { content: record, timestamp: now } }
}

function recordOf(entry: unknown): SlotRecord | null {
  const content = (entry as { content?: unknown } | null | undefined)?.content as Partial<SlotRecord> | null | undefined
  if (!content || typeof content !== 'object') return null
  if (typeof content.sha256 !== 'string' || !Array.isArray(content.keys) || !content.keys.every((k) => typeof k === 'string')) return null
  return { sha256: content.sha256, keys: [...content.keys], list: String(content.list ?? ''), at: String(content.at ?? '') }
}

/**
 * The register from raw rows of the store (any rows: those of other prefixes are skipped). A register row it cannot
 * read is left out, so its slot reads as absent and is downloaded again.
 */
export function readRegister(rows: Iterable<{ key: string; entry: unknown }>): Register {
  const register: Register = new Map()
  for (const row of rows) {
    if (!row.key.startsWith(REGISTER_PREFIX)) continue
    const record = recordOf(row.entry)
    if (record) register.set(row.key.slice(REGISTER_PREFIX.length), record)
  }
  return register
}

/**
 * The unit a slot id belongs to, as `unitOfPart` places its part: a book kind's id ends with its book (`slotId` puts no
 * group after it), every other kind is shared. The register keeps ids only, so removals are placed by this.
 */
export function unitOfSlotId(id: string): string {
  const kind = id.slice(0, id.indexOf(':')) as PartKind
  if (!BOOK_KINDS.has(kind)) return SHARED_UNIT
  return bookUnit(id.slice(id.lastIndexOf(':') + 1))
}
