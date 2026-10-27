/**
 * Applying a plan (spec §2–§3): the staged parts go into the device's store one unit at a time (a book, or the shared
 * unit), each unit in one transaction with its register rows, so a reader never sees new notes over old alignments of
 * the same book. Before each unit, the catalog rows of its resources; after it, their `offline` flag.
 *
 * What may be deleted, and nothing else: keys a slot's previous part wrote (its register row says which) that the new
 * part no longer has; the first time a slot is filled, rows of that slot's resource found by its key prefixes that
 * `slotOfRow` places in that very slot; and the keys of a slot this language's list put there and no longer names.
 * Units never touch receipts: after the last unit, one more transaction writes the receipts of the touched resources
 * that are whole and deletes the receipts from parts of those that are not (`receipts.ts`).
 */

import type { ResourceMetadata } from '@bt-synergy/resource-catalog'
import { belongsTo, scansFor } from '../keys'
import type { CacheRow, PackLayer, PackTarget, PackVersions } from '../types'
import { PART_LAYERS, readPart, sha256Hex, type PartRow } from './partFile'
import { restoreCatalogBookkeeping, unitOfPart, type PartEntry, type PartsList } from './partsList'
import { slotId, slotOfEntry, slotOfRow } from './partSlots'
import { namedParts, partsCoverage, type Coverage, type PartsPlan } from './plan'
import { receiptChanges, receiptKey } from './receipts'
import { REGISTER_PREFIX, readRegister, registerRow, unitOfSlotId, type Register, type SlotRecord } from './register'
import type { PartsStaging } from './staging'

export type ApplyInput = {
  target: PackTarget
  staging: PartsStaging
  plan: PartsPlan
  list: PartsList
  originals?: PartsList
  /** The register the plan was made from: says which slots are filled for the first time. */
  register: Register
  /** The units the person chose (the plan's input), for `availability.offline`. */
  chosen: string[]
  /** This app's processing versions, by layer. */
  versions: PackVersions
  /** Apply time (ms); `Date.now` by default. */
  now?: () => number
}

/** `unit` is `receipts` when the units applied but the receipts transaction after them failed. */
export type ApplyFailure = { unit: string; reason: 'missing' | 'quota' | 'invalid' | 'versions' | 'error'; message: string }

export type ApplyResult = {
  /** Units whose transaction committed, in apply order. */
  applied: string[]
  /**
   * Units not applied, with why; their parts stay in staging. A unit that committed but whose catalog rows could not
   * be written again with their `offline` flag is in `applied` and here too (`error`): only that flag is stale.
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

/** The layers whose versions differ, as `importLanguagePack` compares them: names both sides have, as text. */
function differingLayers(theirs: PackVersions | undefined, mine: PackVersions | undefined): PackLayer[] {
  if (!theirs || !mine) return []
  const out: PackLayer[] = []
  for (const layer of Object.keys(mine) as PackLayer[]) {
    const a = theirs[layer]
    const b = mine[layer]
    if (!a || !b) continue
    if (Object.keys(b).some((name) => name in a && String(a[name]) !== String(b[name]))) out.push(layer)
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

/** The resource a slot id is of: `{kind}:{resource}[:{book}][:{group}]`, resource keys hold no `:`. */
const resourceOfSlotId = (id: string): string => id.split(':')[1] ?? ''

/** The scans that find a resource's rows, receipts left out: they are never deleted here. */
const cleanupScans = (resourceKey: string) => scansFor(resourceKey).filter((scan) => !scan.exact && scan.layer !== 'receipt')

class UnitError extends Error {
  constructor(readonly reason: ApplyFailure['reason'], message: string) {
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

function failureOf(unit: string, error: unknown): ApplyFailure {
  if (error instanceof UnitError) return { unit, reason: error.reason, message: error.message }
  const name = (error as { name?: unknown } | null)?.name
  const message = String((error as { message?: unknown } | null)?.message ?? error)
  return { unit, reason: name === 'QuotaExceededError' ? 'quota' : 'error', message }
}

export async function applyParts(input: ApplyInput): Promise<ApplyResult> {
  const { target, staging, plan, list, originals, chosen } = input
  const transactRaw = target.transactRaw?.bind(target)
  if (!transactRaw) {
    throw new Error('This store cannot apply parts: it has no transactRaw (one transaction per unit). Update the cache adapter.')
  }
  const clock = input.now ?? Date.now
  const result: ApplyResult = { applied: [], failed: [], completed: [], originalsReplaced: false, bytesApplied: 0 }
  // Throws, before anything is written, when the list needs its originals list and was not given it.
  partsCoverage({ list, originals, register: input.register, chosen })

  const lists = originals ? [list, originals] : [list]
  for (const l of lists) {
    const differ = differingLayers(l.versions, input.versions)
    if (differ.length === 0) continue
    const message = `The ${l.language} parts list was made with other versions (${differ.join(', ')}) than this app's; update the app`
    result.failed = plan.units.map((unit) => ({ unit, reason: 'versions', message }))
    return result
  }

  // Every slot once, with the list that named it (Review Focus 2).
  const named = namedParts(list, originals)
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

  // Every planned part must be staged before anything is applied.
  const missing = new Map<string, string[]>()
  for (const [unit, parts] of byUnit) {
    for (const p of parts) {
      if (!(await staging.has(p.entry.sha256))) missing.set(unit, [...(missing.get(unit) ?? []), `${p.id} (${p.entry.sha256})`])
    }
  }
  if (missing.size > 0) {
    result.failed = plan.units
      .filter((unit) => missing.has(unit))
      .map((unit) => ({ unit, reason: 'missing', message: `Not in staging: ${missing.get(unit)!.join(', ')}` }))
    return result
  }

  const resources = catalogOf(lists)
  /** The lists' catalog rows of these resources (those they carry), dated now, with `offline` as given. */
  const catalogRows = async (keys: string[], now: number, offline: (key: string) => Promise<boolean>) => {
    const rows: Array<{ key: string; metadata: ResourceMetadata }> = []
    for (const key of keys) {
      const found = resources.get(key)
      if (!found) continue
      const metadata = restoreCatalogBookkeeping(found.metadata, now)
      metadata.availability = { ...metadata.availability, offline: await offline(key) }
      rows.push({ key, metadata })
    }
    return rows
  }
  const register: Register = new Map(input.register)
  const touched = new Set<string>()

  for (const unit of plan.units) {
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
      result.failed.push(failureOf(unit, error))
      continue
    }

    // The catalog rows first, from the list: the unit's derived keys (aligned quotes) carry the per-book stamps of
    // these rows, so rows that committed under an old catalog row would miss until the next release. If this fails,
    // nothing of the unit is written and its parts stay staged; the next plan does it again. `offline` keeps what the
    // device says unless the parts already held make it true; it is set again once the unit commits.
    const unitResources = [...new Set([...ready.map((p) => p.entry.resource), ...removes.map(resourceOfSlotId)])]
    try {
      const before = partsCoverage({ list, originals, register, chosen })
      const rows = await catalogRows(unitResources, now, async (key) => {
        if (isOffline(before, key)) return true
        const current = target.catalogRow ? await target.catalogRow(key) : null
        return Boolean((current as { availability?: { offline?: unknown } } | null)?.availability?.offline)
      })
      if (rows.length) await target.putCatalogRows(rows)
    } catch (error) {
      result.failed.push({ unit, reason: 'error', message: `Catalog rows not written, unit not applied: ${failureOf(unit, error).message}` })
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
              if (slot === p.id) drop(key)
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
      result.failed.push(failureOf(unit, error))
      continue
    }

    for (const [id, record] of records) register.set(id, record)
    for (const id of removed) register.delete(id)
    result.applied.push(unit)
    result.bytesApplied += ready.reduce((n, p) => n + p.entry.bytes, 0)
    if (replacedOriginals) result.originalsReplaced = true

    // The catalog rows again, now only to say whether each resource is offline: every chosen part of it is held.
    for (const key of unitResources) touched.add(key)
    try {
      const after = partsCoverage({ list, originals, register, chosen })
      const rows = await catalogRows(unitResources, now, async (key) => isOffline(after, key))
      if (rows.length) await target.putCatalogRows(rows)
    } catch (error) {
      result.failed.push({ unit, reason: 'error', message: `Unit applied with its catalog rows; their offline flag not updated: ${failureOf(unit, error).message}` })
    }

    for (const p of ready) {
      try {
        await staging.delete(p.entry.sha256)
      } catch {
        // Harmless: the part is applied; staging cleanup is the app's (`list()`).
      }
    }
  }

  const coverage = partsCoverage({ list, originals, register, chosen })
  result.completed = [...touched].filter((key) => coverage.get(key)?.whole === true).sort()

  // Receipts (spec §4): one more transaction after the last unit, for the touched resources only. Their receipts and
  // the register rows of every slot the lists name for them are read inside it, so what is decided is what is stored
  // (another window may have applied since).
  if (touched.size > 0) {
    const slotKeys = [...named].filter(([, n]) => touched.has(n.entry.resource)).map(([id]) => REGISTER_PREFIX + id)
    const catalog = new Map<string, ResourceMetadata>()
    for (const [key, found] of resources) if (found.metadata) catalog.set(key, found.metadata as ResourceMetadata)
    const now = clock()
    try {
      await transactRaw({ keys: [...[...touched].sort().map(receiptKey), ...slotKeys], prefixes: [] }, (found) =>
        receiptChanges({
          lists,
          register: readRegister([...found.rows].map(([key, entry]) => ({ key, entry }))),
          catalog,
          versions: input.versions,
          touched,
          existing: found.rows,
          now,
        }),
      )
    } catch (error) {
      const failure = failureOf('receipts', error)
      result.failed.push({ ...failure, message: `Units applied; their receipts not written: ${failure.message}` })
    }
  }

  return result
}
