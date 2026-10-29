/**
 * What to download and what to remove for the units a person chose (spec §1–§2), and how much of each resource the
 * device holds. Pure: it reads the lists and the register and touches nothing.
 */

import { OPTIONAL_LAYERS, readsLayer, type PackVersions } from '../types'
import { PART_LAYERS } from './partFile'
import { KNOWN_PART_KINDS, SHARED_UNIT, unitOfPart, type PartEntry, type PartsList } from './partsList'
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

/** The originals list's `language`, and the `list` of the register records it wrote. */
const ORIGINALS_LIST = 'originals'

/** The kinds the originals list owns: when both lists name one of these slots, the originals list's entry wins. */
const ORIGINALS_KINDS = new Set(['original', 'macula'])

/** Why a reader leaves a listed part out: a kind or a layer it does not know, or an optional layer of other versions. */
export type SkipReason = 'kind' | 'layer' | 'version'

/**
 * Why this reader cannot use a part of `list`, or null when it can. A part of an optional layer (`OPTIONAL_LAYERS`) is
 * usable only when the app states that layer's versions and the list has each of them, the same as text: an app that
 * does not read the layer, or reads another version of it, goes on without it.
 */
export function skipReason(entry: PartEntry, list: PartsList, versions: PackVersions | undefined): SkipReason | null {
  if (!KNOWN_PART_KINDS.has(entry.kind)) return 'kind'
  const layers = new Set(entry.layers ?? [])
  // An index part carries index rows whatever its entry says: judged by the index's versions.
  if (entry.kind === 'index') layers.add('index')
  if ([...layers].some((layer) => !PART_LAYERS.includes(layer))) return 'layer'
  for (const layer of layers) {
    if (OPTIONAL_LAYERS.includes(layer) && !readsLayer(layer, versions, list.versions)) return 'version'
  }
  return null
}

/**
 * Every slot the lists name that this reader can use (`skipReason`), once, with the part that fills it and the list
 * that named it (its `language`, or `originals`). A language list also names the originals it was built against; for
 * `original` and `macula` slots the originals list's entry wins, for any other slot the language list's.
 */
export function namedParts(list: PartsList, originals?: PartsList, versions?: PackVersions): Map<string, { entry: PartEntry; list: string }> {
  const named = new Map<string, { entry: PartEntry; list: string }>()
  for (const entry of list.parts) {
    const id = slotId(slotOfEntry(entry))
    if (!named.has(id) && !skipReason(entry, list, versions)) named.set(id, { entry, list: list.language })
  }
  for (const entry of originals?.parts ?? []) {
    const id = slotId(slotOfEntry(entry))
    if (skipReason(entry, originals!, versions)) {
      // The originals list owns its slots: one it names and this reader skips is not filled from the language list.
      if (ORIGINALS_KINDS.has(entry.kind)) named.delete(id)
      continue
    }
    if (!named.has(id) || ORIGINALS_KINDS.has(entry.kind)) named.set(id, { entry, list: originals!.language })
  }
  return named
}

/** The parts the lists name that this reader leaves out, with why; a slot another usable part fills is not one. */
export function skippedParts(list: PartsList, originals?: PartsList, versions?: PackVersions): Array<{ entry: PartEntry; reason: SkipReason }> {
  const named = namedParts(list, originals, versions)
  const seen = new Set<string>()
  const skipped: Array<{ entry: PartEntry; reason: SkipReason }> = []
  for (const [l, entries] of [[list, list.parts], [originals, originals?.parts ?? []]] as const) {
    for (const entry of entries) {
      const id = slotId(slotOfEntry(entry))
      const reason = skipReason(entry, l!, versions)
      if (!reason || named.has(id) || seen.has(id)) continue
      seen.add(id)
      skipped.push({ entry, reason })
    }
  }
  return skipped
}

export type PlanInput = {
  list: PartsList
  originals?: PartsList
  register: Register
  /** Unit ids: `shared`, `book <b>`. */
  chosen: string[]
  /**
   * This app's processing versions, by layer: the same the app gives `applyParts`. Without them, parts of optional
   * layers are skipped (`skipReason`).
   */
  versions?: PackVersions
}

export type PartsPlan = {
  /** Parts of the chosen units whose slot the device lacks or holds with another sha, one per slot. */
  download: PartEntry[]
  /**
   * Slot ids this language's list put on the device (`record.list` is its `language`) in the chosen units that the
   * lists no longer name. Another language's slots and the originals' are never removed by a plan.
   */
  remove: string[]
  /** The chosen units `download` or `remove` touch, in apply order (`compareUnits`). */
  units: string[]
  /** Sum of `download[].bytes`. */
  bytes: number
  /**
   * Parts the lists name that this reader cannot use (`skippedParts`): neither downloaded nor removed, so a slot held
   * from an earlier list stays as it is.
   */
  skipped: Array<{ entry: PartEntry; reason: SkipReason }>
  /** The versions the plan judged parts by (`PlanInput.versions`); `applyParts` judges optional layers by the same. */
  versions?: PackVersions
}

/**
 * A language list that names an originals list was built against it: planned without it, every original and MACULA
 * part it holds would be missed (the builder puts them in the originals list only).
 */
function requireOriginals(input: PlanInput): void {
  if (input.list.originals && !input.originals) {
    throw new Error(`The ${input.list.language} parts list names an originals list (${input.list.originals.path}); pass it as \`originals\``)
  }
}

export function planParts(input: PlanInput): PartsPlan {
  requireOriginals(input)
  const chosen = new Set(input.chosen)
  const named = namedParts(input.list, input.originals, input.versions)
  const skipped = skippedParts(input.list, input.originals, input.versions)
  const skippedIds = new Set(skipped.map(({ entry }) => slotId(slotOfEntry(entry))))
  const touched = new Set<string>()
  const download: PartEntry[] = []
  for (const [id, { entry }] of named) {
    const unit = unitOfPart(entry)
    if (!chosen.has(unit) || input.register.get(id)?.sha256 === entry.sha256) continue
    download.push(entry)
    touched.add(unit)
  }
  const remove: string[] = []
  for (const [id, record] of input.register) {
    // Only this language's own slots: the register is shared by every language on the device, and the originals are
    // shared by all of them (replaced when a list names another sha, never removed).
    if (record.list !== input.list.language || input.list.language === ORIGINALS_LIST) continue
    const unit = unitOfSlotId(id)
    if (!chosen.has(unit) || named.has(id) || skippedIds.has(id)) continue
    remove.push(id)
    touched.add(unit)
  }
  return {
    download,
    remove,
    units: [...touched].sort(compareUnits),
    bytes: download.reduce((n, p) => n + p.bytes, 0),
    skipped,
    ...(input.versions ? { versions: input.versions } : {}),
  }
}

export type Coverage = Map<string, { present: number; missing: number; missingBytes: number; whole: boolean }>

/**
 * Per resource the lists name a part of: its parts in the chosen units held (the register has the slot at the listed
 * sha) and missing, the missing ones' bytes, and whether every part the lists name for it is held, chosen or not.
 */
export function partsCoverage(input: PlanInput): Coverage {
  requireOriginals(input)
  const chosen = new Set(input.chosen)
  const coverage: Coverage = new Map()
  const rowOf = (resource: string) => {
    let row = coverage.get(resource)
    if (!row) coverage.set(resource, (row = { present: 0, missing: 0, missingBytes: 0, whole: true }))
    return row
  }
  for (const [id, { entry }] of namedParts(input.list, input.originals, input.versions)) {
    const row = rowOf(entry.resource)
    const held = input.register.get(id)?.sha256 === entry.sha256
    if (!held) row.whole = false
    if (!chosen.has(unitOfPart(entry))) continue
    if (held) row.present++
    else {
      row.missing++
      row.missingBytes += entry.bytes
    }
  }
  // A skipped part whose rows the resource needs (any layer that is not optional) leaves it incomplete: no
  // receipt, not offline. Only a part of optional layers alone is left out as if it were not listed.
  for (const { entry } of skippedParts(input.list, input.originals, input.versions)) {
    if (optionalOnly(entry)) continue
    const row = rowOf(entry.resource)
    row.whole = false
    if (!chosen.has(unitOfPart(entry))) continue
    row.missing++
    row.missingBytes += entry.bytes
  }
  return coverage
}

/** A part that carries only optional layers (an `index` part): a resource is whole without it. */
export function optionalOnly(entry: PartEntry): boolean {
  if (entry.kind === 'index') return true
  const layers = entry.layers ?? []
  return layers.length > 0 && layers.every((layer) => OPTIONAL_LAYERS.includes(layer))
}
