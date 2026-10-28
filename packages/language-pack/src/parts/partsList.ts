/**
 * The parts list (spec §3, schema 2): `catalog/<compat>/<language>.json`, written last. It names every part of a
 * language and carries each resource's catalog row and release stamp; a resource is complete on a device when every
 * part the person chose is there, so no receipt travels.
 */

import type { ResourceMetadata } from '@bt-synergy/resource-catalog'
import { catalogPath } from '../catalog'
import type { PackLayer, PackResourceRole, PackVersions } from '../types'
import { PART_LAYERS, VOLATILE_FIELDS, stableJson, toJsonValue } from './partFile'

export type PartKind = 'book' | 'alignments' | 'original' | 'macula' | 'tw' | 'ta' | 'titles' | 'lexicon' | 'obs' | 'index'

/** The kinds this reader can place; a list entry of any other kind is skipped (`planParts`), not applied. */
export const KNOWN_PART_KINDS: ReadonlySet<PartKind> = new Set<PartKind>([
  'book', 'alignments', 'original', 'macula', 'tw', 'ta', 'titles', 'lexicon', 'obs', 'index',
])

export type PartEntry = {
  sha256: string
  bytes: number
  rows: number
  kind: PartKind
  resource: string
  /** Lowercase. */
  book?: string
  group?: string
  /** `fingerprintOf` its inputs: what the next build compares to carry it. */
  fingerprint: string
  layers: PackLayer[]
}

/** A unit (`shared`, `book <b>`) and the fingerprint of everything it is built from. */
export type PartsUnit = { id: string; fingerprint: string }

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
  /**
   * The code its parts were built and fingerprinted with: the compat key and a hash of every row-producing code version
   * (resource-pipeline `partsCode`). A reader recomputes fingerprints with it; a previous list of another code is not
   * reused.
   */
  code: string
  versions: PackVersions
  resources: PartsListResource[]
  parts: PartEntry[]
  /**
   * A language's list: the originals list its quote and align rows were made against, at its content address
   * (`originalsListPath`), which another language's run cannot overwrite.
   */
  originals?: { path: string; sha256: string }
  /** A language's list: every unit built or carried, so the next build can tell which changed. */
  units?: PartsUnit[]
  /**
   * Language list only: the stamp of every resource the build read, the originals, lexicons and MACULA included, by
   * key (`resourceContentStamp` of a catalog row, `lexiconStampOf`, MACULA's `<sha10>#<date>`). The Worker compares
   * them with what Door43 and GitHub have now, and asks for a build when one moved; it covers resources that got no
   * part, which `resources` does not list.
   */
  stamps?: Record<string, string>
}

export const SHARED_UNIT = 'shared'
export const bookUnit = (book: string) => `book ${book}`

export const BOOK_KINDS: ReadonlySet<PartKind> = new Set(['book', 'alignments', 'original'])

/** `book <b>` for a book's own parts; `shared` for the rest (MACULA is sliced by book but built with the shared). */
export function unitOfPart(part: Pick<PartEntry, 'kind' | 'book'>): string {
  if (!BOOK_KINDS.has(part.kind)) return SHARED_UNIT
  if (!part.book) throw new Error(`A ${part.kind} part names no book`)
  return bookUnit(part.book)
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
  // Whether this machine has it: the TW and TA loaders mark a resource offline once downloaded whole, a book's download
  // does not, so a build that carries a unit (downloads nothing of it) would give another list.
  'availability',
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

/** The originals list as a language list names it: by its sha256, never overwritten. `originals.json` is the latest. */
export function originalsListPath(compat: string, sha256: string): string {
  return `catalog/${compat}/originals/${sha256}.json`
}

const cmp = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0)

/** Stable JSON: parts sorted by (kind, resource, book, group), resources by key, units by id, keys sorted, no dates. */
export function serializePartsList(list: PartsList): string {
  const parts = [...list.parts]
    .map((p) => ({ ...p, layers: [...p.layers].sort((a, b) => PART_LAYERS.indexOf(a) - PART_LAYERS.indexOf(b)) }))
    .sort((a, b) => cmp(a.kind, b.kind) || cmp(a.resource, b.resource) || cmp(a.book ?? '', b.book ?? '') || cmp(a.group ?? '', b.group ?? ''))
  const resources = [...list.resources]
    .map((r) => ({ ...r, ...(r.books ? { books: [...r.books].sort(cmp) } : {}), metadata: withoutBookkeeping(r.metadata) }))
    .sort((a, b) => cmp(a.key, b.key))
  const units = list.units ? [...list.units].sort((a, b) => cmp(a.id, b.id)) : undefined
  return stableJson({ ...list, resources, parts, units })
}

/**
 * A list's catalog row as the catalog stores it: puts back the required fields `LIST_DROPPED_FIELDS` left out
 * (`catalogedAt`, dated `now` (ms), the moment it is imported; `availability`, online and nothing of it on the device
 * yet, since its parts are not).
 */
export function restoreCatalogBookkeeping(metadata: unknown, now: number): ResourceMetadata {
  return {
    ...(metadata as ResourceMetadata),
    catalogedAt: new Date(now).toISOString(),
    availability: { online: true, offline: false, bundled: false, partial: false },
  }
}
