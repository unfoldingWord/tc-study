/**
 * The envelope every query answers with: the data, where each datum comes from (`cites`), the revision of every installed unit the
 * answer read (a book of revision 9 under a map of revision 12 says both), the coverage of what was asked, and the units that
 * would have been needed but are not installed, with their size. No Node module here.
 */
import type { State } from '@bt-synergy/language-pack-v3'
import type { PackReader } from '../reader'

/** `res` is the resource key; `release` its stamp from the segment's `res`. */
export type Cite = { res: string; release: string; id?: string; ref?: string; section?: string }

/** The state of a cell of the map: `State` of language-pack-v3 (`Coverage` there is the map's own type). */
export type CellState = State

export type QueryName = 'passage' | 'concept' | 'article' | 'renderings' | 'search' | 'topics' | 'books' | 'context' | 'lookup'

export type NotInstalled = { book?: string; unit: string; bytes: number; what?: string }

export type Answer<T> = {
  query: QueryName
  data: T | null
  cites: Cite[]
  revision: { lang?: number; common?: number; units: Record<string, number> }
  coverage?: Record<string, CellState>
  notInstalled: NotInstalled[]
}

export function newAnswer<T>(reader: PackReader, query: QueryName): Answer<T> {
  return { query, data: null, cites: [], revision: { ...reader.revisions(), units: {} }, notInstalled: [] }
}

/** Records the revision of a unit the answer read. */
export function usedUnit(a: Answer<unknown>, reader: PackReader, unit: string): void {
  const rev = reader.unitRevision(unit)
  if (rev !== undefined) a.revision.units[unit] = rev
}

/** Adds a unit the answer lacks, once. */
export function missingUnit(a: Answer<unknown>, entry: NotInstalled): void {
  if (!a.notInstalled.some((n) => n.unit === entry.unit)) a.notInstalled.push(entry)
}

/** The release stamp of a resource in a `res` list of a header or a book. */
export function releaseOf(res: readonly (readonly [string, string])[] | undefined, key: string): string {
  return res?.find((r) => r[0] === key)?.[1] ?? ''
}

/** Folds the cites, unit revisions and missing units of `from` into `into`. */
export function absorb(into: Answer<unknown>, from: Answer<unknown>): void {
  for (const c of from.cites) into.cites.push(c)
  Object.assign(into.revision.units, from.revision.units)
  for (const n of from.notInstalled) missingUnit(into, n)
}
