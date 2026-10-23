/**
 * The parts list (spec §3, schema 2): `catalog/<compat>/<language>.json`, written last. It names every part of a
 * language and carries each resource's catalog row and release stamp; a resource is complete on a device when every
 * part the person chose is there, so no receipt travels.
 */

import type { ResourceMetadata } from '@bt-synergy/resource-catalog'
import { catalogPath } from '../catalog'
import type { PackLayer, PackResourceRole, PackVersions } from '../types'
import { PART_LAYERS, VOLATILE_FIELDS, stableJson, toJsonValue } from './partFile'

export type PartKind = 'book' | 'alignments' | 'original' | 'macula' | 'tw' | 'ta' | 'titles' | 'lexicon' | 'obs'

export type PartEntry = {
  sha256: string
  bytes: number
  rows: number
  kind: PartKind
  resource: string
  /** Lowercase. */
  book?: string
  group?: string
  layers: PackLayer[]
}

export type PartsListResource = {
  key: string
  /** `resourceContentStamp` of its catalog row. */
  stamp: string
  role: PackResourceRole
  subject: string
  title: string
  books?: string[]
  /** The resource's catalog row (with `bookBlobs`), without the catalog's own bookkeeping (`LIST_DROPPED_FIELDS`). */
  metadata: unknown
}

export type PartsList = {
  schema: 2
  /** `es-419`, or `originals`. */
  language: string
  compat: string
  versions: PackVersions
  resources: PartsListResource[]
  parts: PartEntry[]
  /** A language's list: the shared originals list its quote and align rows were made against. */
  originals?: { path: string; sha256: string }
}

/**
 * Fields of a catalog row that say when or how often this machine touched it, not what Door43 published: they would
 * give two builds of the same release different lists. `release.published_at` stays (it is in the stamp).
 */
export const LIST_DROPPED_FIELDS: readonly string[] = [
  ...VOLATILE_FIELDS,
  'updatedAt',
  'accessedAt',
  'accessCount',
  'downloadedAt',
  'lastDownload',
  // What this machine downloaded, not what the release holds.
  'downloadStats',
  'downloadedIngredients',
]

const DROPPED = new Set(LIST_DROPPED_FIELDS)

/** A catalog row (or any value) without `LIST_DROPPED_FIELDS`, at any depth: what a list's `metadata` holds. */
export function withoutBookkeeping(input: unknown): unknown {
  const value = toJsonValue(input)
  if (Array.isArray(value)) return value.map(withoutBookkeeping)
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (!DROPPED.has(k)) out[k] = withoutBookkeeping(v)
    }
    return out
  }
  return value
}

export function partsListPath(compat: string, language: string): string {
  return catalogPath(compat, language)
}

const cmp = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0)

/** Stable JSON: parts sorted by (kind, resource, book, group), resources by key, object keys sorted, no dates. */
export function serializePartsList(list: PartsList): string {
  const parts = [...list.parts]
    .map((p) => ({ ...p, layers: [...p.layers].sort((a, b) => PART_LAYERS.indexOf(a) - PART_LAYERS.indexOf(b)) }))
    .sort((a, b) => cmp(a.kind, b.kind) || cmp(a.resource, b.resource) || cmp(a.book ?? '', b.book ?? '') || cmp(a.group ?? '', b.group ?? ''))
  const resources = [...list.resources]
    .map((r) => ({ ...r, ...(r.books ? { books: [...r.books].sort(cmp) } : {}), metadata: withoutBookkeeping(r.metadata) }))
    .sort((a, b) => cmp(a.key, b.key))
  return stableJson({ ...list, resources, parts })
}

/**
 * A list's catalog row as the catalog stores it: puts back the required fields `LIST_DROPPED_FIELDS` left out
 * (`catalogedAt`, the only one `ResourceMetadata` requires), dated `now` (ms), the moment it is imported.
 */
export function restoreCatalogBookkeeping(metadata: unknown, now: number): ResourceMetadata {
  return { ...(metadata as ResourceMetadata), catalogedAt: new Date(now).toISOString() }
}
