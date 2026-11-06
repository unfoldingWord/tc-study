/**
 * Installed state: which catalog revision is published, which one each catalog's active units came from, and the active units
 * themselves. Pure types and helpers; the store only keeps the value (`store/types.ts`).
 */
import type { SegmentEntry } from '@bt-synergy/language-pack-v3'
import type { VerifiedCatalog } from './verify'

export type InstalledCatalog = { name: string; publisher: string; revision: number; id: string; origin: 'published' | 'local'; etag?: string }

/** `segments` are segment ids (hex); `needs` are qualified unit keys (`<catalog>/<unit>`). */
export type InstalledUnit = { catalog: string; revision: number; catalogId: string; segments: string[]; needs: string[]; optional?: true }

/** Units are keyed `<catalog name>/<unit id>`, so several languages share a device. */
export type InstalledState = {
  v: 1
  /** The newest verified catalog known, by catalog name. */
  published: Record<string, InstalledCatalog>
  /** The catalog each catalog's active units came from. */
  active: Record<string, InstalledCatalog>
  units: Record<string, InstalledUnit>
}

export function emptyState(): InstalledState {
  return { v: 1, published: {}, active: {}, units: {} }
}

export function hex(bytes: Uint8Array): string {
  let s = ''
  for (const b of bytes) s += b.toString(16).padStart(2, '0')
  return s
}

/** `etag` is kept from `known` (an entry of the same catalog file) when it has one: it belongs to the file, not to where it is listed. */
export function installedOf(c: VerifiedCatalog, ...known: (InstalledCatalog | undefined)[]): InstalledCatalog {
  const etag = known.find((k) => k?.id === c.id && k.etag !== undefined)?.etag
  return { name: c.name, publisher: c.publisher, revision: c.revision, id: c.id, origin: c.origin, ...(etag !== undefined ? { etag } : {}) }
}

export function segmentOf(c: VerifiedCatalog, index: number): SegmentEntry {
  const s = c.catalog.segments[index]
  if (s === undefined) throw new RangeError(`catalog ${c.name} has no segment ${index}`)
  return s
}

/**
 * Resolves a `needs` entry of `catalog`: the unit in its own catalog if it lists it, else in a catalog it `requires`; otherwise it
 * stays `<own>/<unit>` (and the planner reports it as unsatisfiable).
 */
export function qualify(catalogs: VerifiedCatalog[], catalog: string, unit: string): string {
  const own = catalogs.find((c) => c.name === catalog)
  if (own === undefined || own.catalog.units.some((u) => u.id === unit)) return `${catalog}/${unit}`
  for (const [name] of own.catalog.requires ?? []) {
    const other = catalogs.find((c) => c.name === name)
    if (other?.catalog.units.some((u) => u.id === unit)) return `${name}/${unit}`
  }
  return `${catalog}/${unit}`
}
