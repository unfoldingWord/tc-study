/**
 * Shared SoT resolve: local processed zip (IDB) first, else one DCS file.
 *
 * Lane 1 (current chapter + neighbors) may pass `fetchDcs` / `allowDcs: true`.
 * Lanes 2–3 must omit DCS — missing local SoT is `missing` (warm → blocked).
 */

import { RESOURCE_TYPE_IDS } from '../../resourceTypes/resourceTypeIds'
import { typeIdFromCatalogId } from '../warm/warmResourceClass'
import { isUsjViewModel, unwrapSoTPayload } from './sotDebug'
import { sotCacheKey } from './sotCacheKey'

export type SoTCache = {
  get(key: string): Promise<unknown>
  set?(key: string, entry: unknown): Promise<void>
}

export type FetchDcsFile = (args: {
  resourceKey: string
  book: string
  chapter?: number
  typeId: string
}) => Promise<unknown>

export type GetSoTArgs = {
  resourceKey: string
  book: string
  chapter?: number
  typeId?: string
  cache: SoTCache
  /**
   * Existing Door43 / scripture-loader helper. Called at most once per resolve
   * when IDB misses. Do not pass this from warm / lane 2–3.
   */
  fetchDcs?: FetchDcsFile
  /** Default false — warm jobs stay local-only. */
  allowDcs?: boolean
}

export type SoTHit = {
  status: 'hit'
  source: 'idb' | 'dcs'
  payload: unknown
  key: string
  typeId: string
}

export type SoTMiss = {
  status: 'missing'
  key: string
  typeId: string
}

export type SoTResult = SoTHit | SoTMiss

export function typeIdFromResourceKey(resourceKey: string): string {
  const catalogId = resourceKey.split('/')[2]?.split('#')[0] ?? ''
  return typeIdFromCatalogId(catalogId)
}

function isPresent(entry: unknown): boolean {
  return entry != null && entry !== ''
}

/** Processed USJ / TSV only — never persist a loader viewModel into scripture-usj. */
function shouldPersistDcsSoT(typeId: string, payload: unknown): boolean {
  if (typeId !== RESOURCE_TYPE_IDS.SCRIPTURE) return true
  return !isUsjViewModel(unwrapSoTPayload(payload))
}

/**
 * IDB first. On miss, optionally hydrate one DCS file and write the same SoT key
 * so a later zip pass skip-if-exists.
 */
export async function getSoT(args: GetSoTArgs): Promise<SoTResult> {
  const typeId = args.typeId ?? typeIdFromResourceKey(args.resourceKey)
  const key = sotCacheKey({
    typeId,
    resourceKey: args.resourceKey,
    book: args.book,
    chapter: args.chapter,
  })
  const cached = await args.cache.get(key)
  if (isPresent(cached)) {
    return { status: 'hit', source: 'idb', payload: cached, key, typeId }
  }

  const allowDcs = args.allowDcs === true && typeof args.fetchDcs === 'function'
  if (!allowDcs) {
    return { status: 'missing', key, typeId }
  }

  const payload = await args.fetchDcs!({
    resourceKey: args.resourceKey,
    book: args.book,
    chapter: args.chapter,
    typeId,
  })
  if (!isPresent(payload)) {
    return { status: 'missing', key, typeId }
  }

  if (args.cache.set && shouldPersistDcsSoT(typeId, payload)) {
    const already = await args.cache.get(key)
    if (!isPresent(already)) {
      await args.cache.set(key, payload)
    }
  }

  return { status: 'hit', source: 'dcs', payload, key, typeId }
}

/** Warm / lane 2–3: never attach fetchDcs. */
export function getLocalSoT(
  args: Omit<GetSoTArgs, 'fetchDcs' | 'allowDcs'>
): Promise<SoTResult> {
  return getSoT({ ...args, allowDcs: false })
}
