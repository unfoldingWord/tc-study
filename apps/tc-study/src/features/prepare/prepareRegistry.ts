/**
 * React-free preparation registry.
 *
 * Workers import this module — never resourceTypes/** (those pull viewers).
 * SoT parity: every LOADER_CONFIGS row with surfaces.prepare must have a
 * registered preparer and vice versa (see loaderConfig.test.ts).
 */

import type { ResourceTypeId } from '../../resourceTypes/resourceTypeIds'
import type { PrepareTier } from './prepareKeys'

/** Minimal cache adapter surface used by preparers. */
export interface PrepareCacheAdapter {
  get(key: string): Promise<unknown>
  set(key: string, entry: unknown): Promise<void>
  getByPrefix?(prefix: string): Promise<Array<{ key: string; entry: unknown }>>
}

export interface PrepareContext {
  cacheAdapter: PrepareCacheAdapter
}

export interface ResourcePreparer<TSource = unknown, TUnit = number> {
  id: ResourceTypeId
  /** Bump when light/full payload shape changes. */
  version: number
  readSource(
    ctx: PrepareContext,
    resourceKey: string,
    bookId: string
  ): Promise<TSource | null>
  unitsFor(source: TSource): TUnit[]
  prepareNav?(source: TSource): unknown
  prepareLight(source: TSource, unit: TUnit): unknown
  prepareFull(source: TSource, unit: TUnit): unknown
}

const registry = new Map<string, ResourcePreparer<unknown, unknown>>()

export function registerPreparer<TSource, TUnit>(
  preparer: ResourcePreparer<TSource, TUnit>
): void {
  registry.set(preparer.id, preparer as ResourcePreparer<unknown, unknown>)
}

export function getPreparer(typeId: string): ResourcePreparer<unknown, unknown> | undefined {
  return registry.get(typeId)
}

export function getRegisteredPreparerIds(): string[] {
  return [...registry.keys()].sort()
}

export function clearPreparersForTests(): void {
  registry.clear()
}

export type { PrepareTier }
