/**
 * Read/write helpers for prepared:{typeId}:... rows.
 */

import { unwrapVersioned, wrapVersioned, type VersionedEnvelope } from '../cache/versionedEnvelope'
import {
  preparedBookPrefix,
  preparedNavKey,
  preparedUnitKey,
  type PrepareTier,
} from './prepareKeys'
import type { PrepareCacheAdapter } from './prepareRegistry'

export type PreparedEntryEnvelope<T = unknown> = VersionedEnvelope<T>

export async function writePreparedNav(
  cache: PrepareCacheAdapter,
  typeId: string,
  resourceKey: string,
  bookId: string,
  version: number,
  nav: unknown
): Promise<void> {
  await cache.set(preparedNavKey(typeId, resourceKey, bookId), wrapVersioned(nav, version))
}

export async function writePreparedUnit(
  cache: PrepareCacheAdapter,
  typeId: string,
  resourceKey: string,
  bookId: string,
  unit: string | number,
  tier: PrepareTier,
  version: number,
  payload: unknown
): Promise<void> {
  await cache.set(
    preparedUnitKey(typeId, resourceKey, bookId, unit, tier),
    wrapVersioned(payload, version)
  )
}

export async function readPreparedNav<T>(
  cache: PrepareCacheAdapter,
  typeId: string,
  resourceKey: string,
  bookId: string,
  version: number
): Promise<T | null> {
  const entry = await cache.get(preparedNavKey(typeId, resourceKey, bookId))
  return unwrapVersioned<T>(entry, version)
}

export async function readPreparedUnit<T>(
  cache: PrepareCacheAdapter,
  typeId: string,
  resourceKey: string,
  bookId: string,
  unit: string | number,
  tier: PrepareTier,
  version: number
): Promise<T | null> {
  const entry = await cache.get(
    preparedUnitKey(typeId, resourceKey, bookId, unit, tier)
  )
  return unwrapVersioned<T>(entry, version)
}

export async function listPreparedKeysForBook(
  cache: PrepareCacheAdapter,
  typeId: string,
  resourceKey: string,
  bookId: string
): Promise<string[]> {
  const prefix = preparedBookPrefix(typeId, resourceKey, bookId)
  if (typeof cache.getByPrefix === 'function') {
    const rows = await cache.getByPrefix(prefix)
    return rows.map((r) => r.key)
  }
  return []
}
