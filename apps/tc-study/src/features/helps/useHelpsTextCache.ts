/**
 * Shared read-through cache for TA/TW titles and TW previews.
 *
 * Path: memory → IndexedDB → resolve() → write (confident only) → memory.
 * Fallback/placeholder values stay in memory only so they never freeze across sessions.
 */

import { useCallback, useRef, useState } from 'react'
import { useCacheAdapter } from '../../contexts'
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

export interface HelpsTextFetchArgs {
  resourceKey: string
  stamp: string
  entryId: string
  resolve: () => Promise<HelpsTextResolveResult>
}

type HelpsTextCacheAdapter = {
  get(key: string): Promise<unknown>
  set(key: string, entry: unknown): Promise<void>
  delete?(key: string): Promise<void>
  getByPrefix?(prefix: string): Promise<Array<{ key: string; entry: unknown }>>
}

async function readHelpsText(
  cache: HelpsTextCacheAdapter,
  kind: HelpsTextKind,
  resourceKey: string,
  stamp: string,
  entryId: string
): Promise<string | null> {
  const entry = await cache.get(helpsTextKey(kind, resourceKey, stamp, entryId))
  return unwrapVersioned<string>(entry, HELPS_TEXT_VERSION)
}

async function writeHelpsText(
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

async function sweepStaleHelpsText(
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

export function useHelpsTextCache(kind: HelpsTextKind) {
  const cacheAdapter = useCacheAdapter() as HelpsTextCacheAdapter | null
  const [values, setValues] = useState<Map<string, string>>(() => new Map())
  const [loading, setLoading] = useState<Set<string>>(() => new Set())
  const valuesRef = useRef<Map<string, string>>(new Map())
  const loadingRef = useRef<Set<string>>(new Set())
  const fallbackRef = useRef<Set<string>>(new Set())
  const sweptRef = useRef<Set<string>>(new Set())

  const remember = useCallback((entryId: string, value: string, confident: boolean) => {
    valuesRef.current.set(entryId, value)
    if (confident) fallbackRef.current.delete(entryId)
    else fallbackRef.current.add(entryId)
    setValues((prev) => new Map(prev).set(entryId, value))
  }, [])

  const getCached = useCallback((entryId: string): string | null => {
    return values.get(entryId) ?? null
  }, [values])

  const hasCached = useCallback((entryId: string): boolean => {
    return values.has(entryId)
  }, [values])

  const fetchText = useCallback(
    async (args: HelpsTextFetchArgs): Promise<string | null> => {
      const { resourceKey, stamp, entryId, resolve } = args

      // Confident memory hit — skip network/IDB.
      if (valuesRef.current.has(entryId) && !fallbackRef.current.has(entryId)) {
        return valuesRef.current.get(entryId) ?? null
      }

      if (loadingRef.current.has(entryId)) return null

      loadingRef.current.add(entryId)
      setLoading((prev) => new Set(prev).add(entryId))

      try {
        if (cacheAdapter) {
          try {
            const cached = await readHelpsText(cacheAdapter, kind, resourceKey, stamp, entryId)
            if (cached != null) {
              remember(entryId, cached, true)
              return cached
            }
          } catch {
            /* fall through to resolve */
          }
        }

        const result = await resolve()
        remember(entryId, result.value, result.confident)

        if (result.confident && cacheAdapter) {
          try {
            await writeHelpsText(cacheAdapter, kind, resourceKey, stamp, entryId, result.value)
            const sweepKey = `${kind}:${resourceKey}@${stamp}`
            if (!sweptRef.current.has(sweepKey)) {
              sweptRef.current.add(sweepKey)
              void sweepStaleHelpsText(cacheAdapter, kind, resourceKey, stamp)
            }
          } catch {
            /* memory already updated */
          }
        }

        return result.value
      } finally {
        loadingRef.current.delete(entryId)
        setLoading((prev) => {
          const next = new Set(prev)
          next.delete(entryId)
          return next
        })
      }
    },
    [cacheAdapter, kind, remember]
  )

  return {
    values,
    loading,
    fetchText,
    getCached,
    hasCached,
    /** Test / advanced: whether entryId is a non-persisted fallback. */
    isFallback: (entryId: string) => fallbackRef.current.has(entryId),
  }
}

/** Pure helpers exported for unit tests (no React). */
export const helpsTextCacheIO = {
  readHelpsText,
  writeHelpsText,
  sweepStaleHelpsText,
}
