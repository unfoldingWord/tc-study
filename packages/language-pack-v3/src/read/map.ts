/**
 * The reader of a language's map segment (`spec/cddl/map.cddl`): a {@link Segment} that `readSegment` has accepted, back
 * into the core or the part of a book. It rejects the segment with `E_BODY` at the first defect. No Node module is used.
 */
import { ColumnError } from '../codec/columns'
import type { Segment } from '../codec/container'
import { decodeCounts, decodeCoverage, decodeVerseLists } from '../codec/counts'
import { FormatError } from '../codec/errors'
import { hasOwn, isMap, put } from '../codec/values'
import { bookNumber } from '../ids'
import type { BookName, MapCore, MapPart } from '../model'

/** The tables this reader knows, as `readSegment` takes them in `known`. `topics` and `numbering` are not known yet. */
export const MAP_TABLES: Record<string, number[]> = {
  books: [1],
  names: [1],
  subtitles: [1],
  coverage: [1],
  usage: [1],
  obs: [1],
}

const CORE_ONLY = ['books', 'names', 'subtitles', 'coverage', 'obs']
const SOURCES = ['text', 'list', 'none']

function bad(what: string): never {
  throw new FormatError('E_BODY', `the map segment is malformed: ${what}`)
}

function isText(v: unknown): v is string {
  return typeof v === 'string'
}

function readBooks(value: unknown): BookName[] {
  if (!Array.isArray(value) || value.length !== 66) bad('books is not a list of 66 entries')
  return value.map((b, i) => {
    if (!Array.isArray(b) || b.length !== 4 || !b.every(isText)) bad(`books[${i}] is not [name, short, abbreviation, source]`)
    if (!SOURCES.includes(b[3])) bad(`books[${i}] has the source ${JSON.stringify(b[3])}`)
    return [b[0], b[1], b[2], b[3]] as BookName
  })
}

function readCore(seg: Segment): MapCore {
  const { h, t } = seg
  if (h.book !== undefined) bad('a core has a book')
  if (h.res === undefined) bad('the header of a core has no resource (res)')
  for (const key of ['books', 'names', 'coverage']) if (!hasOwn(t, key)) bad(`the table "${key}" is missing`)
  if (!isMap(t.names)) bad('names is not a map')
  const names: Record<string, string[]> = {}
  for (const [k, v] of Object.entries(t.names)) {
    if (!Array.isArray(v) || v.length === 0 || !v.every(isText)) bad(`names[${JSON.stringify(k)}] is not a non-empty list of text`)
    put(names, k, [...v])
  }
  const core: MapCore = {
    lang: h.lang!,
    part: 'core',
    res: h.res.map(([k, s]) => [k, s] as [string, string]),
    books: readBooks(t.books),
    names,
    coverage: decodeCoverage(t.coverage),
  }
  if (hasOwn(t, 'subtitles')) {
    if (!isMap(t.subtitles)) bad('subtitles is not a map')
    const out: Record<string, string> = {}
    for (const [k, v] of Object.entries(t.subtitles)) {
      if (!isText(v)) bad(`subtitles[${JSON.stringify(k)}] is not text`)
      put(out, k, v)
    }
    core.subtitles = out
  }
  if (hasOwn(t, 'usage')) core.usage = { unit: 'notes', rows: decodeCounts(t.usage, 'notes') }
  if (hasOwn(t, 'obs')) {
    if (!Array.isArray(t.obs)) bad('obs is not a list')
    core.obs = t.obs.map((row, i) => {
      if (!Array.isArray(row) || row.length !== 2 || typeof row[0] !== 'number' || !Number.isSafeInteger(row[0]) || row[0] < 0 || !isText(row[1])) {
        bad(`obs[${i}] is not [story, title]`)
      }
      return [row[0], row[1]] as [number, string]
    })
  }
  return core
}

function readPart(seg: Segment, part: string): MapPart {
  const { h, t } = seg
  try {
    bookNumber(part)
  } catch {
    bad(`the part ${JSON.stringify(part)} is not a book code`)
  }
  if (h.book !== undefined && h.book !== part) bad(`the part is ${JSON.stringify(part)} and the book ${JSON.stringify(h.book)}`)
  if (!Array.isArray(h.res) || h.res.length > 0) bad('a part has resources (res), or none is written')
  for (const key of CORE_ONLY) if (hasOwn(t, key)) bad(`the table "${key}" belongs to the core`)
  const out: MapPart = { lang: h.lang!, part }
  if (hasOwn(t, 'usage')) out.usage = decodeVerseLists(part, t.usage)
  return out
}

/**
 * The core or the part a language map segment holds. Throws {@link FormatError} `E_BODY` when the segment is not a map
 * segment or a table is not what `map.cddl` says.
 */
export function mapView(seg: Segment): MapCore | MapPart {
  if (seg.h.class !== 'map') bad(`the class is "${seg.h.class}"`)
  if (seg.h.part === undefined) bad('the header has no part')
  if (typeof seg.h.lang !== 'string' || seg.h.lang === '') bad('the header has no lang')
  try {
    return seg.h.part === 'core' ? readCore(seg) : readPart(seg, seg.h.part)
  } catch (error) {
    if (error instanceof ColumnError) bad(error.message)
    throw error
  }
}
