/**
 * The Bible-text patch catalog of yaapi.bible (`spec/catalog.md`, "Patch catalogs"): `{lang}-x-yaapi`, `book` segments that carry unaligned texts of the
 * books the base language has no text of. No Node module is used.
 *
 * - A book is built only where the base has no text at all (`baseTextBooks`), with one text per version of the list that has the book complete, in the
 *   order of the list. A text is never mixed from two versions. The first text is the default.
 * - A version's book is complete when every verse of the original (`origVerses`, `"chapter:verse"` as the `orig` segment numbers them) is in it and it has
 *   no other. A book that is not complete is left out of that version, with a line in the report.
 * - The text is not edited. {@link plainText} turns the verses into pieces and events; the pieces joined are the verses joined by one space, none added where the text already has white space at the join.
 * - Provenance is on the `resources` entry of each version (`yaapi/{lang}/{ABBR}`): its release is the pinned snapshot, the license is the one a person
 *   checked by hand (`YaapiVersionInfo`), `review` is left out.
 */
import { bookNumber, bookSet } from '../ids'
import type { About, Audience, BookModel, CatalogResource, Event, Piece, Style, TextModel } from '../model'
import { bookSegment } from './book'
import { type BuiltSegment, buildCatalog, builtSegment, needsOfBook } from './catalog'
import { BUILDER, inputsOf } from './language'

/** The licenses a patch accepts (never ND or NC). */
export const OPEN_LICENSES: readonly string[] = ['CC-BY-4.0', 'CC-BY-SA-4.0', 'CC0-1.0', 'LicenseRef-PD']

/** What yaapi's `license` field must say for each accepted license. */
const FIELD: Record<string, string> = { 'CC-BY-4.0': 'CCBY', 'CC-BY-SA-4.0': 'CCBYSA', 'CC0-1.0': 'CC0', 'LicenseRef-PD': 'PD' }

export type YaapiVersionInfo = {
  abbr: string
  /** From `list_versions`, as read the day of the snapshot. */
  name: string
  copyright: string
  link: string
  /** yaapi's own `license` field (`CCBY`). */
  field: string
  /** The SPDX license a person checked by hand, from `yaapi-versions.json`, and the address of its text. */
  license: string
  licenseUrl: string
  /** Extra credit the publisher's license asks for, appended to the attribution (`yaapi-versions.json`, `notice`). */
  notice?: string
  /** Who the text is for and how it renders its source, decided by a person (`yaapi-versions.json`); every yaapi text is labelled. */
  audience: Audience
  style: Style
  /** The pin: `{ABBR}@sha256:{12 hex}` of the snapshot file. */
  release: string
  verses: ReadonlyMap<string, { chapter: number; verse: number; text: string }[]>
}

export type YaapiPatchInput = {
  /** The base language (`es-419`). */
  lang: string
  /** In the order of preference. */
  versions: YaapiVersionInfo[]
  /** Books the base language has some text of. */
  baseTextBooks: ReadonlySet<string>
  /** `[key, stamp]` of the common catalog's `orig:{book}`, and the verses of each original, `"chapter:verse"`. */
  origs: ReadonlyMap<string, [string, string]>
  origVerses: ReadonlyMap<string, ReadonlySet<string>>
  common: { revision: number; id: string }
  books?: readonly string[]
  about: { revision: number; built: string; publisher: string; previous?: Uint8Array }
}

export type YaapiPatchBuild = {
  catalog: BuiltSegment
  segments: BuiltSegment[]
  resources: CatalogResource[]
  /** Books built by version. */
  built: Record<string, string[]>
  report: string[]
}

const WORD = /[\p{L}\p{M}\p{N}‌‍]+(?:['’ʼ\-·][\p{L}\p{M}\p{N}‌‍]+)*/gu

/** The pieces of a verse's text: words, and what lies between them. Joined they give the text. */
export function pieces(text: string): Piece[] {
  const out: Piece[] = []
  let at = 0
  for (const m of text.matchAll(WORD)) {
    if (m.index! > at) out.push([text.slice(at, m.index!), false])
    out.push([m[0], true])
    at = m.index! + m[0].length
  }
  if (at < text.length) out.push([text.slice(at), false])
  return out
}

/** A text from verses in order: for each chapter `chapter`, `open para:p`, `verse` and the pieces of each verse, `close`. */
export function plainText(res: string, verses: readonly { chapter: number; verse: number; text: string }[]): TextModel {
  const ps: Piece[] = []
  const events: Event[] = []
  let chapter = -1
  for (const v of verses) {
    if (v.chapter !== chapter) {
      if (chapter !== -1) {
        events.push([ps.length, 'close', ''])
        ps.push([' ', false])
      }
      chapter = v.chapter
      events.push([ps.length, 'chapter', String(v.chapter)], [ps.length, 'open', 'para:p'])
    } else if (!/\s$/.test(ps[ps.length - 1]?.[0] ?? '') && !/^\s/.test(v.text)) ps.push([' ', false])
    events.push([ps.length, 'verse', String(v.verse)])
    ps.push(...pieces(v.text))
  }
  if (chapter !== -1) events.push([ps.length, 'close', ''])
  return { res, pieces: ps, events }
}

/** Verses that carry a cross reference inside the text, like `(Heb. 1:10, Heb. 11:3)`: counted and reported, never removed. */
const CROSS_REF = /\([^()]*\d+:\d+[^()]*\)\s*$/

const canon = (books: Iterable<string>): string[] => [...new Set(books)].sort((a, b) => bookNumber(a) - bookNumber(b))

export async function buildYaapiPatch(o: YaapiPatchInput): Promise<YaapiPatchBuild> {
  const source = 'yaapi'
  const catalogName = `${o.lang}-x-${source}`
  const report: string[] = []
  for (const v of o.versions) {
    if (!OPEN_LICENSES.includes(v.license)) throw new Error(`${v.abbr}: the license ${JSON.stringify(v.license)} is not one of ${OPEN_LICENSES.join(', ')}`)
    if (v.field !== FIELD[v.license]) throw new Error(`${v.abbr}: yaapi's license field says ${JSON.stringify(v.field)} and the list says ${v.license}: a contradiction is not built`)
    if (v.audience === undefined || v.style === undefined) throw new Error(`${v.abbr}: audience and style are required for a yaapi version`)
    if (v.copyright.trim() === '') throw new Error(`${v.abbr}: yaapi gives no copyright text`)
  }
  const wanted = o.books === undefined ? undefined : new Set(o.books)
  const candidates = canon(o.versions.flatMap((v) => [...v.verses.keys()]))
  const built: Record<string, string[]> = Object.fromEntries(o.versions.map((v) => [v.abbr, []]))
  const segments: BuiltSegment[] = []
  const key = (v: YaapiVersionInfo): string => `${source}/${o.lang}/${v.abbr}`

  for (const book of candidates) {
    if (wanted !== undefined && !wanted.has(book)) continue
    if (o.baseTextBooks.has(book)) {
      report.push(`book ${book}: left out, the base language has text of it`)
      continue
    }
    const orig = o.origs.get(book)
    const want = o.origVerses.get(book)
    if (orig === undefined || want === undefined) {
      report.push(`book ${book}: the common catalog has no orig:${book}, so the book is left out`)
      continue
    }
    const res: [string, string][] = []
    const texts: TextModel[] = []
    const rowKeys: { layer: string; key: string }[] = []
    const stamps: { key: string; stamp: string }[] = [{ key: orig[0], stamp: orig[1] }]
    for (const v of o.versions) {
      const rows = v.verses.get(book)
      if (rows === undefined || rows.length === 0) {
        report.push(`book ${book} ${v.abbr}: the version has no such book`)
        continue
      }
      const have = new Set(rows.map((r) => `${r.chapter}:${r.verse}`))
      const missing = [...want].filter((x) => !have.has(x))
      const extra = [...have].filter((x) => !want.has(x))
      if (have.size !== rows.length) {
        report.push(`book ${book} ${v.abbr}: left out, a verse is repeated`)
        continue
      }
      if (missing.length > 0 || extra.length > 0) {
        report.push(`book ${book} ${v.abbr}: left out, ${missing.length} verses of the original missing (${missing.slice(0, 5).join(' ')}), ${extra.length} not in the original (${extra.slice(0, 5).join(' ')})`)
        continue
      }
      const crossRefs = rows.filter((r) => CROSS_REF.test(r.text)).length
      if (crossRefs > 0) report.push(`book ${book} ${v.abbr}: ${crossRefs} verses end with a cross reference inside the text (kept)`)
      const sorted = [...rows].sort((a, b) => a.chapter - b.chapter || a.verse - b.verse)
      res.push([key(v), v.release])
      stamps.push({ key: key(v), stamp: v.release })
      texts.push(plainText(key(v), sorted))
      rowKeys.push({ layer: 'text', key: `${book}|${v.abbr}` })
      built[v.abbr].push(book)
    }
    if (texts.length === 0) continue
    const model: BookModel = { lang: catalogName, book, orig: [orig[0], orig[1]], res, texts }
    segments.push(await builtSegment(bookSegment(model), inputsOf(rowKeys, stamps)))
  }
  if (segments.length === 0) throw new Error(`Nothing to build: no book of ${catalogName} is complete and missing from the base language`)

  const resources: CatalogResource[] = []
  for (const v of o.versions) {
    if (built[v.abbr].length === 0) continue
    const share = v.license === 'CC-BY-SA-4.0' ? ' Shared under the same license.' : ''
    resources.push({
      key: key(v),
      title: v.name,
      subject: 'Bible',
      release: v.release,
      license: v.license,
      rights: v.copyright.trim(),
      attribution: `${v.name}. ${v.copyright.trim()} Text unmodified, from yaapi.bible (${v.link}), license ${v.license} (${v.licenseUrl}).${share} Not aligned to the original.${v.notice !== undefined ? ` ${v.notice}` : ''}`,
      source,
      audience: v.audience,
      style: v.style,
      books: bookSet(built[v.abbr]),
    })
  }

  const about: About = { format: '3.0', catalog: catalogName, publisher: o.about.publisher, origin: 'published', revision: o.about.revision, built: o.about.built, builder: BUILDER }
  if (o.about.previous !== undefined) about.previous = o.about.previous
  const catalog = await buildCatalog({
    about,
    resources,
    segments,
    requires: [['common', o.common.revision, o.common.id]],
    needs: (s) => needsOfBook({ lang: catalogName, book: s.seg.h.book!, orig: ['', ''], res: [], texts: [] }, undefined, { patch: true }),
    patch: true,
  })
  return { catalog, segments, resources, built: Object.fromEntries(Object.entries(built).map(([k, b]) => [k, canon(b)])), report }
}
