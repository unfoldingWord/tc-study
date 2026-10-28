/**
 * Receipts from parts (spec §4): when every part the lists name for a resource is held, the resource gets the
 * `resource:{key}` receipt a whole download leaves, so existing readers (`isResourceMarkedComplete`, the completeness
 * checker, the loaders) take it as complete; `downloadMethod: 'parts'` says who wrote it. A resource held in part gets
 * none: "complete" would mislead those readers. When a resource stops being whole, only a receipt from parts is
 * deleted: one a whole pack or a download wrote is not this importer's.
 *
 * The pass covers every resource the lists name, not only those an apply touched, so a receipt whose transaction
 * failed is written by the next call (apps call `applyParts` at startup, even with nothing to download).
 */

import {
  ABSENT_FROM_RELEASE_KEY,
  buildIngestReceiptFromCatalog,
  expectedIngestReleaseStamp,
  ingestSchemaForResourceType,
  isMatchingIngestReceipt,
  readIngestReceiptMeta,
  type ResourceMetadata,
} from '@bt-synergy/resource-catalog'
import type { CacheRow, PackVersions } from '../types'
import type { PartsList } from './partsList'
import { namedParts, partsCoverage } from './plan'
import type { Register } from './register'

export const PARTS_DOWNLOAD_METHOD = 'parts'

/** The key of a resource's receipt. */
export const receiptKey = (resourceKey: string) => `resource:${resourceKey}`

/** The resources whose receipts a pass decides: those the lists name a part of, and those this call touched. */
export function receiptScope(lists: PartsList[], touched: Iterable<string>, versions?: PackVersions): string[] {
  const [list, originals] = lists
  const scope = new Set(touched)
  for (const { entry } of namedParts(list, originals, versions).values()) scope.add(entry.resource)
  return [...scope].sort()
}

export type ReceiptInput = {
  /** The language's list, then its originals list when it has one. */
  lists: PartsList[]
  /** What the device holds; read in the same transaction as the receipts are written. */
  register: Register
  /** Catalog rows by resource key (the originals list's for the resources it carries): the release stamp and type. */
  catalog: Map<string, ResourceMetadata>
  /**
   * The device's catalog rows as they are after this call refreshed them (absent or null: none). Readers compare a
   * receipt with these, so a receipt is written only when the device's row has the list's release stamp.
   */
  stored: Map<string, ResourceMetadata | null>
  /** Resources whose receipts this call leaves as they are: their catalog row could not be refreshed or read. */
  kept?: Iterable<string>
  /** This app's processing versions: `sot.usjProcessing` names the scripture schema. */
  versions: PackVersions
  /**
   * The resources this call touched. With those the lists name, they are the pass's scope (`receiptScope`): a touched
   * resource the lists no longer name any part of can lose its receipt; other receipts are left alone.
   */
  touched: Iterable<string>
  /** The receipts there are now, by key (`resource:{key}`); absent keys have none. */
  existing: Map<string, unknown>
  /** When the receipts are written (ms). */
  now: number
}

/**
 * The receipts to write and delete in the pass's scope (`kept` left out): a receipt for each whole resource whose
 * catalog row in the list has a release stamp and the device's row the same one, unless the one there already matches
 * that stamp and schema; a delete for each resource not whole (the lists naming none of its parts included) whose
 * receipt is from parts.
 */
export function receiptChanges(input: ReceiptInput): { puts: CacheRow[]; deletes: string[] } {
  const [list, originals] = input.lists
  const coverage = partsCoverage({ list, originals, register: input.register, chosen: [], versions: input.versions })
  const usj = input.versions.sot?.usjProcessing
  const kept = new Set(input.kept ?? [])
  const puts: CacheRow[] = []
  const deletes: string[] = []
  for (const key of receiptScope(input.lists, input.touched, input.versions)) {
    if (kept.has(key)) continue
    const existing = input.existing.get(receiptKey(key))
    const existingMeta = readIngestReceiptMeta(existing)
    if (coverage.get(key)?.whole === true) {
      const metadata = input.catalog.get(key)
      const stamp = expectedIngestReleaseStamp(metadata)
      // The device's row names another release (or none): a receipt of the list's would read as stale; leave it.
      if (!stamp || expectedIngestReleaseStamp(input.stored.get(key)) !== stamp) continue
      const ingestSchema = ingestSchemaForResourceType(metadata?.type, usj === undefined ? undefined : String(usj))
      // Already a receipt readers accept for this release: nothing to write.
      if (isMatchingIngestReceipt(existing, stamp, ingestSchema)) continue
      const receipt = buildIngestReceiptFromCatalog(metadata, { ingestSchema, downloadMethod: PARTS_DOWNLOAD_METHOD })
      // No release stamp: no receipt a reader could match, and nothing known to be stale.
      if (!receipt) continue
      receipt.downloadCompletedAt = new Date(input.now).toISOString()
      // The books absent from this release, as a receipt of the same release recorded them: the loaders read them.
      const absent = existingMeta?.[ABSENT_FROM_RELEASE_KEY]
      if (existingMeta?.releaseStamp === receipt.releaseStamp && Array.isArray(absent)) receipt[ABSENT_FROM_RELEASE_KEY] = [...absent]
      puts.push({ key: receiptKey(key), entry: { content: {}, metadata: receipt } })
    } else if (existingMeta?.downloadMethod === PARTS_DOWNLOAD_METHOD) {
      deletes.push(receiptKey(key))
    }
  }
  return { puts, deletes }
}
