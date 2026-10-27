/**
 * Receipts from parts (spec §4): when every part the lists name for a resource is held, the resource gets the
 * `resource:{key}` receipt a whole download leaves, so existing readers (`isResourceMarkedComplete`, the completeness
 * checker, the loaders) take it as complete; `downloadMethod: 'parts'` says who wrote it. A resource held in part gets
 * none: "complete" would mislead those readers. When a resource stops being whole, only a receipt from parts is
 * deleted: one a whole pack or a download wrote is not this importer's.
 */

import { buildIngestReceiptFromCatalog, ingestSchemaForResourceType, type ResourceMetadata } from '@bt-synergy/resource-catalog'
import type { CacheRow, PackVersions } from '../types'
import type { PartsList } from './partsList'
import { partsCoverage } from './plan'
import type { Register } from './register'

export const PARTS_DOWNLOAD_METHOD = 'parts'

/** The key of a resource's receipt. */
export const receiptKey = (resourceKey: string) => `resource:${resourceKey}`

export type ReceiptInput = {
  /** The language's list, then its originals list when it has one. */
  lists: PartsList[]
  /** What the device holds; read in the same transaction as the receipts are written. */
  register: Register
  /** Catalog rows by resource key (the originals list's for the resources it carries): the release stamp and type. */
  catalog: Map<string, ResourceMetadata>
  /** This app's processing versions: `sot.usjProcessing` names the scripture schema. */
  versions: PackVersions
  /** The resources this apply touched: only their receipts are written or deleted. */
  touched: Iterable<string>
  /** The receipts there are now, by key (`resource:{key}`); absent keys have none. */
  existing: Map<string, unknown>
  /** When the receipts are written (ms). */
  now: number
}

const methodOf = (entry: unknown): unknown =>
  ((entry as { metadata?: { downloadMethod?: unknown } } | null | undefined)?.metadata ?? {}).downloadMethod

/**
 * The receipts to write and delete for the touched resources: a receipt for each that is whole (and whose catalog row
 * has a release stamp), a delete for each that is not whole, the lists naming none of its parts included, and has a
 * receipt from parts.
 */
export function receiptChanges(input: ReceiptInput): { puts: CacheRow[]; deletes: string[] } {
  const [list, originals] = input.lists
  const coverage = partsCoverage({ list, originals, register: input.register, chosen: [] })
  const usj = input.versions.sot?.usjProcessing
  const puts: CacheRow[] = []
  const deletes: string[] = []
  for (const key of [...new Set(input.touched)].sort()) {
    if (coverage.get(key)?.whole === true) {
      const metadata = input.catalog.get(key)
      const receipt = buildIngestReceiptFromCatalog(metadata, {
        ingestSchema: ingestSchemaForResourceType(metadata?.type, usj === undefined ? undefined : String(usj)),
        downloadMethod: PARTS_DOWNLOAD_METHOD,
      })
      // No release stamp: no receipt a reader could match, and nothing known to be stale.
      if (!receipt) continue
      receipt.downloadCompletedAt = new Date(input.now).toISOString()
      puts.push({ key: receiptKey(key), entry: { content: {}, metadata: receipt } })
    } else if (methodOf(input.existing.get(receiptKey(key))) === PARTS_DOWNLOAD_METHOD) {
      deletes.push(receiptKey(key))
    }
  }
  return { puts, deletes }
}
