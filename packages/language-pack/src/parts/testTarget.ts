/**
 * An in-memory `PackTarget` with the same `transactRaw` contract as the IndexedDB adapter (puts before deletes, exact
 * keys, all or nothing, entries cloned as IndexedDB would), for tests of applying parts. It can be told to fail its
 * next transaction, as a full disk would.
 */

import type { ResourceMetadata } from '@bt-synergy/resource-catalog'
import type { CacheRow, PackTarget, RawFound, RawRead, RawWrite } from '../types'

export type MemoryTarget = PackTarget & {
  /** The cache store: key to entry. */
  rows: Map<string, unknown>
  /** The catalog: resource key to its row. */
  catalog: Map<string, ResourceMetadata>
  /** How many `transactRaw` calls committed. */
  committed: number
  /** The next `transactRaw` writes nothing and rejects with an error of this name (`QuotaExceededError` by default). */
  failNextTransaction(name?: string): void
}

function namedError(name: string, message: string): Error {
  if (typeof DOMException === 'function') return new DOMException(message, name) as unknown as Error
  return Object.assign(new Error(message), { name })
}

export function memoryTarget(options: { rows?: CacheRow[]; transactRaw?: boolean } = {}): MemoryTarget {
  const rows = new Map<string, unknown>((options.rows ?? []).map((r) => [r.key, structuredClone(r.entry)]))
  const catalog = new Map<string, ResourceMetadata>()
  let failNext: string | null = null

  const target: MemoryTarget = {
    rows,
    catalog,
    committed: 0,
    failNextTransaction(name = 'QuotaExceededError') {
      failNext = name
    },
    async putRows(list) {
      for (const r of list) rows.set(r.key, structuredClone(r.entry))
    },
    async existingKeys(keys) {
      return new Set(keys.filter((k) => rows.has(k)))
    },
    async putCatalogRows(list) {
      for (const r of list) catalog.set(r.key, structuredClone(r.metadata))
    },
    async catalogRow(key) {
      return catalog.get(key) ?? null
    },
  }
  if (options.transactRaw === false) return target

  target.transactRaw = async (read: RawRead, decide: (found: RawFound) => RawWrite) => {
    await Promise.resolve()
    const found: RawFound = { rows: new Map(), prefixKeys: new Map() }
    for (const key of read.keys) if (rows.has(key)) found.rows.set(key, structuredClone(rows.get(key)))
    const sorted = [...rows.keys()].sort()
    for (const prefix of read.prefixes) {
      // The same range IndexedDB reads: [prefix, prefix + '￿'].
      found.prefixKeys.set(prefix, sorted.filter((k) => k >= prefix && k <= prefix + '￿'))
    }
    const write = decide(found)
    // Everything is cloned before the store changes: an entry that cannot be cloned fails the whole transaction.
    const puts = write.puts.map((p) => [p.key, structuredClone(p.entry)] as const)
    if (failNext !== null) {
      const name = failNext
      failNext = null
      throw namedError(name, `Simulated ${name}`)
    }
    for (const [key, entry] of puts) rows.set(key, entry)
    for (const key of write.deletes) rows.delete(key)
    target.committed++
  }
  return target
}
