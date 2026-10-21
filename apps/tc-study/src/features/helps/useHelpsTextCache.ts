/**
 * Shared read-through cache for TA/TW titles and TW previews.
 *
 * Path: memory → IndexedDB → resolve() → write (confident only) → memory.
 * Fallback/placeholder values stay in memory only so they never freeze across sessions.
 */

import { useCallback, useRef, useState } from 'react'
import { useCacheAdapter } from '../../contexts'
import {
  readHelpsText,
  sweepStaleHelpsText,
  writeHelpsText,
  type HelpsTextCacheAdapter,
  type HelpsTextResolveResult,
} from '@bt-synergy/resource-pipeline/helps/helpsTextStore'
import type { HelpsTextKind } from './helpsCacheKeys'

export type { HelpsTextResolveResult }

export interface HelpsTextFetchArgs {
  resourceKey: string
  stamp: string
  entryId: string
  resolve: () => Promise<HelpsTextResolveResult>
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
