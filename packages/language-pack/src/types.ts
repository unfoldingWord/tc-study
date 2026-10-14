/**
 * A language pack (apps/tc-study/docs/cache-data-structure.md §6): one zip with what a language needs to be read
 * offline on another device — its catalog rows, the receipts that say each resource is complete, its source of truth
 * and, optionally, the artifacts built from it (prepared views, quotes, aligned quotes, article titles).
 *
 * Rows travel exactly as the cache stores them (raw rows, chapter chunks included), so importing them needs no
 * parsing and no rebuild, and every key keeps its stamp: what a newer app version no longer accepts is a miss and is
 * rebuilt from the source of truth, as for any other cache row.
 */

import type { ResourceMetadata } from '@bt-synergy/resource-catalog'

export const PACK_FORMAT = 'bt-synergy-language-pack' as const
export const PACK_FORMAT_VERSION = '1.0.0' as const

/** What a cache row is, for a pack: which layer of §2 it belongs to. */
export type PackLayer = 'receipt' | 'sot' | 'prepared' | 'quote' | 'align' | 'text'

/** The layers a pack carries unless told otherwise: everything that makes it open "already warmed". */
export const ALL_LAYERS: readonly PackLayer[] = ['receipt', 'sot', 'prepared', 'quote', 'align', 'text']

/** Without these the pack cannot be read offline at all (§6, "minimum offline-useful pack"). */
export const REQUIRED_LAYERS: readonly PackLayer[] = ['receipt', 'sot']

/** A row of the cache store as it is kept: its storage key and its entry. */
export type CacheRow = { key: string; entry: unknown }

/** Why a resource is in the pack: it is of the pack's language, or an original language its quotes need. */
export type PackResourceRole = 'language' | 'original'

export type PackManifestResource = {
  /** `{owner}/{language}/{id}`. */
  key: string
  role: PackResourceRole
  /** `resourceContentStamp` of its catalog row when the pack was made. */
  stamp: string
  subject?: string
  title?: string
  /** How many rows of each layer the pack holds for it. */
  rows: Partial<Record<PackLayer, number>>
}

export type PackManifest = {
  format: typeof PACK_FORMAT
  formatVersion: string
  /** The language the pack is for, e.g. `es-419`. */
  language: string
  createdAt: string
  createdBy?: string
  /** The app that made it, for whoever has to tell two packs apart. */
  app?: { name: string; version?: string }
  layers: PackLayer[]
  resources: PackManifestResource[]
}

/** Where a pack is read from when it is made: the cache store and the catalog of an app. */
export interface PackSource {
  /** Raw rows whose keys start with `prefix`, chunks included (`IndexedDBCacheAdapter.getByPrefix`). */
  rowsByPrefix(prefix: string): Promise<CacheRow[]>
  /** The catalog row of a resource, or null when the catalog does not have it. */
  catalogRow(resourceKey: string): Promise<ResourceMetadata | null>
  /** Every catalog row, to find the resources of a language. */
  catalogRows(): Promise<ResourceMetadata[]>
}

/** Where a pack is written when it is opened. */
export interface PackTarget {
  /** Writes rows exactly as given: no splitting, no envelope (`IndexedDBCacheAdapter.putRawMany`). */
  putRows(rows: CacheRow[]): Promise<void>
  /** Keys already in the store among `keys`, to leave them when the import does not overwrite. */
  existingKeys?(keys: string[]): Promise<Set<string>>
  putCatalogRows(rows: Array<{ key: string; metadata: ResourceMetadata }>): Promise<void>
}
