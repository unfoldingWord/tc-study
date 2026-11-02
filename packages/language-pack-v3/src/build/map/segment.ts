/**
 * The segment of a language's map (`spec/cddl/map.cddl`): the core (book names, concept names, coverage, usage counts) or the
 * part of one book (the verses behind the usage). The reader is `read/map.ts`. No Node module is used.
 */
import type { CborValue } from '../../codec/cbor'
import { compareCodePoints } from '../../codec/columns'
import type { Segment } from '../../codec/container'
import { encodeCounts, encodeCoverage, encodeVerseLists } from '../../codec/counts'
import type { MapCore, MapPart } from '../../model'

type Built = { tables: Record<string, [number, boolean]>; t: Record<string, CborValue> }

function sortedRecord<T>(r: Record<string, T>): Record<string, T> {
  const out: Record<string, T> = {}
  for (const key of Object.keys(r).sort(compareCodePoints)) out[key] = r[key]
  return out
}

function coreTables(m: MapCore): Built {
  if (m.res.length === 0) throw new Error('A core needs at least one resource (res)')
  if (m.books.length !== 66) throw new Error(`books has ${m.books.length} entries, not 66`)
  const tables: Built['tables'] = { books: [1, true], names: [1, true], coverage: [1, true] }
  const names: Record<string, string[]> = {}
  for (const [k, v] of Object.entries(sortedRecord(m.names))) {
    if (v.length === 0) throw new Error(`names of ${JSON.stringify(k)} is empty`)
    names[k] = [...v]
  }
  const t: Built['t'] = {
    books: m.books.map((b) => [...b]),
    names,
    coverage: encodeCoverage(m.coverage),
  }
  if (m.subtitles !== undefined) {
    tables.subtitles = [1, false]
    t.subtitles = sortedRecord(m.subtitles)
  }
  if (m.usage !== undefined) {
    if (m.usage.unit !== 'notes') throw new Error(`usage has the unit ${JSON.stringify(m.usage.unit)}, not "notes"`)
    tables.usage = [1, false]
    t.usage = encodeCounts('notes', m.usage.rows)
  }
  if (m.obs !== undefined) {
    tables.obs = [1, false]
    t.obs = m.obs.map(([n, title]) => [n, title])
  }
  return { tables, t }
}

/** The segment of a core or of a book's part, the same bytes for the same model. Throws on an inconsistent model. */
export function mapSegment(m: MapCore | MapPart): Segment {
  if (m.part === 'core') {
    const core = m as MapCore
    const { tables, t } = coreTables(core)
    return { h: { class: 'map', v: 1, tables, lang: core.lang, part: 'core', res: core.res.map(([k, s]) => [k, s]) }, t }
  }
  const tables: Built['tables'] = {}
  const t: Built['t'] = {}
  if ((m as MapPart).usage !== undefined) {
    tables.usage = [1, false]
    t.usage = encodeVerseLists(m.part, (m as MapPart).usage!)
  }
  return { h: { class: 'map', v: 1, tables, lang: m.lang, part: m.part, book: m.part, res: [] }, t }
}
