/**
 * What to download and what to remove for the units a person chose (spec §1–§2), and how much of each resource the
 * device holds. Pure: it reads the lists and the register and touches nothing.
 */

import { SHARED_UNIT, unitOfPart, type PartEntry, type PartsList } from './partsList'
import { slotId, slotOfEntry } from './partSlots'
import { unitOfSlotId, type Register } from './register'

/**
 * Protestant canon order, lowercase. Mirrors resource-pipeline's `CANON_BOOK_ORDER` (`warm/warmBookOrder.ts`, the keys
 * of `nav/bookChapterCounts.ts`), which this package cannot import: resource-pipeline depends on it.
 */
export const CANON_BOOK_ORDER: readonly string[] = [
  'gen', 'exo', 'lev', 'num', 'deu', 'jos', 'jdg', 'rut', '1sa', '2sa', '1ki', '2ki', '1ch', '2ch', 'ezr', 'neh', 'est',
  'job', 'psa', 'pro', 'ecc', 'sng', 'isa', 'jer', 'lam', 'ezk', 'dan', 'hos', 'jol', 'amo', 'oba', 'jon', 'mic', 'nam',
  'hab', 'zep', 'hag', 'zec', 'mal',
  'mat', 'mrk', 'luk', 'jhn', 'act', 'rom', '1co', '2co', 'gal', 'eph', 'php', 'col', '1th', '2th', '1ti', '2ti', 'tit',
  'phm', 'heb', 'jas', '1pe', '2pe', '1jn', '2jn', '3jn', 'jud', 'rev',
]

const BOOK_RANK = new Map(CANON_BOOK_ORDER.map((b, i) => [b, i]))
const BOOK_PREFIX = 'book '

/** Book units in canonical order (a book the canon does not know after them, by name), then `shared`. */
export function compareUnits(a: string, b: string): number {
  const rank = (u: string): [number, string] => {
    if (u === SHARED_UNIT || !u.startsWith(BOOK_PREFIX)) return [Number.MAX_SAFE_INTEGER, u]
    const book = u.slice(BOOK_PREFIX.length)
    return [BOOK_RANK.get(book) ?? CANON_BOOK_ORDER.length, book]
  }
  const [ra, na] = rank(a)
  const [rb, nb] = rank(b)
  return ra - rb || (na < nb ? -1 : na > nb ? 1 : 0)
}

/** The kinds the originals list owns: when both lists name one of these slots, the originals list's entry wins. */
const ORIGINALS_KINDS = new Set(['original', 'macula'])

/**
 * Every slot the lists name, once, with the part that fills it and the list that named it (its `language`, or
 * `originals`). A language list also names the originals it was built against; for `original` and `macula` slots the
 * originals list's entry wins, for any other slot the language list's.
 */
export function namedParts(list: PartsList, originals?: PartsList): Map<string, { entry: PartEntry; list: string }> {
  const named = new Map<string, { entry: PartEntry; list: string }>()
  for (const entry of list.parts) {
    const id = slotId(slotOfEntry(entry))
    if (!named.has(id)) named.set(id, { entry, list: list.language })
  }
  for (const entry of originals?.parts ?? []) {
    const id = slotId(slotOfEntry(entry))
    if (!named.has(id) || ORIGINALS_KINDS.has(entry.kind)) named.set(id, { entry, list: originals!.language })
  }
  return named
}

export type PlanInput = {
  list: PartsList
  originals?: PartsList
  register: Register
  /** Unit ids: `shared`, `book <b>`. */
  chosen: string[]
}

export type PartsPlan = {
  /** Parts of the chosen units whose slot the device lacks or holds with another sha, one per slot. */
  download: PartEntry[]
  /** Slot ids the device holds in the chosen units that neither list names any more. */
  remove: string[]
  /** The chosen units `download` or `remove` touch, in apply order (`compareUnits`). */
  units: string[]
  /** Sum of `download[].bytes`. */
  bytes: number
}

export function planParts(input: PlanInput): PartsPlan {
  const chosen = new Set(input.chosen)
  const named = namedParts(input.list, input.originals)
  const touched = new Set<string>()
  const download: PartEntry[] = []
  for (const [id, { entry }] of named) {
    const unit = unitOfPart(entry)
    if (!chosen.has(unit) || input.register.get(id)?.sha256 === entry.sha256) continue
    download.push(entry)
    touched.add(unit)
  }
  const remove: string[] = []
  for (const id of input.register.keys()) {
    const unit = unitOfSlotId(id)
    if (!chosen.has(unit) || named.has(id)) continue
    remove.push(id)
    touched.add(unit)
  }
  return {
    download,
    remove,
    units: [...touched].sort(compareUnits),
    bytes: download.reduce((n, p) => n + p.bytes, 0),
  }
}

export type Coverage = Map<string, { present: number; missing: number; missingBytes: number; whole: boolean }>

/**
 * Per resource the lists name a part of: its parts in the chosen units held (the register has the slot at the listed
 * sha) and missing, the missing ones' bytes, and whether every part the lists name for it is held, chosen or not.
 */
export function partsCoverage(input: PlanInput): Coverage {
  const chosen = new Set(input.chosen)
  const coverage: Coverage = new Map()
  for (const [id, { entry }] of namedParts(input.list, input.originals)) {
    let row = coverage.get(entry.resource)
    if (!row) coverage.set(entry.resource, (row = { present: 0, missing: 0, missingBytes: 0, whole: true }))
    const held = input.register.get(id)?.sha256 === entry.sha256
    if (!held) row.whole = false
    if (!chosen.has(unitOfPart(entry))) continue
    if (held) row.present++
    else {
      row.missing++
      row.missingBytes += entry.bytes
    }
  }
  return coverage
}
