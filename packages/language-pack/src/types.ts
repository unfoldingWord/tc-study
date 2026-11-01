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
/** 1.1: `kind`, `books` and `requires`, so originals and books travel in packs of their own. */
export const PACK_FORMAT_VERSION = '1.1.0' as const
/**
 * The format of a parts list and its parts (schema 2, `parts/`), used only in their compat key. Whole packs stay at
 * 1.1: deployed apps refuse a whole pack of major 2, and the f1.1 lists stay until every app has moved (spec §3).
 */
export const PARTS_FORMAT_VERSION = '2.0.0' as const

/**
 * What a pack holds:
 * - `language`: every resource of a language, whole, with its receipts. The originals go in a pack of their own.
 * - `originals`: UGNT and/or UHB, whole: the same for every language.
 * - `base`: what a language needs whatever the book: catalog rows of all its resources, and the resources that are not
 *   about one book (TA, TW, OBS and their helps) whole. Book-scoped resources bring only their catalog row and which
 *   books exist, so an app can offer the book packs.
 * - `book`: the rows of one or more books of the book-scoped resources (scripture, notes, questions, word links), with
 *   no receipts: a receipt says a whole release is complete, and a book is not the whole release.
 * A 1.0 pack has no kind: it is a `language` pack that may carry the originals too.
 */
export type PackKind = 'language' | 'originals' | 'base' | 'book'

/** An original-language release that the quotes and aligned quotes of a pack were built against. */
export type PackRequirement = {
  /** `unfoldingWord/el-x-koine/ugnt` or `unfoldingWord/hbo/uhb`. */
  key: string
  /** `resourceContentStamp` of the original's catalog row (`{tag}#{published_at}`). */
  stamp: string
}

/** What a cache row is, for a pack: which layer of §2 it belongs to. */
export type PackLayer = 'receipt' | 'sot' | 'prepared' | 'quote' | 'align' | 'text' | 'index'

/**
 * Layers a reader may go without: a part or a pack's layer of one is used only when the app states that layer's
 * versions and they are the list's or the pack's (`readsLayer`); otherwise it is skipped and everything else is
 * applied (parts `planParts`, packs `importLanguagePack`).
 */
export const OPTIONAL_LAYERS: readonly PackLayer[] = ['index']

/**
 * Whether an app with versions `mine` reads `layer` as made with versions `theirs`: it states that layer's versions,
 * and `theirs` has each of them, the same as text. The rule for an optional layer, in parts and in packs alike.
 */
export function readsLayer(layer: PackLayer, mine: PackVersions | undefined, theirs: PackVersions | undefined): boolean {
  const a = mine?.[layer]
  const b = theirs?.[layer]
  if (!a || !b || Object.keys(a).length === 0) return false
  return Object.keys(a).every((name) => name in b && String(b[name]) === String(a[name]))
}

/** The layers a pack carries unless told otherwise: everything that makes it open "already warmed". */
export const ALL_LAYERS: readonly PackLayer[] = ['receipt', 'sot', 'prepared', 'quote', 'align', 'text', 'index']

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
  /** Book-scoped resources: the books the store had for it (lowercase), whether or not this pack carries them. */
  books?: string[]
}

export type PackManifest = {
  format: typeof PACK_FORMAT
  formatVersion: string
  /** The language the pack is for, e.g. `es-419`. */
  language: string
  /** Absent in 1.0 packs, which are `language` packs. */
  kind?: PackKind
  /** `book` packs: the books they bring (lowercase). */
  books?: string[]
  /** The original-language releases its quotes and aligned quotes need; the device must have the same ones. */
  requires?: PackRequirement[]
  createdAt: string
  createdBy?: string
  /** The app that made it, for whoever has to tell two packs apart. */
  app?: { name: string; version?: string }
  layers: PackLayer[]
  /**
   * The processing versions of the app that made the pack, by layer (e.g. `sot: { usjProcessing: '2.2.0-usj' }`,
   * `quote: { helpsQuote: 5 }`). An app with other source versions would throw the rows away, so it refuses the pack;
   * with other derived versions it skips those layers and rebuilds them.
   */
  versions?: PackVersions
  resources: PackManifestResource[]
}

export type PackVersions = Partial<Record<PackLayer, Record<string, string | number>>>

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
  /** The catalog row the device already has for a resource, to compare its version with the pack's. */
  catalogRow?(resourceKey: string): Promise<ResourceMetadata | null>
  /**
   * Read keys and key prefixes, decide, then put and delete, all in one readwrite transaction
   * (`IndexedDBCacheAdapter.transactRaw`): applying parts needs it, so the store holds a unit's rows all as before or
   * all as after, and a read made in one transaction sees one or the other. A reader whose reads span transactions (one
   * per `get`) can still read one row before a unit and the next after it. `decide` runs synchronously; if it throws or
   * a write fails, nothing is written and the call rejects with that error (a full disk keeps its name,
   * `QuotaExceededError`). Puts are raw and go before the deletes; deletes are exact keys.
   */
  transactRaw?(read: RawRead, decide: (found: RawFound) => RawWrite): Promise<void>
}

/** What a `transactRaw` reads: rows by exact key, and the keys under each prefix. */
export type RawRead = { keys: string[]; prefixes: string[] }
/** `rows`: key to the stored entry (absent keys are missing); `prefixKeys`: prefix to the keys that start with it. */
export type RawFound = { rows: Map<string, unknown>; prefixKeys: Map<string, string[]> }
/** What a `transactRaw` writes. */
export type RawWrite = { puts: CacheRow[]; deletes: string[] }
