/**
 * `helps-text:` rows (TA/TW titles, TW previews) read and written with no React, so the app's hook, a worker or a
 * language-pack builder write the very same rows.
 */

import { unwrapVersioned, wrapVersioned } from '../cache/versionedEnvelope'
import {
  HELPS_TEXT_VERSION,
  helpsTextKey,
  helpsTextResourcePrefix,
  isStaleHelpsTextKey,
  type HelpsTextKind,
} from './helpsCacheKeys'

export interface HelpsTextResolveResult {
  value: string
  /** False for TOC-not-ready / missing-ingredient placeholders — never persisted. */
  confident: boolean
}

export type HelpsTextCacheAdapter = {
  get(key: string): Promise<unknown>
  set(key: string, entry: unknown): Promise<void>
  delete?(key: string): Promise<void>
  getByPrefix?(prefix: string): Promise<Array<{ key: string; entry: unknown }>>
}

export async function readHelpsText(
  cache: HelpsTextCacheAdapter,
  kind: HelpsTextKind,
  resourceKey: string,
  stamp: string,
  entryId: string
): Promise<string | null> {
  const entry = await cache.get(helpsTextKey(kind, resourceKey, stamp, entryId))
  return unwrapVersioned<string>(entry, HELPS_TEXT_VERSION)
}

export async function writeHelpsText(
  cache: HelpsTextCacheAdapter,
  kind: HelpsTextKind,
  resourceKey: string,
  stamp: string,
  entryId: string,
  value: string
): Promise<void> {
  await cache.set(
    helpsTextKey(kind, resourceKey, stamp, entryId),
    wrapVersioned(value, HELPS_TEXT_VERSION)
  )
}

export async function sweepStaleHelpsText(
  cache: HelpsTextCacheAdapter,
  kind: HelpsTextKind,
  resourceKey: string,
  currentStamp: string
): Promise<void> {
  if (typeof cache.getByPrefix !== 'function' || typeof cache.delete !== 'function') return
  const rows = await cache.getByPrefix(helpsTextResourcePrefix(kind, resourceKey))
  for (const row of rows) {
    if (isStaleHelpsTextKey(row.key, currentStamp)) {
      await cache.delete(row.key)
    }
  }
}
