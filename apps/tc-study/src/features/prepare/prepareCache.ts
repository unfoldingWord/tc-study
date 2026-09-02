/**
 * Read/write helpers for prepared:{typeId}:... rows.
 */

import {
  preparedBookPrefix,
  preparedNavKey,
  preparedUnitKey,
  type PrepareTier,
} from './prepareKeys'
import type { PrepareCacheAdapter } from './prepareRegistry'

export interface PreparedEntryEnvelope<T = unknown> {
  content: T
  timestamp: number
  version: number
}

function wrap<T>(content: T, version: number): PreparedEntryEnvelope<T> {
  return { content, timestamp: Date.now(), version }
}

function unwrap<T>(
  entry: unknown,
  expectedVersion: number
): T | null {
  if (!entry || typeof entry !== 'object') return null
  const e = entry as PreparedEntryEnvelope<T> & { content?: T; version?: number }
  const version = e.version ?? (e.content as { version?: number } | undefined)?.version
  const content = (e.content ?? e) as T
  if (typeof version === 'number' && version !== expectedVersion) return null
  if (content && typeof content === 'object' && 'version' in (content as object)) {
    const inner = content as { version?: number }
    if (typeof inner.version === 'number' && inner.version !== expectedVersion) return null
  }
  return content
}

export async function writePreparedNav(
  cache: PrepareCacheAdapter,
  typeId: string,
  resourceKey: string,
  bookId: string,
  version: number,
  nav: unknown
): Promise<void> {
  await cache.set(preparedNavKey(typeId, resourceKey, bookId), wrap(nav, version))
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
    wrap(payload, version)
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
  return unwrap<T>(entry, version)
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
  return unwrap<T>(entry, version)
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
