/**
 * The reader of the catalog segment (`spec/cddl/catalog.cddl`): a {@link Segment} that `readSegment` has accepted, back into the
 * catalog, the output the conformance cases expect (`tests/README.md`, "Reader output"; ids are bytes here and hex in that output).
 *
 * It checks the tables against the schema and rejects the segment with `E_BODY` at the first defect: a value of the wrong type,
 * a format that is not `3.0`, an origin other than `published` and `local`, an id that is not 32 bytes, a book set that is not 9
 * bytes, a unit that names a segment the catalog does not list, a segment or a unit twice, a header `lang` that does not agree
 * with `about.catalog`. It does not check the signatures (`catalog.md`; they are in the file header, and phase 3). It imports no
 * builder code and no Node module.
 */
import { CLASS_NAMES, hex, type Segment } from '../codec/container'
import { FormatError } from '../codec/errors'
import { type CborMap, hasOwn, isMap, isUint } from '../codec/values'
import type { About, CatalogModel, CatalogResource, Complement, SegmentEntry, Unit } from '../model'

function bad(what: string): never {
  throw new FormatError('E_BODY', `the catalog is malformed: ${what}`)
}


function map(value: unknown, what: string): CborMap {
  if (!isMap(value)) bad(`${what} is not a map`)
  return value
}

function list(value: unknown, what: string): unknown[] {
  if (!Array.isArray(value)) bad(`${what} is not a list`)
  return value
}

function text(value: unknown, what: string): string {
  if (typeof value !== 'string') bad(`${what} is not text`)
  return value
}

function uint(value: unknown, what: string): number {
  if (!isUint(value)) bad(`${what} is not an integer from 0 to 2^53 - 1`)
  return value
}

/** A copy of a byte string of exactly `length` bytes. */
function bytes(value: unknown, length: number, what: string): Uint8Array {
  if (!(value instanceof Uint8Array) || value.length !== length) bad(`${what} is not ${length} bytes`)
  return value.slice()
}

/** A key of a map that may be missing: `undefined` when it is, else the value, which has to be text. */
function optionalText(fields: CborMap, key: string, what: string): string | undefined {
  return hasOwn(fields, key) ? text(fields[key], `${what}.${key}`) : undefined
}

const BOOK_CODE = /^[0-9a-z]{3}$/

function readAbout(value: unknown): About {
  const fields = map(value, 'about')
  if (fields.format !== '3.0') bad(`about.format is ${JSON.stringify(fields.format)}, not "3.0"`)
  if (fields.origin !== 'published' && fields.origin !== 'local') bad(`about.origin is ${JSON.stringify(fields.origin)}, not "published" or "local"`)
  const about: About = {
    format: '3.0',
    catalog: text(fields.catalog, 'about.catalog'),
    publisher: text(fields.publisher, 'about.publisher'),
    origin: fields.origin,
    revision: uint(fields.revision, 'about.revision'),
    built: text(fields.built, 'about.built'),
    builder: text(fields.builder, 'about.builder'),
  }
  if (hasOwn(fields, 'previous')) about.previous = bytes(fields.previous, 32, 'about.previous')
  const name = optionalText(fields, 'name', 'about')
  if (name !== undefined) about.name = name
  if (hasOwn(fields, 'direction')) {
    if (fields.direction !== 'ltr' && fields.direction !== 'rtl') bad(`about.direction is ${JSON.stringify(fields.direction)}, not "ltr" or "rtl"`)
    about.direction = fields.direction
  }
  return about
}

function readResource(value: unknown, i: number): CatalogResource {
  const what = `resources[${i}]`
  const fields = map(value, what)
  const resource: CatalogResource = {
    key: text(fields.key, `${what}.key`),
    title: text(fields.title, `${what}.title`),
    subject: text(fields.subject, `${what}.subject`),
    release: text(fields.release, `${what}.release`),
    license: text(fields.license, `${what}.license`),
    books: bytes(fields.books, 9, `${what}.books`),
  }
  const rights = optionalText(fields, 'rights', what)
  if (rights !== undefined) resource.rights = rights
  const attribution = optionalText(fields, 'attribution', what)
  if (attribution !== undefined) resource.attribution = attribution
  return resource
}

function readSegmentEntry(value: unknown, i: number): SegmentEntry {
  const what = `segments[${i}]`
  const fields = map(value, what)
  const cls = text(fields.class, `${what}.class`)
  if (!(CLASS_NAMES as readonly string[]).includes(cls)) bad(`${what}.class is ${JSON.stringify(cls)}, which is not a class`)
  const entry: SegmentEntry = {
    id: bytes(fields.id, 32, `${what}.id`),
    class: cls,
    size: uint(fields.size, `${what}.size`),
    ulen: uint(fields.ulen, `${what}.ulen`),
    inputs: bytes(fields.inputs, 32, `${what}.inputs`),
  }
  const book = optionalText(fields, 'book', what)
  if (book !== undefined) {
    if (!BOOK_CODE.test(book)) bad(`${what}.book is ${JSON.stringify(book)}, which is not a book code`)
    entry.book = book
  }
  const part = optionalText(fields, 'part', what)
  if (part !== undefined) {
    if (part !== 'core' && !BOOK_CODE.test(part)) bad(`${what}.part is ${JSON.stringify(part)}, which is not "core" or a book code`)
    entry.part = part
  }
  const group = optionalText(fields, 'group', what)
  if (group !== undefined) entry.group = group
  return entry
}

function readUnit(value: unknown, i: number, segmentCount: number): Unit {
  const what = `units[${i}]`
  const fields = map(value, what)
  const id = text(fields.id, `${what}.id`)
  if (id === '') bad(`${what}.id is empty`)
  const indexes = list(fields.segments, `${what}.segments`)
  if (indexes.length === 0) bad(`${what}.segments has no segment`)
  const segments = indexes.map((index, n) => {
    if (!isUint(index) || index >= segmentCount) bad(`${what}.segments[${n}] is ${String(index)}, and the catalog lists ${segmentCount} segments`)
    return index
  })
  const unit: Unit = { id, segments }
  if (hasOwn(fields, 'needs')) {
    const needs = list(fields.needs, `${what}.needs`)
    if (!needs.every((item) => typeof item === 'string')) bad(`${what}.needs is not a list of text`)
    unit.needs = [...(needs as string[])]
  }
  if (hasOwn(fields, 'optional')) {
    if (fields.optional !== true) bad(`${what}.optional is not true`)
    unit.optional = true
  }
  if (id.startsWith('aligned:') !== (unit.optional === true)) bad(`${what} (${JSON.stringify(id)}): the aligned units are optional, and no other unit is`)
  return unit
}

function readRequire(value: unknown, i: number): [string, number, Uint8Array] {
  const what = `requires[${i}]`
  const row = list(value, what)
  if (row.length !== 3) bad(`${what} is not [catalog, revision, id]`)
  return [text(row[0], `${what}[0]`), uint(row[1], `${what}[1]`), bytes(row[2], 32, `${what}[2]`)]
}

function readComplement(value: unknown, i: number): Complement {
  const what = `complements[${i}]`
  const fields = map(value, what)
  const complement: Complement = {
    kind: text(fields.kind, `${what}.kind`),
    id: bytes(fields.id, 32, `${what}.id`),
    size: uint(fields.size, `${what}.size`),
    media: text(fields.media, `${what}.media`),
    version: text(fields.version, `${what}.version`),
  }
  for (const key of ['lang', 'for', 'license'] as const) {
    const item = optionalText(fields, key, what)
    if (item !== undefined) complement[key] = item
  }
  return complement
}

/** The tables this reader knows, as `readSegment` takes them in `known`. */
export const CATALOG_TABLES: Readonly<Record<string, number[]>> = {
  about: [1],
  resources: [1],
  segments: [1],
  units: [1],
  requires: [1],
  complements: [1],
}

/**
 * The catalog a segment of class `catalog` holds: the tables as the schema has them, with the ids as bytes (copies, so changing
 * the model does not change the segment). Rows keep the order of the segment.
 *
 * Throws {@link FormatError} `E_BODY` when the segment is not a catalog or its tables are not what `catalog.cddl` says.
 */
export function catalogView(seg: Segment): CatalogModel {
  const { h, t } = seg
  if (h.class !== 'catalog') bad(`the class is "${h.class}"`)
  for (const name of ['about', 'resources', 'segments', 'units']) {
    if (!hasOwn(t, name)) bad(`the table "${name}" is missing`)
  }
  const about = readAbout(t.about)
  if (about.catalog === 'common') {
    if (h.lang !== undefined) bad(`the header has the lang ${JSON.stringify(h.lang)}, and the common catalog has none`)
  } else if (h.lang !== about.catalog) {
    bad(`the header lang is ${JSON.stringify(h.lang)}, and about.catalog is ${JSON.stringify(about.catalog)}`)
  }

  const resources = list(t.resources, 'the table "resources"').map(readResource)
  const keys = new Set<string>()
  for (const resource of resources) {
    if (keys.has(resource.key)) bad(`the resource ${JSON.stringify(resource.key)} is listed twice`)
    keys.add(resource.key)
  }

  const segments = list(t.segments, 'the table "segments"').map(readSegmentEntry)
  const ids = new Set<string>()
  for (const entry of segments) {
    const id = hex(entry.id)
    if (ids.has(id)) bad(`the segment ${id} is listed twice`)
    ids.add(id)
  }

  const units = list(t.units, 'the table "units"').map((value, i) => readUnit(value, i, segments.length))
  const unitIds = new Set<string>()
  for (const unit of units) {
    if (unitIds.has(unit.id)) bad(`the unit ${JSON.stringify(unit.id)} is listed twice`)
    unitIds.add(unit.id)
  }

  const catalog: CatalogModel = { about, resources, segments, units }
  if (h.lang !== undefined) catalog.lang = h.lang
  if (hasOwn(t, 'requires')) catalog.requires = list(t.requires, 'the table "requires"').map(readRequire)
  if (hasOwn(t, 'complements')) catalog.complements = list(t.complements, 'the table "complements"').map(readComplement)
  return catalog
}
