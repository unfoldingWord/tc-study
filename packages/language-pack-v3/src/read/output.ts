/**
 * The reader output of format 3 (`spec/tests/README.md`, "Reader output"): what a reader prints for a file, as plain JSON data, so that
 * the TypeScript reader and the Python reader can be compared on every conformance case.
 *
 * - {@link KNOWN} is what this reader understands: the tables and versions of each class, as `readSegment` takes them in `known`.
 * - {@link readerOutput} reads a segment file or a transfer file and gives its output; a file it rejects gives `{ error: code }`.
 * - {@link sortKeys} makes data JSON-able (bytes in lowercase hex, no `undefined`) with the keys of every object sorted by code point,
 *   and {@link canonicalJson} writes that data as the text two readers' outputs are compared by.
 *
 * Which tables depend on an optional table this reader does not know is class knowledge and lives in the views (`bookView`: no `align`,
 * texts without alignment; no `notes` or `links`, no quotes for them). `gen` (phase 3) has no known
 * tables, so a segment of it is `E_TABLE`; `topics` and `numbering` of the maps are optional tables not read yet. No Node module is used.
 */
import { compareCodePoints } from '../codec/columns'
import { CLASS_NAMES, type ClassName, hex, KIND_TRANSFER, readHeader, readSegment, type Segment } from '../codec/container'
import { FormatError } from '../codec/errors'
import { isMap, put } from '../codec/values'
import type { CountRows, Coverage, VerseLists } from '../codec/counts'
import type { CountTable, HelpTable, MapCore, MapPart, ObsHelpTable, TextModel, TopicsCore, TopicsPart, XmapCore, XmapPart, XtopicsCore, XtopicsPart } from '../model'
import { readTransfer } from '../transfer'
import { ART_TABLES, artView } from './art'
import { BOOK_TABLES, bookView } from './book'
import { CATALOG_TABLES, catalogView } from './catalog'
import { ALIGNED_TABLES, alignedView } from './aligned'
import { LEX_TABLES, lexView } from './lex'
import { OBS_TABLES, obsView } from './obs'
import { MAP_TABLES, mapView } from './map'
import { ORIG_TABLES, origView } from './orig'
import { TOPICS_TABLES, topicsView, XTOPICS_TABLES, xtopicsView } from './topics'
import { XMAP_TABLES, xmapView } from './xmap'

/** `value` and everything inside it frozen: a table that is written to would change what every reader of the process accepts. */
function deepFreeze<T>(value: T): T {
  if (typeof value === 'object' && value !== null && !Object.isFrozen(value)) {
    Object.freeze(value)
    for (const item of Object.values(value)) deepFreeze(item)
  }
  return value
}

/**
 * The tables and versions this reader understands, per class. A required table that is not here, or in another version, makes the
 * segment `E_TABLE`; an optional one is skipped, with what depends on it. `gen` is not read: a segment of it gives `E_TABLE`.
 */
export const KNOWN: Record<ClassName, Record<string, number[]>> = deepFreeze({
  book: { ...BOOK_TABLES },
  orig: { ...ORIG_TABLES },
  art: { ...ART_TABLES },
  lex: { ...LEX_TABLES },
  obs: { ...OBS_TABLES },
  catalog: { ...CATALOG_TABLES },
  map: { ...MAP_TABLES },
  xmap: { ...XMAP_TABLES },
  xtopics: { ...XTOPICS_TABLES },
  topics: { ...TOPICS_TABLES },
  aligned: { ...ALIGNED_TABLES },
  gen: {},
})

// JSON data

/** What the output is made of: no `null`, no `undefined`, no byte strings, no `bigint`, and only integers for numbers. */
export type Json = string | number | boolean | Json[] | { [key: string]: Json }

/**
 * The value as plain JSON data:
 *
 * - a byte string is its lowercase hex;
 * - a key whose value is `undefined` is not there (an absent value is an absent key, never `null`);
 * - the keys of every object come out sorted by code point (`compareCodePoints`; the default sort of JavaScript compares UTF-16 code
 *   units, which puts U+1D538 before U+FFFF).
 *
 * Throws `Error` for what JSON cannot hold: `null`, `undefined` in a list, a number that is not a safe integer, a `bigint`. The
 * object gets its keys in order, but an engine lists a key that looks like an array index ("10") before the others whatever the order
 * they were added in: {@link canonicalJson} is the text to compare by.
 */
export function sortKeys(value: unknown): Json {
  if (typeof value === 'string' || typeof value === 'boolean') return value
  if (typeof value === 'number') {
    if (!Number.isSafeInteger(value)) throw new Error(`The number ${value} is not an integer from -2^53 + 1 to 2^53 - 1`)
    return value
  }
  if (value instanceof Uint8Array) return hex(value)
  if (Array.isArray(value)) return value.map((item) => sortKeys(item))
  if (typeof value === 'object' && value !== null) {
    const entries = Object.entries(value).filter(([, item]) => item !== undefined)
    entries.sort(([a], [b]) => compareCodePoints(a, b))
    // `fromEntries` defines every key, a key named "__proto__" included.
    return Object.fromEntries(entries.map(([key, item]): [string, Json] => [key, sortKeys(item)]))
  }
  throw new Error(`The value ${String(value)} is not JSON data`)
}

/** A JSON string literal, as `JSON.stringify` writes it: `"`, `\` and the control characters escaped, every other character as it is. */
const quote = (text: string): string => JSON.stringify(text)

/**
 * The canonical text of an output (`spec/tests/README.md`): JSON without whitespace, the keys of every object sorted by code point
 * whatever order the object lists them in, and non-ASCII characters written as they are (UTF-8). In a string only `"`, `\` and the
 * control characters up to U+001F are escaped (`\b \t \n \f \r` by their short names, the others as `\u00xx` in lowercase hex).
 */
export function canonicalJson(value: unknown): string {
  const data = sortKeys(value)
  const write = (item: Json): string => {
    if (typeof item === 'string') return quote(item)
    if (typeof item === 'number' || typeof item === 'boolean') return String(item)
    if (Array.isArray(item)) return `[${item.map(write).join(',')}]`
    const keys = Object.keys(item).sort(compareCodePoints)
    return `{${keys.map((key) => `${quote(key)}:${write(item[key])}`).join(',')}}`
  }
  return write(data)
}

// The output of each class

/** The attributes of a text's nodes as a list `[event, {name: value}]` in event order, or nothing when no node has any. */
function attrsOf(attrs: Record<number, Record<string, string>> | undefined): [number, Record<string, string>][] | undefined {
  if (attrs === undefined) return undefined
  const list = Object.entries(attrs)
    .map(([event, values]): [number, Record<string, string>] => [Number(event), values])
    .sort((a, b) => a[0] - b[0])
  return list.length > 0 ? list : undefined
}

function textOut(text: TextModel): Record<string, unknown> {
  const { res, pieces, events, align, alignMissing } = text
  return { res, pieces, events, attrs: attrsOf(text.attrs), align, alignMissing }
}

const helpsOut = (table: HelpTable | undefined): unknown => (table === undefined ? undefined : { res: table.res, rows: table.rows })

/** A row of OBS helps: `frame` is the reference text, and `frameId` the number the segment keeps (story × 100 + frame). */
const obsHelpsOut = (table: ObsHelpTable | undefined): unknown =>
  table === undefined
    ? undefined
    : { res: table.res, rows: table.rows.map(({ id, ref, frame, concept, cols }) => ({ id, frame: ref, frameId: frame, concept, cols })) }

/** A coverage as `{source: {whole: [books], partial?: [books]}}`: `partial` is absent when empty. */
const coverageOut = (c: Coverage): Record<string, { whole: string[]; partial?: string[] }> =>
  Object.fromEntries([...c].map(([source, { whole, partial }]) => [source, { whole, partial: partial.length > 0 ? partial : undefined }]))

const rowsOut = (rows: CountRows): Record<string, Record<string, [number, number]>> =>
  Object.fromEntries([...rows].map(([key, books]) => [key, Object.fromEntries(books)]))

/** A counts table as `{unit, rows: {key: {book: [count, verses]}}}`, or nothing when the file has none. */
const countsOut = (table: CountTable | undefined): unknown => (table === undefined ? undefined : { unit: table.unit, rows: rowsOut(table.rows) })

/** Verse lists as `{key: [verse ids]}`, or nothing when the file has none. */
const listsOut = (lists: VerseLists | undefined): unknown => (lists === undefined ? undefined : Object.fromEntries(lists))

function xmapOut(seg: Segment): Record<string, unknown> {
  const m = xmapView(seg)
  if (m.part !== 'core') {
    const p = m as XmapPart
    return { strong: listsOut(p.strong), links: listsOut(p.links), notes: listsOut(p.notes) }
  }
  const c = m as XmapCore
  return {
    coverage: coverageOut(c.coverage),
    strong: countsOut(c.strong),
    concepts: Object.fromEntries(c.concepts),
    links: countsOut(c.links),
    notes: countsOut(c.notes),
    relations: c.relations,
    aliases: c.aliases,
    strongs: c.strongs,
  }
}

function mapOut(seg: Segment): Record<string, unknown> {
  const m = mapView(seg)
  if (m.part !== 'core') return { usage: listsOut((m as MapPart).usage) }
  const c = m as MapCore
  return { books: c.books, names: c.names, subtitles: c.subtitles, coverage: coverageOut(c.coverage), usage: countsOut(c.usage), obs: c.obs }
}

function xtopicsOut(seg: Segment): Record<string, unknown> {
  const m = xtopicsView(seg)
  if (m.part !== 'core') return { occurrences: listsOut((m as XtopicsPart).occurrences) }
  const c = m as XtopicsCore
  return {
    coverage: coverageOut(c.coverage),
    topics: Object.fromEntries(c.topics),
    occurrences: { unit: 'verses', rows: rowsOut(c.occurrences) },
    relations: c.relations,
    strongs: c.strongs,
    ranges: c.ranges,
  }
}

function alignedOut(seg: Segment): Record<string, unknown> {
  const entries: Record<string, unknown> = {}
  for (const [key, byStrong] of alignedView(seg).entries) {
    const strongs: Record<string, unknown> = {}
    for (const [strong, books] of byStrong) put(strongs, strong, Object.fromEntries(books))
    put(entries, key, strongs)
  }
  return { entries }
}

function topicsOut(seg: Segment): Record<string, unknown> {
  const m = topicsView(seg)
  if (m.part !== 'core') return { names: listsOut((m as TopicsPart).names) }
  const c = m as TopicsCore
  return { names: c.names, local: c.local, coverage: coverageOut(c.coverage) }
}

/** What a class adds to `id` and `h`; `E_TABLE` for a class phase 1 does not decode. */
function bodyOut(seg: Segment): Record<string, unknown> {
  switch (seg.h.class) {
    case 'book': {
      const m = bookView(seg)
      return { texts: m.texts.map(textOut), notes: helpsOut(m.notes), questions: helpsOut(m.questions), links: helpsOut(m.links) }
    }
    case 'orig': {
      const m = origView(seg)
      return { words: m.words, pieces: m.pieces, events: m.events, attrs: attrsOf(m.attrs), macula: m.macula }
    }
    case 'art':
      return { articles: artView(seg).articles }
    case 'lex':
      return { entries: lexView(seg).entries }
    case 'obs': {
      const m = obsView(seg)
      return {
        stories: m.stories,
        notes: obsHelpsOut(m.notes),
        questions: obsHelpsOut(m.questions),
        links: obsHelpsOut(m.links),
        'study-notes': obsHelpsOut(m.studyNotes),
        'study-questions': obsHelpsOut(m.studyQuestions),
      }
    }
    case 'catalog': {
      const m = catalogView(seg)
      return { about: m.about, resources: m.resources, segments: m.segments, units: m.units, requires: m.requires, complements: m.complements }
    }
    case 'map':
      return mapOut(seg)
    case 'xmap':
      return xmapOut(seg)
    case 'xtopics':
      return xtopicsOut(seg)
    case 'topics':
      return topicsOut(seg)
    case 'aligned':
      return alignedOut(seg)
    default:
      throw new FormatError('E_TABLE', `the class "${seg.h.class}" is not read by this reader`)
  }
}

/** The tables to read a file with, by the class its header names; none when the header names no class (the body will be `E_BODY`). */
function knownOf(header: Record<string, unknown>): Record<string, number[]> {
  const h = header.h
  const cls = isMap(h) ? h.class : undefined
  return typeof cls === 'string' && (CLASS_NAMES as readonly string[]).includes(cls) ? KNOWN[cls as ClassName] : {}
}

/** The output of a segment file; throws {@link FormatError}. */
async function segmentOutput(bytes: Uint8Array): Promise<Json> {
  const { header } = readHeader(bytes)
  const { seg, id } = await readSegment(bytes, { known: knownOf(header) })
  return sortKeys({ id, h: seg.h, ...bodyOut(seg) })
}

/** The output of a catalog entry of a transfer file: its own header must say class catalog (`readTransfer` has checked it too). */
async function catalogOutput(bytes: Uint8Array): Promise<Json> {
  const { seg, id } = await readSegment(bytes, { known: KNOWN.catalog, expectedClass: 'catalog' })
  const m = catalogView(seg)
  return sortKeys({ id, h: seg.h, about: m.about, resources: m.resources, segments: m.segments, units: m.units, requires: m.requires, complements: m.complements })
}

/** The output of a transfer file; throws {@link FormatError}. */
async function transferOutput(bytes: Uint8Array): Promise<Json> {
  const { index, entries } = await readTransfer(bytes, { known: KNOWN })
  const catalogs: Json[] = []
  for (const id of index.catalogs) {
    const entry = entries.find((candidate) => candidate.id === id)
    // `readTransfer` has rejected the file unless every catalog is whole and verified.
    if (entry === undefined || entry.bytes === undefined) throw new FormatError('E_TRUNCATED', `the catalog ${id} is not in the file`)
    catalogs.push(await catalogOutput(entry.bytes))
  }
  const { mode, base, made, by, extra } = index
  return sortKeys({
    index: { ...extra, mode, catalogs: index.catalogs, base, entries: index.entries, made, by },
    entries: entries.map(({ id, kind, class: cls, status }) => ({ id, kind, class: cls, status })),
    catalogs,
  })
}

/**
 * The reader output of a file (`spec/tests/README.md`, "Reader output"): a segment file (kind 1) or a transfer file (kind 2) read with
 * {@link KNOWN}, as plain JSON data with sorted keys. A file the reader rejects gives `{ error: code }`, the code of `container.md`.
 */
export async function readerOutput(bytes: Uint8Array): Promise<unknown> {
  try {
    const { kind } = readHeader(bytes)
    return kind === KIND_TRANSFER ? await transferOutput(bytes) : await segmentOutput(bytes)
  } catch (error) {
    if (error instanceof FormatError) return { error: error.code }
    throw error
  }
}
