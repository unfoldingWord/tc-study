/**
 * Building a whole language, and the common catalog, from a {@link RowSource} (`spec/catalog.md`, `spec/transfer.md`, "Old packs").
 *
 * - {@link buildLanguage} makes every segment of a language (its book, article, lexicon and Open Bible Stories segments) and the
 *   catalog that lists them. The bridge from an old pack (`bridge/fromV2.ts`) is this function over a pack's source.
 * - {@link buildCommon} makes the `orig` segments (the originals every language needs) and the common catalog. The maps come in
 *   phase 2.
 *
 * No Node module is used: a browser or a Worker can run both.
 *
 * ## `inputs`
 *
 * The `inputs` of a segment (`catalog.cddl`, `segment-entry`) is {@link inputsOf} of the rows it was read from and the resources
 * those rows belong to:
 * - **book**: the `sot` and `quote` rows of the book in each resource the book segment names in `res`, and the `sot` rows of the
 *   book in the originals; the resources are those of `res` (key and whole stamp) and the original (its key and the stamp of the
 *   book, `OrigModel.stamp`);
 * - **orig**: the `sot` rows of the book in the originals; the resources are the originals that have the book;
 * - **art**: the `sot` rows of the articles of the group, in the resources of those articles; **lex**: the `sot` rows of the
 *   lexicon files `content/{n}.json` of the group, in the resources of its entries; **obs**: the `sot` rows of every resource the
 *   segment names in `res`.
 *
 * ## Report
 *
 * `report` has one line for everything a builder worked around (`issues` of the extractors), each starting with its scope (`book tit: `,
 * `art tw:kt: `, `lex G0: `, `obs: `; `art: ` and `lex: ` when the line is about the whole resource), and the lines of this file: a book
 * left out because the source lacks its originals.
 */
import { compareCodePoints } from '../codec/columns'
import type { Segment } from '../codec/container'
import { sha256Hex } from '../codec/sha256'
import { BOOKS, bookNumber, bookSet } from '../ids'
import type { About, ArticleModel, BookModel, CatalogResource, LexEntry, OrigModel } from '../model'
import { ORIGINALS, type ResourceRef, type Row, type RowSource } from '../source/rows'
import { articleOfPath, articleResources, artSegment, extractArticles, type Kind } from './art'
import { extractBook, isBookResource } from './bookHelps'
import { bookSegment } from './book'
import { type BuiltSegment, buildCatalog, builtSegment, compareSegments, needsOfBook } from './catalog'
import { extractLexicon, lexResources, lexSegment } from './lex'
import { extractObs, obsSegment } from './obs'
import { extractOrig, origSegment } from './orig'
import { buildAligned, isBridgeText } from './aligned/build'
import { alignedSegment } from './aligned/segment'
import { buildMap } from './map/build'
import { mapSegment } from './map/segment'
import { versesOf } from './maps/verses'
import { buildXmap } from './xmap/build'
import { xmapSegment } from './xmap/segment'
import type { SectionRegistry } from './sections'
import { sourceRows } from './bookHelps'
import { outlineOf } from './topics/outline'
import { topicsSegment, xtopicsSegment } from './topics/segment'
import { buildTopics } from './topics/topics'
import { buildXtopics, chapterLengths, type TwName, type XtopicsSources } from './topics/xtopics'
import { parseObsRefs } from '../source/obsRefs'
import { parseTheographic } from '../source/theographic'
import { parseTipnr } from '../source/tipnr'
import type { XmapCore, XmapPart, XtopicsCore } from '../model'
import type { TipnrRecord } from '../source/tipnr'

/** The name and version `about.builder` carries when this package builds. A constant, not read from `package.json` at run time. */
export const BUILDER = 'language-pack-v3 0.1.0'

// Inputs

/** The part of a row an `inputs` fingerprint uses. */
export type RowKey = Pick<Row, 'layer' | 'key'>

/**
 * The fingerprint of what a segment was built from (64 lowercase hex digits): the sha256 of the lines `layer|key` of its rows,
 * sorted by code point (a row twice counts twice), an empty line, and the lines `resourceKey|stamp` of its resources, sorted the
 * same way and without repeats. The contents of the rows do not enter: the stamp of a resource stands for them (a resource's
 * release does not change without its rows changing), so a segment is rebuilt when a resource has a new release or when the set
 * of rows it reads changes, and not otherwise. The order the rows and the resources are given in does not matter.
 */
export function inputsOf(rows: Iterable<RowKey>, resources: Iterable<{ key: string; stamp: string }>): string {
  const rowLines = [...rows].map((row) => `${row.layer}|${row.key}`).sort(compareCodePoints)
  const resourceLines = [...new Set([...resources].map((resource) => `${resource.key}|${resource.stamp}`))].sort(compareCodePoints)
  return sha256Hex(`${rowLines.join('\n')}\n\n${resourceLines.join('\n')}`)
}

async function addKeys(into: RowKey[], rows: AsyncIterable<Row>): Promise<void> {
  for await (const row of rows) into.push({ layer: row.layer, key: row.key })
}

/** The `sot` rows of the originals of a book, as keys: what `extractOrig` reads, and part of the inputs of a book segment. */
async function originalRowKeys(source: RowSource, book: string): Promise<RowKey[]> {
  const keys: RowKey[] = []
  await addKeys(keys, source.rows({ lang: ORIGINALS, book, layer: 'sot' }))
  return keys
}

// Resources

const tagOf = (stamp: string): string => stamp.split('#')[0]

/** The license texts a catalog knows by their SPDX id, by the text without case, spaces, hyphens and underscores. */
const SPDX: ReadonlyMap<string, string> = new Map([
  ['ccbysa4.0', 'CC-BY-SA-4.0'],
  ['ccby4.0', 'CC-BY-4.0'],
  ['cc0', 'CC0-1.0'],
  ['cc01.0', 'CC0-1.0'],
])

/** The SPDX id of a license text (`CC BY-SA 4.0` is `CC-BY-SA-4.0`), the text itself when it is not a known one, `unknown` when there is none. */
export function licenseId(text: string | undefined): string {
  if (text === undefined || text.trim() === '') return 'unknown'
  return SPDX.get(text.toLowerCase().replace(/[\s_-]+/g, '')) ?? text
}

/** The books of a resource that are one of the 66 (the book set holds no other). */
const BOOK_CODES: ReadonlySet<string> = new Set(BOOKS)
const knownBooks = (books: string[]): string[] => books.filter((book) => BOOK_CODES.has(book))

/** A resource as the catalog lists it. The title is the key's last part when the source has none. */
function catalogResource(ref: ResourceRef): CatalogResource {
  const out: CatalogResource = {
    key: ref.key,
    title: ref.title ?? ref.key.slice(ref.key.lastIndexOf('/') + 1),
    subject: ref.kind,
    release: tagOf(ref.stamp),
    license: licenseId(ref.license),
    books: bookSet(knownBooks(ref.books)),
  }
  if (ref.rights !== undefined) out.rights = ref.rights
  if (ref.attribution !== undefined) out.attribution = ref.attribution
  return out
}

/** The resources of `refs` whose keys are in `used`, as the catalog lists them. */
const catalogResources = (refs: ResourceRef[], used: Set<string>): CatalogResource[] => refs.filter((ref) => used.has(ref.key)).map(catalogResource)

/** The books of `refs`, in the order of the canon. */
function booksOf(refs: ResourceRef[]): string[] {
  return [...new Set(refs.flatMap((ref) => knownBooks(ref.books)))].sort((a, b) => bookNumber(a) - bookNumber(b))
}

/** `books` in the order of the canon, without repeats; `RangeError` for a code that is not one of the 66. */
function canonical(books: string[]): string[] {
  for (const book of books) bookNumber(book)
  return [...new Set(books)].sort((a, b) => bookNumber(a) - bookNumber(b))
}

// Report

/** `art tw:kt: ` for a line that starts with an article id (`tw:kt/grace (res): …`), else `art: `. */
function artScope(line: string): string {
  const m = /^(tw|ta):([^/:\s]+)\//.exec(line)
  return m === null ? 'art' : `art ${m[1]}:${m[2]}`
}

/** `lex G0: ` for a line that starts with a Strong number (`G976 (res): …`), else `lex: `. */
function lexScope(line: string): string {
  const m = /^([GH])([0-9]+)/.exec(line)
  return m === null ? 'lex' : `lex ${m[1]}${Math.floor(Number(m[2]) / 1000)}`
}

const scoped = (lines: string[], scope: (line: string) => string): string[] => lines.map((line) => `${scope(line)}: ${line}`)

// Rows of articles, lexicon files

/** The `sot` rows each group of articles was read from, by group: the rows whose key names an article of the group. */
async function articleRowKeys(source: RowSource, lang: string, groups: Map<string, ArticleModel[]>): Promise<Map<string, RowKey[]>> {
  const resOf = new Map<string, string>()
  const kindOf = new Map<string, Kind>()
  for (const articles of groups.values()) {
    for (const article of articles) {
      resOf.set(article.id, article.res)
      kindOf.set(article.res, article.id.startsWith('tw:') ? 'tw' : 'ta')
    }
  }
  const out = new Map<string, RowKey[]>()
  for (const [resource, kind] of kindOf) {
    for await (const row of source.rows({ lang, resource, layer: 'sot' })) {
      const path = row.key.startsWith(`${resource}/`) ? row.key.slice(resource.length + 1) : undefined
      const found = path === undefined ? null : articleOfPath(kind, path)
      if (found === null || resOf.get(found.id) !== resource) continue
      const list = out.get(found.group)
      if (list === undefined) out.set(found.group, [{ layer: row.layer, key: row.key }])
      else list.push({ layer: row.layer, key: row.key })
    }
  }
  return out
}

/**
 * The `sot` rows each lexicon group was read from, by group: the files `content/{n}.json` of the resources of the group's entries,
 * the group being the letter of the entries and `n` divided by 1000 (the same as the group of the Strong numbers the file holds).
 */
async function lexiconRowKeys(source: RowSource, lang: string, groups: Map<string, LexEntry[]>): Promise<Map<string, RowKey[]>> {
  const letters = new Map<string, string>()
  for (const entries of groups.values()) for (const entry of entries) letters.set(entry.res, entry.strong[0])
  const out = new Map<string, RowKey[]>()
  for (const [resource, letter] of letters) {
    for await (const row of source.rows({ lang, resource, layer: 'sot' })) {
      const m = /^content\/([0-9]+)\.json$/.exec(row.key.startsWith(`${resource}/`) ? row.key.slice(resource.length + 1) : '')
      if (m === null) continue
      const group = `${letter}${Math.floor(Number(m[1]) / 1000)}`
      const list = out.get(group)
      if (list === undefined) out.set(group, [{ layer: row.layer, key: row.key }])
      else list.push({ layer: row.layer, key: row.key })
    }
  }
  return out
}

// Languages

/** What {@link buildLanguage} gives back. `segments` are in the order of the catalog; `report` is described at the top of this file. */
export type LanguageBuild = { segments: BuiltSegment[]; catalog: BuiltSegment; registry: SectionRegistry; report: string[] }

/**
 * Builds the segments of a language and its catalog.
 *
 * - **Books.** `books` (default: every book some resource of `lang` has, in the order of the canon) are built one by one: the original
 *   is read ({@link extractOrig}) for the positions, and the book model and segment follow. A book whose originals the source does not
 *   have is left out with a line in `report` (the pack waits for them); a book no resource of `lang` has is left out with a line too.
 *   `RangeError` for a code in `books` that is not one of the 66. The orig segment itself belongs to {@link buildCommon}.
 * - **Others.** One `art` segment per article group, one `lex` segment per lexicon group, and an `obs` segment when the language has stories.
 * - **Catalog.** `about` is `o.about` with `catalog` set to `lang`; `resources` are those of `lang` that some segment names in `res`;
 *   a book unit needs what {@link needsOfBook} says and no other unit needs anything; `requires` is the common catalog the build is
 *   against, `[catalog, revision, id in hex]`.
 * - **Registry.** `registry` is the one of the last build (`{}` for the first); the one returned is {@link extractArticles}'s: give it to the next.
 *
 * - **Aligned.** With `aligned: true` it also builds the optional units `aligned:{part}` ({@link buildAligned}, the bridge texts GLT, GST, ULT and
 *   UST of the books built): one `aligned` segment per part that has a key. They are optional in the catalog and no unit needs them; the
 *   segments of every other class are the same bytes with or without them (the index is built last and nothing reads it). Default `false`.
 *
 * - **Own originals.** With `withOrig: true` it also builds the `orig` segment of each book it builds, the same bytes as the common
 *   catalog's ({@link buildCommon}), lists it as a unit of this catalog and lists the originals it names among the resources. The
 *   book then finds `orig:{book}` in its own catalog, with no common catalog: this is for a device that bridges an old pack with
 *   no network. A publisher leaves it off (the common catalog has the originals). Default `false`.
 *
 * The same source, `about` and registry give the same segments and catalog. Throws `Error` for rows that are not what format 2.0
 * writes (the extractors do), and for what a segment cannot hold.
 */
export async function buildLanguage(o: {
  source: RowSource
  lang: string
  books?: string[]
  registry: SectionRegistry
  about: Omit<About, 'catalog'>
  requires?: [string, number, string][]
  bookNames?: Record<string, [string, string, string]>
  partial?: boolean
  topics?: { xtopics: XtopicsCore; records: TipnrRecord[] }
  aligned?: boolean
  withOrig?: boolean
}): Promise<LanguageBuild> {
  const { source, lang } = o
  const report: string[] = []
  const refs = await source.resources(lang)
  const refOf = new Map(refs.map((ref) => [ref.key, ref]))
  const stampsOf = (keys: Iterable<string>) => [...keys].map((key) => ({ key, stamp: refOf.get(key)!.stamp }))
  const originals = await source.resources(ORIGINALS)

  const segments: BuiltSegment[] = []
  const bookModels = new Map<string, BookModel>()
  const used = new Set<string>()
  const add = async (seg: Segment, inputs: string, uses: Iterable<string>): Promise<BuiltSegment> => {
    const built = await builtSegment(seg, inputs)
    segments.push(built)
    for (const key of uses) used.add(key)
    return built
  }

  // Books
  const books = o.books === undefined ? booksOf(refs) : canonical(o.books)
  const mapBooks: { model: BookModel; verses: number[] }[] = []
  const mapRows = new Map<string, RowKey[]>()
  const origs = new Map<string, OrigModel>()
  const usedOriginals = new Set<string>()
  for (const book of books) {
    if (!refs.some((ref) => ref.books.includes(book))) {
      report.push(`book ${book}: ${lang} has no resource of this book: left out`)
      continue
    }
    // A resource of another subject (a plain Bible such as t4t) has the book and gives a book segment nothing: `extractBook` would throw.
    if (!refs.some((ref) => isBookResource(ref) && ref.books.includes(book))) {
      report.push(`book ${book}: ${lang} has resources of this book, but none of the subjects a book segment keeps (Aligned Bible, TSV Translation Notes, TSV Translation Questions, TSV Translation Words Links): left out`)
      continue
    }
    if (!originals.some((ref) => ref.books.includes(book))) {
      report.push(`book ${book}: the source has no originals of this book, and the positions of the book need them: left out (the pack waits for them)`)
      continue
    }
    const issues: string[] = []
    const orig = await extractOrig(source, book)
    origs.set(book, orig)
    // The rows `extractBook` reads are the ones the inputs name: they are read once.
    const read: RowKey[] = []
    const model = await extractBook(source, lang, book, orig, issues, read)
    report.push(...issues.map((line) => `book ${book}: ${line}`))
    const keys = model.res.map(([key]) => key)
    const inputs = inputsOf([...read, ...(await originalRowKeys(source, book))], [...stampsOf(keys), { key: orig.key, stamp: orig.stamp }])
    const built = await add(bookSegment(model), inputs, keys)
    bookModels.set(built.id, model)
    mapBooks.push({ model, verses: versesOf(orig) })
    mapRows.set(book, [...read, ...(await originalRowKeys(source, book))])
    if (o.withOrig === true) {
      const having = originals.filter((ref) => ref.books.includes(book))
      const resources = having.map((ref) => ({ key: ref.key, stamp: ref.key === orig.key ? orig.stamp : ref.stamp }))
      await add(origSegment(orig), inputsOf(await originalRowKeys(source, book), resources), [])
      for (const ref of having) usedOriginals.add(ref.key)
    }
  }

  // Articles
  const artIssues: string[] = []
  const { groups: articles, registry } = await extractArticles(source, lang, o.registry, artIssues)
  report.push(...scoped(artIssues, artScope))
  const artRows = await articleRowKeys(source, lang, articles)
  for (const [group, list] of articles) {
    const res = articleResources(list, refs)
    const keys = res.map(([key]) => key)
    await add(artSegment(lang, group, res, list), inputsOf(artRows.get(group) ?? [], stampsOf(keys)), keys)
  }

  // The article groups a book's notes point to that this catalog does not build are not needs: the book would never activate.
  const groupUnits = new Set([...articles.keys()].map((group) => `art:${group}`))
  const needs = new Map<string, string[]>()
  for (const [id, model] of bookModels) {
    const wanted = needsOfBook(model)
    const kept = needsOfBook(model, groupUnits)
    needs.set(id, kept)
    const left = wanted.filter((unit) => !kept.includes(unit))
    if (left.length > 0) report.push(`book ${model.book}: its notes point to ${left.join(', ')}, which this catalog does not build: not listed as needs`)
  }

  // Lexicon
  const lexIssues: string[] = []
  const lexicon = await extractLexicon(source, lang, lexIssues)
  report.push(...scoped(lexIssues, lexScope))
  const lexRows = await lexiconRowKeys(source, lang, lexicon)
  for (const [group, entries] of lexicon) {
    const res = lexResources(entries, refs)
    const keys = res.map(([key]) => key)
    await add(lexSegment(lang, group, res, entries), inputsOf(lexRows.get(group) ?? [], stampsOf(keys)), keys)
  }

  // Open Bible Stories
  const obsIssues: string[] = []
  const obs = await extractObs(source, lang, obsIssues)
  report.push(...obsIssues.map((line) => `obs: ${line}`))
  if (obs !== null) {
    const keys = obs.res.map(([key]) => key)
    const rows: RowKey[] = []
    for (const resource of keys) await addKeys(rows, source.rows({ lang, resource, layer: 'sot' }))
    await add(obsSegment(obs), inputsOf(rows, stampsOf(keys)), keys)
  }

  // The language map: the notes counted by concept, the names of books and concepts, the coverage of every resource
  if (refs.length > 0) {
    const built = buildMap({ lang, refs, books: mapBooks, articles: [...articles.values()].flat(), obs, bookNames: o.bookNames, partial: o.partial })
    const all = refs.map((ref) => ref.key)
    const coreRows: RowKey[] = [...mapRows.values()].flat()
    for (const list of artRows.values()) coreRows.push(...list)
    if (obs !== null) for (const resource of obs.res.map(([key]) => key)) await addKeys(coreRows, source.rows({ lang, resource, layer: 'sot' }))
    await add(mapSegment(built.core), inputsOf(coreRows, stampsOf(all)), all)
    for (const part of built.parts) {
      const keys = refs.filter((ref) => ref.books.includes(part.part)).map((ref) => ref.key)
      // The usage counts come from the SupportReference of the notes, which the row keys do not show: the stamp of the tN of the
      // book stands for them (catalog.md, "What changes"), so a new release of the notes rebuilds the part.
      const notes = refs.filter((ref) => ref.kind === TN_KIND && ref.books.includes(part.part)).map((ref) => ref.key)
      await add(mapSegment(part), inputsOf(mapRows.get(part.part) ?? [], stampsOf(notes)), keys)
    }
  }

  // The language topics: the names the language gives to the topics of the xtopics it was built against. The map above never reads them.
  if (o.topics !== undefined) {
    const xt = o.topics.xtopics
    const lastVerse = chapterLengths([...origs.values()])
    const issues: string[] = []
    const outlines = new Map<string, { title: string; from: number; to: number }[]>()
    const tn = refs.filter((ref) => ref.kind === TN_KIND).sort((a, b) => compareCodePoints(a.key, b.key))[0]
    if (tn !== undefined) await outlinesOf(source, lang, tn, [...origs.keys()], outlines, issues, lastVerse)
    const stories = (obs?.stories ?? []).map((story) => ({ n: story.n, title: story.title }))
    const built = buildTopics({
      lang,
      xtopics: xt,
      records: o.topics.records,
      books: [...bookModels.values()],
      origs,
      outlines,
      outlineRes: tn?.key,
      lastVerse,
      obs: stories,
      obsRes: obs?.res.map(([key]) => key),
      releases: new Map(refs.map((ref) => [ref.key, tagOf(ref.stamp)])),
    })
    report.push(...issues.map((line) => `topics: ${line}`), ...built.report.map((line) => `topics: ${line}`))
    const rows: RowKey[] = [...mapRows.values()].flat()
    if (tn !== undefined) for (const book of origs.keys()) if (tn.books.includes(book)) await addKeys(rows, source.rows({ lang, book, resource: tn.key }))
    if (obs !== null) for (const resource of obs.res.map(([key]) => key)) await addKeys(rows, source.rows({ lang, resource, layer: 'sot' }))
    rows.push({ layer: 'topics', key: `tipnr|${sha256Hex(JSON.stringify(o.topics.records))}` }, { layer: 'topics', key: `xtopics|${sha256Hex([...xt.topics.keys()].join('\n'))}` })
    const keys = built.core.res.map(([key]) => key)
    const inputs = inputsOf(rows, [...stampsOf(keys.filter((key) => refOf.has(key))), ...xt.res.map(([key, stamp]) => ({ key, stamp }))])
    await add(topicsSegment(built.core), inputs, keys)
    for (const part of built.parts) await add(topicsSegment(part), inputs, keys)
  }

  // The index of aligned phrases (optional units): built last, from the book models already made; nothing reads it back.
  if (o.aligned === true) {
    const built = buildAligned({ lang, books: [...bookModels.values()], origs, texts: isBridgeText })
    report.push(...built.report)
    const keys = built.parts[0]?.res.map(([key]) => key) ?? []
    const rows: RowKey[] = [...mapRows.values()].flat()
    for (const part of built.parts) await add(alignedSegment(part), inputsOf(rows, [...stampsOf(keys), ...[...origs.values()].map((orig) => ({ key: orig.key, stamp: orig.stamp }))]), keys)
  }

  segments.sort(compareSegments)
  const catalog = await buildCatalog({
    about: { ...o.about, catalog: lang },
    resources: [...catalogResources(refs, used), ...catalogResources(originals, usedOriginals)],
    segments,
    requires: o.requires,
    needs: (built) => needs.get(built.id) ?? [],
  })
  return { segments, catalog, registry, report }
}

// Common

const TN_KIND = 'TSV Translation Notes'
const TWL_KIND = 'TSV Translation Words Links'
const XMAP_SUBJECTS: ReadonlySet<string> = new Set([TN_KIND, TWL_KIND, 'Translation Words', 'Translation Academy'])
const TITLE_ROW = /^helps-text:(tw|ta)-title:/

/** The keys and pinned releases of the sources of the common topics (`spec/fuentes.md`). */
const TOPIC_SOURCES: Omit<XtopicsSources, 'outlines'> = {
  tipnr: ['STEPBible/STEPBible-Data/TIPNR', 'be4191f0'],
  theographic: ['robertrouse/theographic-bible-metadata', '744355c7'],
  obs: ['unfoldingWord/en/obs', 'v9'],
}

/** What the catalog says of each source of the common topics (title, SPDX license, credit line). */
const TOPIC_CREDITS: Record<keyof typeof TOPIC_SOURCES, { title: string; license: string; attribution: string }> = {
  tipnr: {
    title: 'TIPNR - Translators Individualised Proper Names with all References',
    license: 'CC-BY-4.0',
    attribution:
      '"STEP Bible" (www.STEPBible.org), data by Tyndale House Cambridge, licensed CC BY 4.0. Changed: the data of TIPNR was extracted, re-keyed and reduced (names, verses, relations, Strong keys)',
  },
  theographic: {
    title: 'Theographic Bible Metadata',
    license: 'CC-BY-SA-4.0',
    attribution:
      'Theographic Bible Metadata (viz.bible), Robert Rouse, CC BY-SA 4.0. Changed: only the events were extracted, re-keyed and reduced. Its original sources are cited in docs/data-source-bibliography.md of robertrouse/theographic-bible-metadata at commit 744355c7a5f38efd407bc67a5257c99aca9532bc',
  },
  obs: { title: 'Open Bible Stories', license: 'CC-BY-SA-4.0', attribution: 'The original work by unfoldingWord is available from https://openbiblestories.org' },
}

/** The outlines of the `front:intro` notes of the tN `tn`, by book, into `outlines`; what cannot be read goes to `issues`. */
async function outlinesOf(
  source: RowSource,
  lang: string,
  tn: ResourceRef,
  books: string[],
  outlines: Map<string, { title: string; from: number; to: number }[]>,
  issues: string[],
  lastVerse: (book: string, chapter: number) => number | undefined,
): Promise<void> {
  for (const book of books) {
    if (!tn.books.includes(book)) continue
    const rows: Row[] = []
    for await (const row of source.rows({ lang, book, resource: tn.key })) rows.push(row)
    const intro = sourceRows(rows, book, tn.key, 'notes')
      .map(({ item }) => item as Record<string, unknown>)
      // `front:intro` in a TSV; format 2.0 marks the introductions `isIntro` and places the book's at 1:1, with the chapter's
      .filter((item) => item !== null && typeof item === 'object' && typeof item.note === 'string')
      .find((item) => item.reference === 'front:intro' || (item.isIntro === true && /^#{1,6}\s.*(outline|esquema)/im.test(item.note as string)))
    if (intro === undefined) issues.push(`outline ${book}: no introduction with an outline (front:intro) in ${tn.key}`)
    else outlines.set(book, outlineOf(intro.note as string, book, issues, lastVerse))
  }
}

/**
 * Builds the `orig` segments (one per book, from {@link extractOrig} and {@link origSegment}) and the common catalog: `about` is
 * `o.about` with `catalog` set to `"common"`, the units are `orig:{book}`, and the resources are the originals that have a book
 * built. `books` defaults to every book the originals of the source have, in the order of the canon.
 *
 * With `mapLang` (the language whose helps make the common map, `"en"`) it also builds the `xmap` core and one part per book
 * ({@link buildXmap} over the originals just read) and the unit `xmap`, which needs no other unit. The `inputs` of the core are the
 * rows the map read (the originals of the books, the tN and tWL rows of the books, the title rows of the tW and tA) and the stamps
 * of every resource of `res`; those of a part are the rows of its book and the stamps of the sources that have the book. Without
 * `mapLang` the result is what phase 1 gave, with an empty `report`.
 *
 * With `topics` (the TIPNR file, the four Theographic files, the English OBS stories by number) it also builds the `xtopics`
 * core and its parts ({@link buildXtopics} over the originals just read; the unit `xtopics`, which needs nothing). The sections
 * come from the outlines of the `front:intro` notes of the tN of `mapLang`, and the `same-as` relations from the `tw:names/`
 * concepts of the xmap; without `mapLang` there are neither. The map is built first and never reads the topics: its segments are
 * the same bytes with or without `topics`. The `inputs` of every xtopics segment are the sha256 of the three source texts and
 * the stamps of the topic sources, the originals and the tN. Report lines of this module start with `topics: `; those of its
 * review list (a match that is not exactly one) with `topics: review: `.
 *
 * Throws `Error` for a book the source has no originals of, `RangeError` for a code that is not one of the 66.
 */
export async function buildCommon(o: {
  source: RowSource
  books?: string[]
  about: Omit<About, 'catalog'>
  mapLang?: string
  topics?: {
    tipnr: string
    theographic: { events: string; verses: string; people: string; places: string }
    obs: Map<number, string>
    releases?: Partial<Omit<XtopicsSources, 'outlines'>>
  }
}): Promise<{ segments: BuiltSegment[]; catalog: BuiltSegment; report: string[] }> {
  const refs = await o.source.resources(ORIGINALS)
  const books = o.books === undefined ? booksOf(refs) : canonical(o.books)
  const segments: BuiltSegment[] = []
  const used = new Set<string>()
  const origs: OrigModel[] = []
  const origRows = new Map<string, RowKey[]>()
  for (const book of books) {
    const orig = await extractOrig(o.source, book)
    origs.push(orig)
    const having = refs.filter((ref) => ref.books.includes(book))
    const rows: RowKey[] = []
    await addKeys(rows, o.source.rows({ lang: ORIGINALS, book, layer: 'sot' }))
    origRows.set(book, rows)
    // The original is known by the stamp of its book; another original with rows of the book (MACULA) by its release.
    const resources = having.map((ref) => ({ key: ref.key, stamp: ref.key === orig.key ? orig.stamp : ref.stamp }))
    segments.push(await builtSegment(origSegment(orig), inputsOf(rows, resources)))
    for (const ref of having) used.add(ref.key)
  }

  const report: string[] = []
  const listed = [...refs]
  const lang = o.mapLang
  if (lang !== undefined && origs.length === 0) report.push(`no original was built, so the xmap of ${lang} is not built: the publisher needs the originals`)
  let xmap: { core: XmapCore; parts: XmapPart[] } | undefined
  if (lang !== undefined && origs.length > 0) {
    const built = await buildXmap({ source: o.source, origs, lang })
    xmap = built
    report.push(...built.report)
    const helps = (await o.source.resources(lang)).filter((ref) => XMAP_SUBJECTS.has(ref.kind))
    for (const ref of helps) {
      listed.push(ref)
      used.add(ref.key)
    }
    const noteLike = (ref: ResourceRef): boolean => ref.kind === TN_KIND || ref.kind === TWL_KIND
    // An original is known by the stamp of each book (`orig.stamp`); a part lists the stamp of its own book, the core one per book.
    const stampOf = (ref: ResourceRef, book?: string): { key: string; stamp: string }[] => {
      const mine = origs.filter((orig) => orig.key === ref.key && (book === undefined || orig.book === book))
      return mine.length === 0 ? [{ key: ref.key, stamp: ref.stamp }] : mine.map((orig) => ({ key: ref.key, stamp: orig.stamp }))
    }
    const originalsUsed = refs.filter((ref) => origs.some((orig) => orig.key === ref.key))
    const coreRows: RowKey[] = [...origRows.values()].flat()
    const bookRows = new Map<string, RowKey[]>()
    for (const orig of origs) {
      const rows: RowKey[] = [...(origRows.get(orig.book) ?? [])]
      const before = rows.length
      for (const ref of helps) if (noteLike(ref) && ref.books.includes(orig.book)) await addKeys(rows, o.source.rows({ lang, book: orig.book, resource: ref.key }))
      bookRows.set(orig.book, rows)
      coreRows.push(...rows.slice(before))
    }
    for (const ref of helps) {
      if (noteLike(ref)) continue
      for await (const row of o.source.rows({ lang, resource: ref.key, layer: 'text' })) if (TITLE_ROW.test(row.key)) coreRows.push({ layer: row.layer, key: row.key })
    }
    segments.push(await builtSegment(xmapSegment(built.core), inputsOf(coreRows, [...originalsUsed, ...helps].flatMap((ref) => stampOf(ref)))))
    for (const part of built.parts) {
      const book = part.part
      const sources = [...originalsUsed, ...helps.filter(noteLike)].filter((ref) => ref.books.includes(book)).flatMap((ref) => stampOf(ref, book))
      segments.push(await builtSegment(xmapSegment(part), inputsOf(bookRows.get(book) ?? [], sources)))
    }
  }

  const extra: CatalogResource[] = []
  if (o.topics !== undefined && origs.length === 0) report.push('topics: no original was built, so the xtopics are not built: the publisher needs the originals')
  if (o.topics !== undefined && origs.length > 0) {
    const t = o.topics
    const issues: string[] = []
    const lastVerse = chapterLengths(origs)
    const tipnr = parseTipnr(t.tipnr, issues)
    const events = parseTheographic(t.theographic, issues)
    const obs = parseObsRefs(t.obs, issues, lastVerse)
    // The outlines of the English tN introductions (the first tN of mapLang by key)
    const outlines = new Map<string, { title: string; from: number; to: number }[]>()
    let tn: ResourceRef | undefined
    if (lang === undefined) report.push('topics: no mapLang: the xtopics have no sections and no same-as relations')
    else {
      tn = (await o.source.resources(lang)).filter((ref) => ref.kind === TN_KIND).sort((a, b) => compareCodePoints(a.key, b.key))[0]
      if (tn !== undefined) await outlinesOf(o.source, lang, tn, origs.map((orig) => orig.book), outlines, issues, lastVerse)
    }
    // The tW names of the map, with the Strong keys and the verses of their links
    let twNames: Map<string, TwName> | undefined
    if (xmap !== undefined) {
      twNames = new Map()
      for (const [concept, keys] of Object.entries(xmap.core.strongs ?? {})) {
        if (!concept.startsWith('tw:names/')) continue
        const verses = xmap.parts.flatMap((part) => part.links?.get(concept) ?? [])
        twNames.set(concept, { strongs: keys, verses })
      }
    }
    const res: XtopicsSources = { ...TOPIC_SOURCES, ...t.releases }
    if (tn !== undefined) res.outlines = [tn.key, tagOf(tn.stamp)]
    const built = buildXtopics({ tipnr, events, obs, outlines, origs, res, twNames })
    report.push(...issues.map((line) => `topics: ${line}`), ...built.report.map((line) => `topics: ${line}`))
    const texts = [['tipnr', t.tipnr], ...Object.entries(t.theographic), ...[...t.obs].sort((a, b) => a[0] - b[0]).map(([n, text]) => [`obs ${n}`, text])]
    const rows = texts.map(([name, text]) => ({ layer: 'topics', key: `${name}|${sha256Hex(text)}` }))
    const stamps = [
      ...built.core.res.map(([key, release]) => ({ key, stamp: release })),
      ...origs.map((orig) => ({ key: orig.key, stamp: orig.stamp })),
    ]
    const inputs = inputsOf(rows, stamps)
    segments.push(await builtSegment(xtopicsSegment(built.core), inputs))
    for (const part of built.parts) segments.push(await builtSegment(xtopicsSegment(part), inputs))
    const topicKeys = new Set(built.core.res.map(([key]) => key))
    for (const [role, info] of Object.entries(TOPIC_CREDITS)) {
      const [key, release] = res[role as keyof typeof TOPIC_CREDITS]
      if (!topicKeys.has(key)) continue
      extra.push({ key, title: info.title, subject: 'Topics', release, license: info.license, attribution: info.attribution, books: bookSet(built.core.coverage.get(key)?.whole ?? []) })
    }
    // The tN the sections come from is a resource of the catalog (with mapLang it is already listed, for the map)
    if (tn !== undefined && topicKeys.has(tn.key)) {
      if (!listed.some((ref) => ref.key === tn!.key)) listed.push(tn)
      used.add(tn.key)
    }
  }

  segments.sort(compareSegments)
  const resources = [...catalogResources(listed, used), ...extra].sort((a, b) => compareCodePoints(a.key, b.key))
  const catalog = await buildCatalog({ about: { ...o.about, catalog: 'common' }, resources, segments })
  return { segments, catalog, report }
}
