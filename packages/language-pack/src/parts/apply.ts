/**
 * Applying a plan (spec §2–§3): the staged parts go into the device's store one unit at a time (a book, or the shared
 * unit), each unit in one transaction with its register rows, so the store never holds new notes over old alignments
 * of the same book (a reader whose reads span transactions can still read one before a unit and one after it). Before
 * each unit, the catalog rows of its resources; after it, their `offline` and `partial` flags.
 *
 * What may be deleted, and nothing else: keys a slot's previous part wrote (its register row says which) that the new
 * part no longer has; the first time a slot is filled, rows of that slot's resource found by its key prefixes that
 * `slotOfRow` places in that very slot; and the keys of a slot this language's list put there and no longer names.
 * Units never touch receipts: after the last unit, one more transaction writes the receipts of the named or touched
 * resources that are whole and deletes the receipts from parts of those that are not (`receipts.ts`); before it, the
 * catalog rows of named resources are refreshed when their release stamp or their `offline`/`partial` flags are not
 * what the list and the register say, so receipts match the device's rows and a flag a cut-short call left heals.
 * A plan with parts not yet staged applies no unit but still runs the refresh and the receipts pass (the startup
 * heal), leaving out the resources the plan changes until their parts arrive; a call refused for other versions, or a
 * target without `transactRaw` or `catalogRow`, writes nothing.
 */

import { resourceContentStamp, type ResourceMetadata } from '@bt-synergy/resource-catalog'
import { belongsTo, scansFor } from '../keys'
import { OPTIONAL_LAYERS, type CacheRow, type PackLayer, type PackTarget, type PackVersions } from '../types'
import { PART_LAYERS, readPart, sha256Hex, type PartRow } from './partFile'
import { restoreCatalogBookkeeping, unitOfPart, type PartEntry, type PartsList } from './partsList'
import { slotId, slotOfEntry, slotOfRow } from './partSlots'
import { namedParts, partsCoverage, type Coverage, type PartsPlan } from './plan'
import { receiptChanges, receiptKey, receiptScope } from './receipts'
import { REGISTER_PREFIX, readRegister, registerRow, resourceOfSlotId, unitOfSlotId, type Register, type SlotRecord } from './register'
import type { PartsStaging } from './staging'

/**
 * One call applies one plan. Apps also call it at startup, which heals what an interrupted call left (a receipt not
 * written, an `offline` flag not set): read the register (the cache store's `getByPrefix(REGISTER_PREFIX)` → `readRegister`),
 * `planParts` with the lists and the chosen units, then `applyParts` with that plan, whatever it holds. With parts not
 * yet staged (a download in progress) it applies no unit, heals the catalog and the receipts of the other resources,
 * leaves the resources still downloading (every resource the plan changes) as they are until their parts arrive, and
 * says `refused: missing`. The app downloads the plan's parts into `staging` and calls it again.
 */
export type ApplyInput = {
  target: PackTarget
  staging: PartsStaging
  plan: PartsPlan
  list: PartsList
  originals?: PartsList
  /** The register the plan was made from: says which slots are filled for the first time. */
  register: Register
  /** The units the person chose (the plan's input), for `availability.offline` and `partial`. */
  chosen: string[]
  /** This app's processing versions, by layer. */
  versions: PackVersions
  /** Apply time (ms); `Date.now` by default. */
  now?: () => number
}

/** Why: `quota` is a full disk (`QuotaExceededError`), from the store or the catalog. */
export type ApplyFailureReason = 'missing' | 'quota' | 'invalid' | 'versions' | 'error'

/**
 * What failed, by `scope`:
 * - `unit`: that unit was not applied; its parts stay in staging and the next plan names it again.
 * - `catalog`: catalog rows not written or not read. With `unit`, that unit is applied and only its rows' `offline`
 *   and `partial` flags are stale; without, the refresh at the end of the call. The next call writes them.
 * - `receipts`: the receipts pass failed, or a resource's stored catalog row could not be read for it; the receipts
 *   there are left as they are and the next call decides them again.
 */
export type ApplyFailure =
  | { scope: 'unit'; unit: string; reason: ApplyFailureReason; message: string }
  | { scope: 'catalog'; unit?: string; reason: ApplyFailureReason; message: string }
  | { scope: 'receipts'; reason: ApplyFailureReason; message: string }

export type ApplyResult = {
  /**
   * Set when the call applied no unit at all. `versions`: a list was made with other processing versions than the
   * app's (show "update the app"); nothing at all was written. `missing`: a part of the plan is not in staging; no unit
   * was applied, but the catalog refresh and the receipts pass ran for the resources the plan does not change; those
   * it changes are left as they are (`failed` names the units with parts missing).
   */
  refused?: { reason: 'versions' | 'missing'; message: string }
  /** Units whose transaction committed, in apply order. */
  applied: string[]
  /**
   * What failed, with why (see `ApplyFailure`). A unit whose transaction committed but whose catalog rows could not be
   * written again with their flags is in `applied` and here too (scope `catalog`).
   */
  failed: ApplyFailure[]
  /** Resources an applied unit touched that are whole afterwards: every part the lists name for them is held. */
  completed: string[]
  /** An original or MACULA slot held another sha and was replaced: other languages' aligned quotes may miss. */
  originalsReplaced: boolean
  /** Sum of the applied parts' `bytes`. */
  bytesApplied: number
}

const ORIGINALS_KINDS = new Set(['original', 'macula'])

/** A resource is offline when every part of it within the chosen units is held (whole or not). */
function isOffline(coverage: Coverage, key: string): boolean {
  const c = coverage.get(key)
  return Boolean(c && c.missing === 0 && c.present > 0)
}

/**
 * A catalog row's flags from the register: `offline` as `isOffline`, and `partial` when offline but not whole (chosen
 * for some books only): tc-study reads `offline` without `partial` as downloaded whole.
 */
function availabilityOf(coverage: Coverage, key: string): { offline: boolean; partial: boolean } {
  const offline = isOffline(coverage, key)
  return { offline, partial: offline && coverage.get(key)?.whole !== true }
}

/** The flags a stored catalog row has (absent: false). */
function storedAvailability(row: ResourceMetadata | null): { offline: boolean; partial: boolean } {
  const availability = (row as { availability?: { offline?: unknown; partial?: unknown } } | null)?.availability
  return { offline: Boolean(availability?.offline), partial: Boolean(availability?.partial) }
}

/**
 * The layers whose versions differ, as `importLanguagePack` compares them: names both sides have, as text. Optional
 * layers are left out: their parts are skipped, not the list (`skipReason`).
 */
function differingLayers(theirs: PackVersions | undefined, mine: PackVersions | undefined): PackLayer[] {
  if (!theirs || !mine) return []
  const out: PackLayer[] = []
  for (const layer of Object.keys(mine) as PackLayer[]) {
    if (OPTIONAL_LAYERS.includes(layer)) continue
    const a = theirs[layer]
    const b = mine[layer]
    if (!a || !b) continue
    if (Object.keys(b).some((name) => name in a && String(a[name]) !== String(b[name]))) out.push(layer)
  }
  return out
}

/**
 * The versions this call judges parts by: the app's, with the optional layers as the plan had them, so a part the plan
 * skipped is not counted as missing here (and one it chose is not counted as unnamed).
 */
function judgedVersions(app: PackVersions, planned: PackVersions | undefined): PackVersions {
  const out: PackVersions = { ...app }
  for (const layer of OPTIONAL_LAYERS) {
    delete out[layer]
    if (planned?.[layer]) out[layer] = planned[layer]
  }
  return out
}

/** The entry a part row is written as: its value dated now, with no lifetime (the register removes it, not time). */
function entryOf(value: unknown, now: number): unknown {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return value
  const entry: Record<string, unknown> = { ...(value as Record<string, unknown>), timestamp: now }
  delete entry.expiresAt
  return entry
}

type Resource = { key: string; type?: string; subject?: string }

/** Catalog rows by resource key; the originals list's win for the resources it carries. */
function catalogOf(lists: PartsList[]): Map<string, { metadata: unknown; resource: Resource }> {
  const out = new Map<string, { metadata: unknown; resource: Resource }>()
  for (const list of lists) {
    for (const r of list.resources) {
      const m = (r.metadata ?? {}) as { type?: unknown; subject?: unknown }
      out.set(r.key, {
        metadata: r.metadata,
        resource: { key: r.key, type: m.type === undefined ? undefined : String(m.type), subject: String(m.subject ?? r.subject ?? '') },
      })
    }
  }
  return out
}

/** The scans that find a resource's rows, receipts left out: they are never deleted here. */
const cleanupScans = (resourceKey: string) => scansFor(resourceKey).filter((scan) => !scan.exact && scan.layer !== 'receipt')

class UnitError extends Error {
  constructor(readonly reason: ApplyFailureReason, message: string) {
    super(message)
  }
}

type ReadyPart = { entry: PartEntry; id: string; list: string; rows: PartRow[]; keys: string[] }

/** A staged part, checked again: its bytes hash to its name, and every row is in its slot (Review Focus 1, 4). */
async function readyPart(entry: PartEntry, id: string, list: string, staging: PartsStaging, resources: Map<string, { resource: Resource }>): Promise<ReadyPart> {
  const bytes = await staging.get(entry.sha256)
  if (!bytes) throw new UnitError('missing', `Part ${entry.sha256} (${id}) is no longer in staging`)
  const actual = await sha256Hex(bytes)
  if (actual !== entry.sha256) throw new UnitError('invalid', `Staged part ${entry.sha256} (${id}) now hashes to ${actual}`)
  let rows: PartRow[]
  try {
    rows = await readPart(bytes)
  } catch (error) {
    throw new UnitError('invalid', `Part ${entry.sha256} (${id}) cannot be read: ${(error as Error)?.message ?? error}`)
  }
  const resource = resources.get(entry.resource)?.resource ?? { key: entry.resource }
  const keys = new Set<string>()
  for (const row of rows) {
    const where = `The ${String(row?.layer)} row ${String(row?.key)} of part ${entry.sha256} (${id})`
    if (!row || typeof row.key !== 'string' || !PART_LAYERS.includes(row.layer)) throw new UnitError('invalid', `${where} is not a part row`)
    let slot: string | null
    try {
      const placed = slotOfRow(row, resource)
      slot = placed ? slotId(placed) : null
    } catch {
      slot = null
    }
    if (slot !== id) throw new UnitError('invalid', `${where} is not in its slot (${slot ?? 'none'})`)
    if (keys.has(row.key)) throw new UnitError('invalid', `${where} is given twice`)
    keys.add(row.key)
  }
  return { entry, id, list, rows, keys: [...keys].sort() }
}

/**
 * Why an error happened, its message after `what` when given: a full disk (`QuotaExceededError`, from the store or the
 * catalog) is `quota`.
 */
function causeOf(error: unknown, what?: string): { reason: ApplyFailureReason; message: string } {
  const name = (error as { name?: unknown } | null)?.name
  const reason = error instanceof UnitError ? error.reason : name === 'QuotaExceededError' ? 'quota' : 'error'
  const message = String((error as { message?: unknown } | null)?.message ?? error)
  return { reason, message: what ? `${what}: ${message}` : message }
}

export async function applyParts(input: ApplyInput): Promise<ApplyResult> {
  const { target, staging, plan, list, originals, chosen } = input
  const transactRaw = target.transactRaw?.bind(target)
  if (!transactRaw) {
    throw new Error('This store cannot apply parts: it has no transactRaw (one transaction per unit). Update the cache adapter.')
  }
  const catalogRow = target.catalogRow?.bind(target)
  if (!catalogRow) {
    throw new Error('This store cannot apply parts: it cannot read catalog rows (catalogRow), which receipts are decided against.')
  }
  const clock = input.now ?? Date.now
  const result: ApplyResult = { applied: [], failed: [], completed: [], originalsReplaced: false, bytesApplied: 0 }
  const judged = judgedVersions(input.versions, plan.versions)
  // Throws, before anything is written, when the list needs its originals list and was not given it.
  partsCoverage({ list, originals, versions: judged, register: input.register, chosen })

  const lists = originals ? [list, originals] : [list]
  for (const l of lists) {
    const differ = differingLayers(l.versions, input.versions)
    if (differ.length === 0) continue
    const message = `The ${l.language} parts list was made with other versions (${differ.join(', ')}) than this app's; update the app`
    // Refused whole: rows, catalog and receipts decided with other versions would be thrown away by this app.
    result.refused = { reason: 'versions', message }
    result.failed = plan.units.map((unit) => ({ scope: 'unit', unit, reason: 'versions', message }))
    return result
  }

  // Every slot once, with the list that named it (Review Focus 2).
  const named = namedParts(list, originals, judged)
  const byUnit = new Map<string, Array<{ entry: PartEntry; id: string; list: string }>>()
  const unnamed = new Map<string, string[]>()
  for (const entry of plan.download) {
    const id = slotId(slotOfEntry(entry))
    const unit = unitOfPart(entry)
    const parts = byUnit.get(unit) ?? []
    if (parts.some((p) => p.id === id)) continue
    const naming = named.get(id)
    if (!naming || naming.entry.sha256 !== entry.sha256) {
      unnamed.set(unit, [...(unnamed.get(unit) ?? []), `${id} (${entry.sha256})`])
      continue
    }
    parts.push({ entry, id, list: naming.list })
    byUnit.set(unit, parts)
  }

  // Every planned part must be staged before any unit is applied. If one is not (a download in progress), no unit is,
  // but the catalog refresh and the receipts pass below still run: that is the startup heal (spec §4). They leave out
  // every resource the plan changes (a part to put or a slot to remove, in any of its units, all of them waiting
  // now): its device rows are still the previous ones, and a catalog row or receipt decided from the new list would
  // misdescribe them (a new stamp over old rows, or a complete resource read as incomplete for the whole download).
  const missing = new Map<string, string[]>()
  for (const [unit, parts] of byUnit) {
    for (const p of parts) {
      if (!(await staging.has(p.entry.sha256))) missing.set(unit, [...(missing.get(unit) ?? []), `${p.id} (${p.entry.sha256})`])
    }
  }
  const pending = new Set<string>()
  if (missing.size > 0) {
    const waiting = plan.units.filter((unit) => missing.has(unit))
    result.refused = { reason: 'missing', message: `Parts of ${waiting.join(', ')} are not in staging; no unit was applied` }
    result.failed = waiting.map((unit) => ({ scope: 'unit', unit, reason: 'missing', message: `Not in staging: ${missing.get(unit)!.join(', ')}` }))
    for (const entry of plan.download) pending.add(entry.resource)
    for (const id of plan.remove) pending.add(resourceOfSlotId(id))
  }

  const resources = catalogOf(lists)
  type Availability = { offline: boolean; partial: boolean }
  /**
   * The lists' catalog rows of these resources, dated now, with `offline` and `partial` as given. A resource no list
   * carries (a unit removes its slots) keeps the device's row, with both flags off: it is not held any more, or soon
   * will not be, and a reader that saw it offline would never offer it again. That holds before its unit too, so an
   * app stopped after the unit commits leaves no flag to heal; the call that removes it is the last that knows it.
   */
  const catalogRows = async (keys: string[], now: number, availability: (key: string) => Promise<Availability>) => {
    const rows: Array<{ key: string; metadata: ResourceMetadata }> = []
    for (const key of keys) {
      const found = resources.get(key)
      if (!found) {
        const stored = await catalogRow(key)
        const has = storedAvailability(stored)
        if (stored && (has.offline || has.partial)) {
          rows.push({ key, metadata: { ...stored, availability: { ...stored.availability, offline: false, partial: false } } })
        }
        continue
      }
      const metadata = restoreCatalogBookkeeping(found.metadata, now)
      metadata.availability = { ...metadata.availability, ...(await availability(key)) }
      rows.push({ key, metadata })
    }
    return rows
  }
  const register: Register = new Map(input.register)
  const touched = new Set<string>()

  for (const unit of result.refused ? [] : plan.units) {
    const parts = byUnit.get(unit) ?? []
    const removes = plan.remove.filter((id) => unitOfSlotId(id) === unit)
    const now = clock()
    let ready: ReadyPart[]
    try {
      if (unnamed.has(unit)) throw new UnitError('invalid', `The plan names parts the lists do not: ${unnamed.get(unit)!.join(', ')}`)
      ready = []
      // One part at a time is gunzipped; a unit's rows are held until its transaction (spec §3: peak is one unit).
      for (const p of parts) ready.push(await readyPart(p.entry, p.id, p.list, staging, resources))
    } catch (error) {
      result.failed.push({ scope: 'unit', unit, ...causeOf(error) })
      continue
    }

    // The catalog rows first, from the list: the unit's derived keys (aligned quotes) carry the per-book stamps of
    // these rows, so rows that committed under an old catalog row would miss until the next release. If this fails,
    // nothing of the unit is written and its parts stay staged; the next plan does it again. `offline` and `partial`
    // keep what the device says unless the parts already held make it offline; they are set again once the unit
    // commits.
    const unitResources = [...new Set([...ready.map((p) => p.entry.resource), ...removes.map(resourceOfSlotId)])]
    try {
      const before = partsCoverage({ list, originals, versions: judged, register, chosen })
      const rows = await catalogRows(unitResources, now, async (key) =>
        isOffline(before, key) ? availabilityOf(before, key) : storedAvailability(await catalogRow(key)),
      )
      if (rows.length) await target.putCatalogRows(rows)
    } catch (error) {
      result.failed.push({ scope: 'unit', unit, ...causeOf(error, 'Catalog rows not written, unit not applied') })
      continue
    }

    const at = new Date(now).toISOString()
    const records = new Map<string, SlotRecord>(ready.map((p) => [p.id, { sha256: p.entry.sha256, keys: p.keys, list: p.list, at }]))
    const slotIds = [...ready.map((p) => p.id), ...removes]
    // Slots filled for the first time: their resource's rows from before parts are read to place them.
    const firstTime = ready.filter((p) => !input.register.has(p.id))
    const prefixes = [...new Set(firstTime.flatMap((p) => cleanupScans(p.entry.resource).map((scan) => scan.prefix)))]

    let replacedOriginals = false
    const removed: string[] = []
    try {
      await transactRaw({ keys: slotIds.map((id) => REGISTER_PREFIX + id), prefixes }, (found) => {
        // The register as it is now, inside the transaction (another window may have applied since the plan).
        const held = readRegister([...found.rows].map(([key, entry]) => ({ key, entry })))
        const puts: CacheRow[] = []
        for (const p of ready) for (const row of p.rows) puts.push({ key: row.key, entry: entryOf(row.value, now) })
        for (const [id, record] of records) puts.push(registerRow(id, record, now))
        const putKeys = new Set(puts.map((p) => p.key))
        const deletes = new Set<string>()
        const drop = (key: string) => {
          if (!putKeys.has(key)) deletes.add(key)
        }

        for (const p of ready) {
          const old = held.get(p.id)
          if (old) {
            for (const key of old.keys) drop(key)
            if (ORIGINALS_KINDS.has(p.entry.kind) && old.sha256 !== p.entry.sha256) replacedOriginals = true
            continue
          }
          // First time: rows of this slot that whole packs or online downloads left, which the register never knew.
          // Rows of an original there already are replaced by the part's: whether they were the same is not known.
          const resource = resources.get(p.entry.resource)?.resource ?? { key: p.entry.resource }
          for (const scan of cleanupScans(p.entry.resource)) {
            for (const key of found.prefixKeys.get(scan.prefix) ?? []) {
              if (!belongsTo(key, p.entry.resource, scan)) continue
              let slot: string | null = null
              try {
                const placed = slotOfRow({ layer: scan.layer, key }, resource)
                slot = placed ? slotId(placed) : null
              } catch {
                // A row no rule places is not known to be this slot's: it stays.
              }
              if (slot !== p.id) continue
              drop(key)
              if (ORIGINALS_KINDS.has(p.entry.kind)) replacedOriginals = true
            }
          }
        }

        for (const id of removes) {
          const old = held.get(id)
          // Only a slot this language's list put there (it may have changed hands since the plan).
          if (!old || old.list !== list.language) continue
          for (const key of old.keys) drop(key)
          drop(REGISTER_PREFIX + id)
          removed.push(id)
        }
        return { puts, deletes: [...deletes] }
      })
    } catch (error) {
      result.failed.push({ scope: 'unit', unit, ...causeOf(error) })
      continue
    }

    for (const [id, record] of records) register.set(id, record)
    for (const id of removed) register.delete(id)
    result.applied.push(unit)
    result.bytesApplied += ready.reduce((n, p) => n + p.entry.bytes, 0)
    if (replacedOriginals) result.originalsReplaced = true

    // The catalog rows again, now only to set their flags from the register: offline when every chosen part of the
    // resource is held, partial when it is not whole. If this fails (or the app stops here), the refresh at the end of
    // this call or of the next one sets them.
    for (const key of unitResources) touched.add(key)
    try {
      const after = partsCoverage({ list, originals, versions: judged, register, chosen })
      const rows = await catalogRows(unitResources, now, async (key) => availabilityOf(after, key))
      if (rows.length) await target.putCatalogRows(rows)
    } catch (error) {
      result.failed.push({ scope: 'catalog', unit, ...causeOf(error, 'Unit applied with its catalog rows; their offline and partial flags not updated') })
    }

    for (const p of ready) {
      try {
        await staging.delete(p.entry.sha256)
      } catch {
        // Harmless: the part is applied; staging cleanup is the app's (`list()`).
      }
    }
  }

  const coverage = partsCoverage({ list, originals, versions: judged, register, chosen })
  result.completed = [...touched].filter((key) => coverage.get(key)?.whole === true).sort()

  const catalog = new Map<string, ResourceMetadata>()
  for (const [key, found] of resources) if (found.metadata) catalog.set(key, found.metadata as ResourceMetadata)

  // Catalog rows of a new release (spec §3): a release that changed tags but no part gives no unit, yet the device's
  // row must name it, or the loaders' stamps and the receipts below would compare against the old one. Every resource
  // the lists name with a held part in the chosen units gets the list's row when its stamp differs from the device's,
  // or when its `offline` or `partial` flag is not what the register says: a call stopped between a unit's commit and
  // its flags (or whose flag write failed) left them stale, and nothing else would set them before the next release.
  // Resources still downloading (`pending`) are left as they are, here and in the receipts pass.
  const kept = new Set<string>(pending)
  const refreshAt = clock()
  const stale: string[] = []
  for (const [key, c] of coverage) {
    if (c.present === 0 || !catalog.has(key) || kept.has(key)) continue
    try {
      const row = await catalogRow(key)
      const has = storedAvailability(row)
      const wants = availabilityOf(coverage, key)
      if (resourceContentStamp(row) !== resourceContentStamp(catalog.get(key)) || has.offline !== wants.offline || has.partial !== wants.partial) {
        stale.push(key)
      }
    } catch (error) {
      kept.add(key)
      result.failed.push({ scope: 'catalog', ...causeOf(error, `Catalog row of ${key} not read`) })
    }
  }
  if (stale.length) {
    try {
      await target.putCatalogRows(await catalogRows(stale, refreshAt, async (key) => availabilityOf(coverage, key)))
    } catch (error) {
      for (const key of stale) kept.add(key)
      result.failed.push({ scope: 'catalog', ...causeOf(error, `Catalog rows of ${stale.join(', ')} not refreshed`) })
    }
  }

  // Receipts (spec §4): one more transaction after the last unit, on every call that gets this far (an empty plan and
  // a plan refused for parts not staged included), over the resources the lists name and those touched, so a receipt
  // a failed pass left out is written by the next call. Their receipts and the register rows of every slot the lists
  // name are read inside it, so what is decided is what is stored (another window may have applied since). A receipt
  // is written only against the device's catalog row as it is now: readers compare it with that row's stamp.
  const scope = receiptScope(lists, touched, judged)
  const stored = new Map<string, ResourceMetadata | null>()
  for (const key of scope) {
    // Already left as it is (its row could not be read or refreshed above): reported there.
    if (kept.has(key)) continue
    try {
      stored.set(key, await catalogRow(key))
    } catch (error) {
      kept.add(key)
      result.failed.push({ scope: 'receipts', ...causeOf(error, `Catalog row of ${key} not read; its receipt left as it is`) })
    }
  }
  const slotKeys = [...named.keys()].map((id) => REGISTER_PREFIX + id)
  const receiptsAt = clock()
  try {
    await transactRaw({ keys: [...scope.map(receiptKey), ...slotKeys], prefixes: [] }, (found) =>
      receiptChanges({
        lists,
        register: readRegister([...found.rows].map(([key, entry]) => ({ key, entry }))),
        catalog,
        stored,
        versions: judged,
        touched,
        kept,
        existing: found.rows,
        now: receiptsAt,
      }),
    )
  } catch (error) {
    result.failed.push({ scope: 'receipts', ...causeOf(error, 'Receipts not written') })
  }

  return result
}
