/**
 * Book-level warm coverage index — one entry per quote/align/prepare relationship.
 * Lane 3 consults this instead of scanning every chapter key.
 */

import { unwrapVersioned, wrapVersioned } from '../cache/versionedEnvelope'

export const WARM_COVERAGE_KEY = 'warm-coverage:v1'
export const WARM_COVERAGE_VERSION = 1

export type WarmCoverageEntry = {
  stamp: string
  unitCount: number
  updatedAt: number
}

export type WarmCoverageMap = Record<string, WarmCoverageEntry>

export type WarmCoverageCacheAdapter = {
  get(key: string): Promise<unknown>
  set(key: string, entry: unknown): Promise<void>
}

export function prepareRelationId(args: {
  typeId: string
  resourceKey: string
  book: string
}): string {
  return `prep:${args.typeId}:${args.resourceKey}:${args.book.toLowerCase()}`
}

export async function readWarmCoverage(
  cache: WarmCoverageCacheAdapter
): Promise<WarmCoverageMap> {
  const entry = await cache.get(WARM_COVERAGE_KEY)
  return unwrapVersioned<WarmCoverageMap>(entry, WARM_COVERAGE_VERSION) ?? {}
}

export async function writeWarmCoverage(
  cache: WarmCoverageCacheAdapter,
  map: WarmCoverageMap
): Promise<void> {
  await cache.set(WARM_COVERAGE_KEY, wrapVersioned(map, WARM_COVERAGE_VERSION))
}

export async function markRelationCovered(
  cache: WarmCoverageCacheAdapter,
  relationId: string,
  stamp: string,
  unitCount: number
): Promise<void> {
  const map = await readWarmCoverage(cache)
  const prev = map[relationId]
  const nextCount =
    prev && prev.stamp === stamp ? Math.max(prev.unitCount, unitCount) : unitCount
  map[relationId] = { stamp, unitCount: nextCount, updatedAt: Date.now() }
  await writeWarmCoverage(cache, map)
}

export async function isRelationCovered(
  cache: WarmCoverageCacheAdapter,
  relationId: string,
  stamp: string,
  minUnitCount = 1
): Promise<boolean> {
  const map = await readWarmCoverage(cache)
  const entry = map[relationId]
  return Boolean(entry && entry.stamp === stamp && entry.unitCount >= minUnitCount)
}

export async function clearRelationCoverage(
  cache: WarmCoverageCacheAdapter,
  relationId: string
): Promise<void> {
  const map = await readWarmCoverage(cache)
  if (!(relationId in map)) return
  delete map[relationId]
  await writeWarmCoverage(cache, map)
}
