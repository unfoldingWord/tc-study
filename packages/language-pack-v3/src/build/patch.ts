/**
 * The patch catalog of an aggregator (`spec/catalog.md`, "Patch catalogs"): the Hindi notes and questions of Aquifer that Door43 does
 * not have, as `book` segments with no texts, listed in the catalog `{lang}-x-{source}` (`hi-x-aquifer`).
 *
 * {@link buildPatch} takes what the command read from disk (the Aquifer articles, the books Door43 production already has, the
 * originals of the common catalog) and returns the segments and the catalog, unsigned. No Node module is used.
 *
 * - A book is built with the notes only if Door43 lacks the notes of that book, with the questions only if Door43 lacks the questions;
 *   a book with neither is not built.
 * - The `orig` of each book is the `[key, stamp]` of the common catalog's `orig:{book}` segment, and the book needs only that unit.
 * - A resource is `{source}/{lang}/tn` or `/tq`; its books are the ones built with it.
 */
import { bookNumber, bookSet } from '../ids'
import type { About, BookModel, CatalogResource, HelpTable, ReviewLevel } from '../model'
import { type AquiferArticle, aquiferNotes, type NoteCounts, aquiferQuestions, decodeEntities } from './aquiferHelps'
import { bookSegment } from './book'
import { type BuiltSegment, buildCatalog, builtSegment, needsOfBook } from './catalog'
import { BUILDER, inputsOf, licenseId } from './language'

export type PatchKind = 'tn' | 'tq'

/** What one Aquifer resource gives: its metadata, the pin it was fetched at and the articles of each book. */
export type PatchSource = {
  /** `UWTranslationNotes`. */
  repo: string
  commit: string
  /** `resource_metadata` of the resource (`title`, `license_info`, `adaptation_notice`). */
  metadata: { title?: string; license_info?: unknown; adaptation_notice?: string }
  /** The articles of each book (`NN.content.json`). */
  books: ReadonlyMap<string, AquiferArticle[]>
}

export const SUBJECTS: Record<PatchKind, string> = { tn: 'TSV Translation Notes', tq: 'TSV Translation Questions' }

/** The books Door43 production has, by table. */
export type BaseBooks = { tn: readonly string[]; tq: readonly string[] }

export type PatchInput = {
  /** Who adapted the resources when a notice does not name them (default `Mission Mutual`). */
  adapter?: string
  /** The base language (`hi`). */
  lang: string
  /** The aggregator, 1 to 8 characters of a-z and 0-9 (`aquifer`). */
  source: string
  tn?: PatchSource
  tq?: PatchSource
  taMap: ReadonlyMap<string, string>
  base: BaseBooks
  /** `orig` of the common catalog by book: `[key, stamp]` of its `orig:{book}` segment. */
  origs: ReadonlyMap<string, [string, string]>
  /** The common catalog: its revision and its id (64 hex digits). */
  common: { revision: number; id: string }
  /** Only these books (default: every book the sources have). */
  books?: readonly string[]
  about: { revision: number; built: string; publisher: string; previous?: Uint8Array }
}

export type PatchBuild = {
  catalog: BuiltSegment
  segments: BuiltSegment[]
  resources: CatalogResource[]
  /** The books built, by table, in the order of the canon. */
  built: Record<PatchKind, string[]>
  rows: Record<PatchKind, number>
  /** What was worked around, one line each (the issues of the converter, books left out). */
  report: string[]
  /** From the converter: links in the notes left as plain text, and associated Manual articles with no `ta:` id (so no concept). */
  taLinks: NoteCounts
}

/** The HTML of an `adaptation_notice` as plain text: inline tags gone, block tags as a space, entities decoded, white space collapsed. */
export function plainNotice(html: string): string {
  return decodeEntities(html.replace(/<\/?(?:p|br|div|li|ul|ol|h[1-6])\b[^>]*>/gi, ' ').replace(/<[^>]*>/g, ''))
    .replace(/\s+/g, ' ')
    .trim()
}

/** The `review` of a resource from the `review_level` of its articles: the level if all agree, `mixed` otherwise (a missing or unknown level is `none`, with a note). */
export function reviewOf(articles: Iterable<AquiferArticle>, note?: (line: string) => void): ReviewLevel {
  const levels = new Set<ReviewLevel>()
  for (const article of articles) {
    const raw = (article as { review_level?: unknown }).review_level
    const text = typeof raw === 'string' ? raw.trim().toLowerCase() : ''
    if (text === 'none' || text === 'community' || text === 'professional') levels.add(text)
    else {
      levels.add('none')
      note?.(`article ${String(article.content_id)}: review_level ${JSON.stringify(raw ?? null)} is read as none`)
    }
  }
  if (levels.size === 0) return 'none'
  return levels.size === 1 ? [...levels][0] : 'mixed'
}

type LicenseInfo = { licenses?: { eng?: { name?: string } }[]; copyright?: { dates?: string; holder?: { name?: string } } }

/** Who adapted the resource when the metadata does not say. */
export const DEFAULT_ADAPTER = 'Mission Mutual'

/** The adapter named by an adaptation notice ("... adapted by X"), or `undefined` when it does not name one. */
export function adapterOf(notice: string): string | undefined {
  const m = /\badapted\b[^.]*?\bby\s+([^.;,]+?)\s*\.?$/i.exec(plainNotice(notice))
  return m?.[1]
}

/** The SPDX license and the rights line of a resource's `license_info`. Throws `Error` when the license is not CC-BY-SA-4.0 (a license is never guessed). */
export function licenseOf(info: unknown, key: string, adapter = DEFAULT_ADAPTER): { license: string; rights: string } {
  const li = (typeof info === 'object' && info !== null ? info : {}) as LicenseInfo
  const name = li.licenses?.[0]?.eng?.name
  const license = licenseId(typeof name === 'string' ? name.replace(/\s+licen[sc]e$/i, '') : undefined)
  if (license !== 'CC-BY-SA-4.0') throw new Error(`${key}: license_info names the license ${JSON.stringify(name ?? null)}, and only CC-BY-SA-4.0 is accepted for a patch`)
  const holder = li.copyright?.holder?.name
  const dates = li.copyright?.dates
  if (typeof holder !== 'string' || holder === '' || typeof dates !== 'string' || dates === '') throw new Error(`${key}: license_info has no copyright holder or dates`)
  return { license, rights: `© ${dates} ${holder}; adapted by ${adapter}` }
}

const canon = (books: Iterable<string>): string[] => [...new Set(books)].sort((a, b) => bookNumber(a) - bookNumber(b))

/**
 * Builds the segments and the catalog. Throws `Error` when nothing is left to build, a license is not CC-BY-SA-4.0, or a catalog rule
 * is broken. A book whose original the common catalog lacks is left out, with a line in the report.
 */
export async function buildPatch(o: PatchInput): Promise<PatchBuild> {
  const catalogName = `${o.lang}-x-${o.source}`
  const sources: [PatchKind, PatchSource | undefined][] = [
    ['tn', o.tn],
    ['tq', o.tq],
  ]
  const keys: Record<PatchKind, string> = { tn: `${o.source}/${o.lang}/tn`, tq: `${o.source}/${o.lang}/tq` }
  const report: string[] = []
  const issues: string[] = []
  const taLinks: NoteCounts = { inlineLinks: 0, conceptArticles: 0 }
  const wanted = o.books === undefined ? undefined : new Set(o.books)

  const candidates = canon(sources.flatMap(([, s]) => (s === undefined ? [] : [...s.books.keys()])))
  const built: Record<PatchKind, string[]> = { tn: [], tq: [] }
  const rows: Record<PatchKind, number> = { tn: 0, tq: 0 }
  const used: Record<PatchKind, AquiferArticle[]> = { tn: [], tq: [] }
  const segments: BuiltSegment[] = []

  for (const book of candidates) {
    if (wanted !== undefined && !wanted.has(book)) continue
    const tables: Partial<Record<PatchKind, { table: HelpTable; items: AquiferArticle[] }>> = {}
    for (const [kind, source] of sources) {
      const items = source?.books.get(book)
      if (source === undefined || items === undefined) continue
      if (o.base[kind].includes(book)) {
        report.push(`book ${book}: ${kind} left out, Door43 has it`)
        continue
      }
      const table = kind === 'tn' ? aquiferNotes(items, book, keys.tn, o.taMap, issues, taLinks) : aquiferQuestions(items, book, keys.tq, issues)
      tables[kind] = { table, items }
    }
    if (tables.tn === undefined && tables.tq === undefined) continue
    const orig = o.origs.get(book)
    if (orig === undefined) {
      report.push(`book ${book}: the common catalog has no orig:${book}, so the book is left out`)
      continue
    }
    const res: [string, string][] = []
    const stamps: { key: string; stamp: string }[] = [{ key: orig[0], stamp: orig[1] }]
    const model: BookModel = { lang: catalogName, book, orig: [orig[0], orig[1]], res, texts: [] }
    const rowKeys: { layer: string; key: string }[] = []
    for (const [kind, source] of sources) {
      const t = tables[kind]
      if (t === undefined || source === undefined) continue
      const release = `${source.repo}@${source.commit}`
      res.push([keys[kind], release])
      stamps.push({ key: keys[kind], stamp: release })
      if (kind === 'tn') model.notes = t.table
      else model.questions = t.table
      built[kind].push(book)
      rows[kind] += t.table.rows.length
      used[kind].push(...t.items)
      for (const row of t.table.rows) rowKeys.push({ layer: kind, key: `${book}|${row.id}` })
    }
    segments.push(await builtSegment(bookSegment(model), inputsOf(rowKeys, stamps)))
  }
  if (segments.length === 0) throw new Error(`Nothing to build: Door43 already has the notes and the questions of every book ${catalogName} could add`)

  const resources: CatalogResource[] = []
  for (const [kind, source] of sources) {
    if (source === undefined || built[kind].length === 0) continue
    const key = keys[kind]
    const attribution = plainNotice(source.metadata.adaptation_notice ?? '')
    const { license, rights } = licenseOf(source.metadata.license_info, key, adapterOf(source.metadata.adaptation_notice ?? '') ?? o.adapter ?? DEFAULT_ADAPTER)
    if (attribution === '') throw new Error(`${key}: adaptation_notice is empty, and the attribution of a patch is never left out`)
    const resource: CatalogResource = {
      key,
      title: source.metadata.title ?? key,
      subject: SUBJECTS[kind],
      release: `${source.repo}@${source.commit}`,
      license,
      rights,
      source: o.source,
      review: reviewOf(used[kind], (line) => report.push(`${key} ${line}`)),
      books: bookSet(built[kind]),
    }
    resource.attribution = attribution
    resources.push(resource)
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

  report.push(...issues.map((line) => `converter: ${line}`))
  return { catalog, segments, resources, built: { tn: canon(built.tn), tq: canon(built.tq) }, rows, report, taLinks }
}
