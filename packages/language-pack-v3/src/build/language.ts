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
 * - **art**: the `sot` rows of the articles of the group, in the resources of those articles. A tA group also has the `sot` rows of
 *   every tA article, and one row `ta-config|{resource}/{manual}/config.yaml#{sha-256 of the text}` per config given: its
 *   `related` comes from all of them (`related.ts`). The `map` core has one row `ta-toc|{resource}/{manual}/toc.yaml#{sha-256 of the text}`
 *   per `toc.yaml` given: its titles are more names of the articles (`taToc.ts`). Any art group also has one row
 *   `role-hints|{map-language art segment id}` per map-language segment that held a hint for an article of the group, used or not (`roleHints`); **lex**: the `sot` rows of the
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
import type { About, ArticleModel, BookModel, CatalogResource, Complement, LexEntry, OrigModel } from '../model'
import { ORIGINALS, type ResourceRef, type Row, type RowSource } from '../source/rows'
import type { RoleHint } from './sections'
import { articleOfPath, articleResources, artSegment, extractArticles, type Kind } from './art'
import type { TaConfigs } from './related'
import { parseTaToc } from './taToc'
import { extractBook, isBookResource } from './bookHelps'
import { bookSegment } from './book'
import { type BuiltSegment, buildCatalog, builtSegment, compareSegments, needsOfBook } from './catalog'
import { extractLexicon, lexResources, lexSegment } from './lex'
import { extractObs, obsSegment } from './obs'
import { parseObsTf } from '../source/obsTf'
import { extractText } from './bookTexts'
import { extractOrig, OrigIndex, origSegment } from './orig'
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
import { chunksOfText, chunksTable } from './topics/chunks'
import { parseObsFrames } from '../source/obsFrames'
import { buildXtopics, chapterLengths, type MapsInput, type TwName, type XtopicsSources } from './topics/xtopics'
import { buildBasemap } from './basemap'
import BORN_DIED_EXCLUDE from './topics/born-died-exclude.json'
import PLACE_NAMES from './topics/place-names.json'
import ROUTES from './topics/routes.json'
import { parseOpenBible } from '../source/openbible'
import { parseObsRefs } from '../source/obsRefs'
import { ACAI_SOURCE, type AcaiPerson, type AcaiPlace, parseAcai, parseAcaiPlaces } from '../source/acai'
import { parseTheographic, parseTheographicAll } from '../source/theographic'
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

/**
 * The Five Movements manual of a language (`obs.cddl`, "OBS Five Movements") as `buildLanguage` takes it: the files of the release of
 * the OBS Theological Formation resource (`obs_story_{N}.md`, `transclusions/{name}.md`), and what the catalog says of the resource.
 * `key` is the resource key (`unfoldingWord/en/obs-tf`) and `release` its tag (`v4`).
 */
export type ObsTfInput = {
  key: string
  release: string
  title: string
  license: string
  rights?: string
  attribution: string
  files: ReadonlyMap<string, string>
}

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
 * - **Own originals.** With `withOrig: true` it also builds the `orig` segment of each book it builds, the same bytes {@link buildCommon}
 *   makes from the same source, lists it as a unit of this catalog and lists the originals it names among the resources. The
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
  /** `acai`: the ACAI people ({@link parseAcai}) and its release: the `people` table of the topics core (`ids.md`, "Names of people"). */
  topics?: { xtopics: XtopicsCore; records: TipnrRecord[]; acai?: { people: AcaiPerson[]; places?: AcaiPlace[]; release: string } }
  aligned?: boolean
  /** The Five Movements manual: the tables `tf-*` of the `obs` segment. Off by default: without it every segment is the same bytes. The build throws when the manual has errors (`obs-5m-checks.md`). */
  obsTf?: ObsTfInput
  withOrig?: boolean
  taConfigs?: TaConfigs
  /** The text of the `toc.yaml` of each manual of each tA resource: its titles are more names of the articles. */
  taTocs?: Map<string, Map<string, string>>
  /** The roles of the same articles in the map language ({@link RoleHint}), by article id; `roleHintSegs` says the id (hex) of the map-language `art` segment each came from. */
  roleHints?: Map<string, RoleHint>
  roleHintSegs?: Map<string, string>
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
    const origIssues: string[] = []
    const orig = await extractOrig(source, book, origIssues, { macula: o.withOrig === true })
    if (o.withOrig === true) issues.push(...origIssues)
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
  const { groups: articles, registry } = await extractArticles(source, lang, o.registry, artIssues, o.taConfigs, o.roleHints)
  report.push(...scoped(artIssues, artScope))
  const artRows = await articleRowKeys(source, lang, articles)
  // The `related` of a tA article comes from every tA text and from the configs: they are inputs of each tA group.
  const taRows = [...artRows].filter(([group]) => group.startsWith('ta:')).flatMap(([, rows]) => rows)
  const configRows = (keys: string[]): RowKey[] =>
    keys.flatMap((key) => [...(o.taConfigs?.get(key) ?? [])].map(([manual, text]) => ({ layer: 'ta-config', key: `${key}/${manual}/config.yaml#${sha256Hex(text)}` })))
  for (const [group, list] of articles) {
    const res = articleResources(list, refs)
    const keys = res.map(([key]) => key)
    const rows = group.startsWith('ta:') ? [...taRows, ...configRows(keys)] : [...(artRows.get(group) ?? [])]
    // The map language's articles that held a hint for an article of this group are an input, used or not (an unused hint may be used
    // once the article changes): one row per map-language segment that supplied a hint.
    const hintSegs = [...new Set(list.filter((a) => o.roleHints?.has(a.id) === true).map((a) => o.roleHintSegs?.get(a.id)).filter((seg): seg is string => seg !== undefined))].sort()
    for (const seg of hintSegs) rows.push({ layer: 'role-hints', key: seg })
    await add(artSegment(lang, group, res, list), inputsOf(rows, stampsOf(keys)), keys)
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
  let obsTfResource: CatalogResource | undefined
  /** The names of the language map (titles of the articles in this language): the names of people come from them (`ids.md`). */
  let mapNames: Record<string, string[]> = {}
  let acaiResource: CatalogResource | undefined
  const obsIssues: string[] = []
  const obs = await extractObs(source, lang, obsIssues)
  report.push(...obsIssues.map((line) => `obs: ${line}`))
  if (obs === null && o.obsTf !== undefined) throw new Error(`The OBS 5M manual ${o.obsTf.key} was given, and ${lang} has no Open Bible Stories for it to go with`)
  if (obs !== null) {
    const keys = obs.res.map(([key]) => key)
    const rows: RowKey[] = []
    for (const resource of keys) await addKeys(rows, source.rows({ lang, resource, layer: 'sot' }))
    let model = obs
    let stamps = stampsOf(keys)
    if (o.obsTf !== undefined) {
      // The manual is the segment's own: `obs` (for the map and the inputs of the rows) stays as the source gave it.
      const tf = o.obsTf
      const parsed = parseObsTf(tf.files, tf.key, obs.stories, lang)
      report.push(...parsed.warnings.map((line) => `obs-tf: ${line}`))
      if (parsed.errors.length > 0) throw new Error(`The OBS 5M manual ${tf.key} ${tf.release} has errors:\n${parsed.errors.join('\n')}`)
      if (obs.res.some(([key]) => key === tf.key)) throw new Error(`${tf.key} is also a resource of the source`)
      const res = [...obs.res, [tf.key, tf.release] as [string, string]].sort((a, b) => compareCodePoints(a[0], b[0]))
      model = { ...obs, res, tf: parsed.model }
      for (const [name, text] of [...tf.files].sort((a, b) => compareCodePoints(a[0], b[0]))) rows.push({ layer: 'obs-tf', key: `${name}|${sha256Hex(text)}` })
      stamps = [...stamps, { key: tf.key, stamp: tf.release }]
      const resource: CatalogResource = { key: tf.key, title: tf.title, subject: 'OBS Theological Formation', release: tf.release, license: tf.license, attribution: tf.attribution, books: bookSet([]) }
      if (tf.rights !== undefined) resource.rights = tf.rights
      obsTfResource = resource
    }
    // The stories are shown with the titles and book names of the map: the unit needs it.
    const built = await add(obsSegment(model), inputsOf(rows, stamps), keys)
    needs.set(built.id, ['map'])
  }

  // The language map: the notes counted by concept, the names of books and concepts, the coverage of every resource
  if (refs.length > 0) {
    // The toc titles of each tA article, by id; a link that is not an article of the build is left out.
    const articleIds = new Set([...articles.values()].flat().map((a) => a.id))
    const tocTitles = new Map<string, string[]>()
    const tocRows: RowKey[] = []
    // Code point order, so the names and the input rows do not depend on the order of the caller's Maps.
    const byCodePoint = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0)
    for (const [key, manuals] of [...(o.taTocs ?? [])].sort((a, b) => byCodePoint(a[0], b[0]))) {
      for (const [manual, text] of [...manuals].sort((a, b) => byCodePoint(a[0], b[0]))) {
        tocRows.push({ layer: 'ta-toc', key: `${key}/${manual}/toc.yaml#${sha256Hex(text)}` })
        for (const [link, title] of parseTaToc(text, report, `${key}/${manual}/toc.yaml`)) {
          const id = `ta:${manual}/${link.toLowerCase()}`
          if (articleIds.has(id)) tocTitles.set(id, [...(tocTitles.get(id) ?? []), title])
        }
      }
    }
    const built = buildMap({ lang, refs, books: mapBooks, articles: [...articles.values()].flat(), obs, bookNames: o.bookNames, partial: o.partial, tocTitles })
    mapNames = built.core.names
    const all = refs.map((ref) => ref.key)
    const coreRows: RowKey[] = [...[...mapRows.values()].flat(), ...tocRows]
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
      ...(o.topics.acai === undefined ? {} : { acai: { people: o.topics.acai.people, ...(o.topics.acai.places === undefined ? {} : { places: o.topics.acai.places }), res: [ACAI_SOURCE.key, o.topics.acai.release] as [string, string] }, mapNames }),
    })
    report.push(...issues.map((line) => `topics: ${line}`), ...built.report.map((line) => `topics: ${line}`))
    const rows: RowKey[] = [...mapRows.values()].flat()
    if (tn !== undefined) for (const book of origs.keys()) if (tn.books.includes(book)) await addKeys(rows, source.rows({ lang, book, resource: tn.key }))
    if (obs !== null) for (const resource of obs.res.map(([key]) => key)) await addKeys(rows, source.rows({ lang, resource, layer: 'sot' }))
    // The point of a TIPNR place is read by the common core only: it is not part of what a language was built from, so a language catalog does not change without the maps
    rows.push({ layer: 'topics', key: `tipnr|${sha256Hex(JSON.stringify(o.topics.records.map(({ point: _point, ...record }) => record)))}` }, { layer: 'topics', key: `xtopics|${sha256Hex([...xt.topics.keys()].join('\n'))}` })
    const acaiNames = built.core.people !== undefined || built.core.places !== undefined
    if (acaiNames) {
      rows.push({ layer: 'topics', key: `acai|${sha256Hex(JSON.stringify(o.topics.acai!.people))}` })
      if (built.core.places !== undefined) rows.push({ layer: 'topics', key: `acai-places|${sha256Hex(JSON.stringify(o.topics.acai!.places))}` })
      const credit = acaiCredit(built.core.places !== undefined)
      acaiResource = { key: ACAI_SOURCE.key, title: credit.title, subject: 'Topics', release: o.topics.acai!.release, license: credit.license, attribution: credit.attribution, books: bookSet([]) }
    }
    const keys = built.core.res.map(([key]) => key)
    const inputs = inputsOf(rows, [...stampsOf(keys.filter((key) => refOf.has(key))), ...xt.res.map(([key, stamp]) => ({ key, stamp })), ...(acaiNames ? [{ key: ACAI_SOURCE.key, stamp: o.topics.acai!.release }] : [])])
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
    resources: [...catalogResources(refs, used), ...catalogResources(originals, usedOriginals), ...(obsTfResource === undefined ? [] : [obsTfResource]), ...(acaiResource === undefined ? [] : [acaiResource])],
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

/** The English ULT, the source of the section map (`chunks` of the xtopics core). */
const ULT_LANG = 'en'
const ULT_KEY = 'unfoldingWord/en/ult'

/** The source of the `obs-frames` table of the xtopics core (`spec/fuentes.md`), at its pinned commit. */
export const OBS_FRAMES_SOURCE = {
  key: 'bcv-commons/bible-story-builder',
  release: 'c07d4539',
  title: 'Bible Story Builder: the verses of each Open Bible Stories frame',
  license: 'MIT',
  attribution:
    'Bible Story Builder (https://github.com/bcv-commons/bible-story-builder), templates/OBS at commit c07d45395d01b987c31f4e06871314f129c975e8. ' +
    'MIT License. Copyright (c) 2024 unfoldingWord Box3. ' +
    'Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions: ' +
    'The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software. ' +
    'THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE. ' +
    'Changed: only the verse references of the OBS frames were read, as verse ids, each range within one chapter.',
} as const

/** What the catalogs say of ACAI (`spec/fuentes.md`): the common for `gender` and the `same-as` of ACAI, a language for `people`. */
export const ACAI_CREDIT = {
  title: 'ACAI Biblical Entity Data: people',
  license: 'CC-BY-SA-4.0',
  attribution:
    'ACAI Biblical Entity Data © 2024 BiblioNexus (https://github.com/BibleAquifer/ACAI), CC BY-SA 4.0 (https://creativecommons.org/licenses/by-sa/4.0/). Changed: only the gender, the names and other names in six languages and the uW Translation Words titles of the people were extracted, joined to TIPNR and reduced; the names are reproduced where the pack cannot derive them',
} as const

/** The catalog's words for ACAI when its places are used too (`spec/fuentes.md`). */
export function acaiCredit(places: boolean): { title: string; license: string; attribution: string } {
  if (!places) return ACAI_CREDIT
  return {
    title: 'ACAI Biblical Entity Data: people and places',
    license: ACAI_CREDIT.license,
    attribution:
      'ACAI Biblical Entity Data © 2024 BiblioNexus (https://github.com/BibleAquifer/ACAI), CC BY-SA 4.0 (https://creativecommons.org/licenses/by-sa/4.0/). Changed: only the gender of people, the names and other names of people and places in six languages, the type of places and the uW Translation Words titles were extracted, joined to TIPNR and reduced; the names are reproduced where the pack cannot derive them',
  }
}

/** OpenBible.info Bible Geocoding Data (`spec/fuentes.md`): the points of the places, with their certainty. */
export const OPENBIBLE_SOURCE = {
  key: 'openbibleinfo/Bible-Geocoding-Data',
  release: '7eb18a5e',
  title: 'OpenBible.info Bible Geocoding Data',
  license: 'CC-BY-4.0',
  attribution: 'Bible Geocoding Data, OpenBible.info (https://github.com/openbibleinfo/Bible-Geocoding-Data), CC BY 4.0. Changed: only the best point, a certainty level and the place type',
} as const

/** The `basemap` complement of the common catalog (`spec/catalog.md`): what the catalog says of it. */
export const BASEMAP_LICENSE = 'Public domain (Natural Earth 10m: land 5.1.1, lakes 5.0.0, rivers_lake_centerlines 5.0.0; made with Natural Earth)'

/** The keys and pinned releases of the sources of the common topics (`spec/fuentes.md`). */
const TOPIC_SOURCES: Omit<XtopicsSources, 'outlines' | 'acai' | 'openbible'> = {
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
    /** The `templates/OBS/<category>/<story>.md` files of bible-story-builder (path below `templates/OBS` to text): the `obs-frames` table */
    frames?: Map<string, string>
    /** The trimmed ACAI people (`acai/people.json`, `trimAcai`): the `gender` table and the `same-as` of ACAI */
    acai?: string
    /**
     * The maps: `openbible` (`openbible/ancient.jsonl`) and `acaiPlaces` (`acai/places.json`, `trimAcaiPlaces`) give `geo`, `routes`, `born-in`, `died-in` and the
     * `same-as` of places; they need `acai`. The three zips of Natural Earth (`basemap`) give the complement `basemap`.
     */
    maps?: {
      openbible: string
      acaiPlaces: string
      basemap?: { land: Uint8Array; lakes: Uint8Array; rivers: Uint8Array }
      /** The builder's lists in place of the bundled ones (`routes.json`, `born-died-exclude.json`, `place-names.json`): for tests with a subset of the sources. */
      lists?: Pick<MapsInput, 'routes' | 'exclude' | 'placeNames'>
    }
  }
}): Promise<{ segments: BuiltSegment[]; catalog: BuiltSegment; report: string[]; complements: { complement: Complement; bytes: Uint8Array }[] }> {
  const refs = await o.source.resources(ORIGINALS)
  const books = o.books === undefined ? booksOf(refs) : canonical(o.books)
  const segments: BuiltSegment[] = []
  const used = new Set<string>()
  const origs: OrigModel[] = []
  const origRows = new Map<string, RowKey[]>()
  const origReport: string[] = []
  for (const book of books) {
    const bookIssues: string[] = []
    const orig = await extractOrig(o.source, book, bookIssues)
    origReport.push(...bookIssues.map((line) => `book ${book}: ${line}`))
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

  const report: string[] = [...origReport]
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
    const { events, birthDeath } = t.maps === undefined ? { events: parseTheographic(t.theographic, issues), birthDeath: [] } : parseTheographicAll(t.theographic, issues)
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
    // ACAI: the people, and the English titles of the tW names its same-as compares with
    let acai: AcaiPerson[] | undefined
    let twTitles: Map<string, string> | undefined
    const twUsed: { key: string; stamp: string }[] = []
    if (t.acai !== undefined) {
      const parsed = parseAcai(t.acai)
      acai = parsed.people
      res.acai = [ACAI_SOURCE.key, parsed.commit.slice(0, 8)]
      if (t.maps !== undefined && parseAcaiPlaces(t.maps.acaiPlaces).commit !== parsed.commit) throw new Error('acai/places.json and acai/people.json are of different commits of ACAI')
      if (lang !== undefined) {
        twTitles = new Map()
        for (const ref of (await o.source.resources(lang)).filter((r) => r.kind === 'Translation Words').sort((a, b) => compareCodePoints(a.key, b.key))) {
          twUsed.push({ key: ref.key, stamp: tagOf(ref.stamp) })
          for await (const row of o.source.rows({ lang, resource: ref.key, layer: 'text' })) {
            const m = /^helps-text:tw-title:([^@]+)@[^:]*:(names\/[A-Za-z0-9_-]+)$/.exec(row.key)
            const value = row.value as { content?: unknown } | null
            if (m === null || m[1] !== ref.key || typeof value !== 'object' || value === null || typeof value.content !== 'string') continue
            const concept = `tw:${m[2].toLowerCase()}`
            if (!twTitles.has(concept)) twTitles.set(concept, value.content)
          }
        }
      }
    }
    let maps: MapsInput | undefined
    if (t.maps !== undefined) {
      if (t.acai === undefined) throw new Error('topics.maps needs topics.acai: the places of ACAI are read with the people')
      maps = {
        openbible: parseOpenBible(t.maps.openbible, issues),
        acaiPlaces: parseAcaiPlaces(t.maps.acaiPlaces).places,
        birthDeath,
        routes: t.maps.lists?.routes ?? ROUTES,
        exclude: t.maps.lists?.exclude ?? (BORN_DIED_EXCLUDE as MapsInput['exclude']),
        placeNames: t.maps.lists?.placeNames ?? PLACE_NAMES,
      }
      res.openbible = [OPENBIBLE_SOURCE.key, OPENBIBLE_SOURCE.release]
    }
    const built = buildXtopics({ tipnr, events, obs, outlines, origs, res, twNames, ...(acai === undefined ? {} : { acai, twTitles }), ...(maps === undefined ? {} : { maps }) })
    report.push(...issues.map((line) => `topics: ${line}`), ...built.report.map((line) => `topics: ${line}`))
    const resWithoutUlt = built.core.res
    // The section map: the sections of the English ULT (its ts milestones), per book of the originals built
    const ult = (await o.source.resources(ULT_LANG)).find((ref) => ref.key === ULT_KEY)
    const chunkRows: RowKey[] = []
    if (ult === undefined) report.push(`topics: chunks: the source has no ${ULT_KEY}: the xtopics have no section map`)
    else {
      const byBook = new Map<string, [number, number][]>()
      const noBreaks: string[] = []
      const noBook: string[] = []
      const noVerses: string[] = []
      let unplaced = 0
      for (const orig of origs) {
        if (!ult.books.includes(orig.book)) {
          noBook.push(orig.book)
          continue
        }
        const rows: Row[] = []
        for (const layer of ['sot', 'quote']) {
          for await (const row of o.source.rows({ lang: ULT_LANG, book: orig.book, resource: ult.key, layer })) {
            rows.push(row)
            chunkRows.push({ layer: row.layer, key: row.key })
          }
        }
        const alignIssues: string[] = []
        const text = extractText(rows, orig.book, ult.key, new OrigIndex(orig), alignIssues)
        unplaced += alignIssues.length
        const origVerses = versesOf(orig)
        const list = chunksOfText(text, orig.book, origVerses)
        if (!origVerses.some((v) => v % 1000 !== 0 && Math.floor((v % 1_000_000) / 1000) > 0)) noVerses.push(orig.book)
        else if (list.length === 0) noBreaks.push(orig.book)
        else byBook.set(orig.book, list)
      }
      if (noBook.length > 0) report.push(`topics: chunks: ${ULT_KEY} does not have ${noBook.join(', ')}: no sections for them`)
      if (noVerses.length > 0) report.push(`topics: chunks: the original of ${noVerses.join(', ')} has no verses: no sections for them`)
      if (noBreaks.length > 0) report.push(`topics: chunks: ${noBreaks.join(', ')} have no ts milestone in ${ULT_KEY}: no sections for them`)
      if (unplaced > 0) report.push(`topics: chunks: ${unplaced} issues reading the text of ${ULT_KEY} (alignment); the sections do not depend on them`)
      const table = chunksTable(byBook)
      if (Object.keys(table).length > 0) {
        built.core.chunks = table
        built.core.res = [...built.core.res, [ult.key, tagOf(ult.stamp)] as [string, string]].sort((a, b) => compareCodePoints(a[0], b[0]))
        built.core.coverage.set(ult.key, { whole: [...byBook.keys()].sort((a, b) => bookNumber(a) - bookNumber(b)), partial: [] })
      } else if (noBook.length + noVerses.length + noBreaks.length === 0) report.push(`topics: chunks: no book of the originals was built: the xtopics have no section map`)
    }
    // The verses of each OBS frame (bible-story-builder): the core only, like the section map
    const frameRows: RowKey[] = []
    if (t.frames === undefined) report.push('topics: obs-frames: no bible-story-builder files: the xtopics have no frame map')
    else {
      const frameReport: string[] = []
      const frames = parseObsFrames(t.frames, frameReport, lastVerse)
      // The frames whose verses are not all in their story's ranges (the closing line of English OBS): reported, not dropped
      const outside: string[] = []
      for (const [frame, list] of frames) {
        const story = built.core.ranges?.[`obs:${frame.split(':')[0]}`]
        if (story === undefined) continue
        if (list.some(([a, b]) => !story.some(([x, y]) => x <= a && b <= y))) outside.push(frame)
      }
      if (outside.length > 0) frameReport.push(`obs-frames: ${outside.length} frames have verses outside their story's ranges: ${outside.join(', ')}`)
      report.push(...frameReport.map((line) => `topics: ${line}`))
      if (frames.size > 0) {
        built.core.obsFrames = Object.fromEntries(frames)
        built.core.res = [...built.core.res, [OBS_FRAMES_SOURCE.key, OBS_FRAMES_SOURCE.release] as [string, string]].sort((a, b) => compareCodePoints(a[0], b[0]))
        const books = [...new Set([...frames.values()].flat(2).map((v) => BOOKS[Math.floor(v / 1_000_000) - 1]))].sort((a, b) => bookNumber(a) - bookNumber(b))
        built.core.coverage.set(OBS_FRAMES_SOURCE.key, { whole: [], partial: books })
        for (const [path, text] of [...t.frames].sort((a, b) => compareCodePoints(a[0], b[0]))) frameRows.push({ layer: 'topics', key: `obs-frames ${path}|${sha256Hex(text)}` })
        extra.push({ key: OBS_FRAMES_SOURCE.key, title: OBS_FRAMES_SOURCE.title, subject: 'Topics', release: OBS_FRAMES_SOURCE.release, license: OBS_FRAMES_SOURCE.license, attribution: OBS_FRAMES_SOURCE.attribution, books: bookSet(books) })
      }
    }
    const texts = [['tipnr', t.tipnr], ...Object.entries(t.theographic), ...[...t.obs].sort((a, b) => a[0] - b[0]).map(([n, text]) => [`obs ${n}`, text])]
    // The maps are read by the core only (geo, routes, born-in, died-in, the places of ACAI): the parts keep the inputs and bytes of a build without them
    const mapsRows =
      t.maps === undefined
        ? []
        : [
            { layer: 'topics', key: `openbible|${sha256Hex(t.maps.openbible)}` },
            { layer: 'topics', key: `acai-places|${sha256Hex(t.maps.acaiPlaces)}` },
            { layer: 'topics', key: `maps-lists|${sha256Hex(JSON.stringify([t.maps.lists?.routes ?? ROUTES, t.maps.lists?.exclude ?? BORN_DIED_EXCLUDE, t.maps.lists?.placeNames ?? PLACE_NAMES]))}` },
          ]
    const rows = texts.map(([name, text]) => ({ layer: 'topics', key: `${name}|${sha256Hex(text)}` }))
    // ACAI is read by the core only (gender, same-as): the parts keep the inputs and bytes of a build without it
    const acaiUsed = res.acai !== undefined && built.core.res.some(([key]) => key === res.acai![0])
    const openbibleUsed = res.openbible !== undefined && built.core.res.some(([key]) => key === res.openbible![0])
    const acaiRows = acaiUsed ? [{ layer: 'topics', key: `acai|${sha256Hex(t.acai!)}` }] : []
    const stamps = [
      ...resWithoutUlt.filter(([key]) => key !== res.acai?.[0] && key !== res.openbible?.[0]).map(([key, release]) => ({ key, stamp: release })),
      ...origs.map((orig) => ({ key: orig.key, stamp: orig.stamp })),
    ]
    const inputs = inputsOf(rows, stamps)
    // The core also reads the rows of the ULT; the parts do not, so their inputs and bytes are those of a build without it
    const coreStamps = [
      ...stamps,
      ...(built.core.chunks === undefined ? [] : [{ key: ult!.key, stamp: tagOf(ult!.stamp) }]),
      ...(built.core.obsFrames === undefined ? [] : [{ key: OBS_FRAMES_SOURCE.key, stamp: OBS_FRAMES_SOURCE.release }]),
      // ACAI's same-as compares its titles with those of the tW of the map language: that tW is an input of the core too
      ...(acaiUsed ? [{ key: res.acai![0], stamp: res.acai![1] }, ...twUsed] : []),
      ...(openbibleUsed ? [{ key: res.openbible![0], stamp: res.openbible![1] }] : []),
    ]
    const coreInputs = built.core.chunks === undefined && built.core.obsFrames === undefined && !acaiUsed && !openbibleUsed ? inputs : inputsOf([...rows, ...chunkRows, ...frameRows, ...acaiRows, ...mapsRows], coreStamps)
    segments.push(await builtSegment(xtopicsSegment(built.core), coreInputs))
    for (const part of built.parts) segments.push(await builtSegment(xtopicsSegment(part), inputs))
    const topicKeys = new Set(built.core.res.map(([key]) => key))
    for (const [role, info] of Object.entries(TOPIC_CREDITS)) {
      const [key, release] = res[role as keyof typeof TOPIC_CREDITS]
      if (!topicKeys.has(key)) continue
      extra.push({ key, title: info.title, subject: 'Topics', release, license: info.license, attribution: info.attribution, books: bookSet(built.core.coverage.get(key)?.whole ?? []) })
    }
    if (acaiUsed) {
      const credit = acaiCredit(maps !== undefined)
      extra.push({ key: res.acai![0], title: credit.title, subject: 'Topics', release: res.acai![1], license: credit.license, attribution: credit.attribution, books: bookSet([]) })
    }
    if (openbibleUsed) extra.push({ key: OPENBIBLE_SOURCE.key, title: OPENBIBLE_SOURCE.title, subject: 'Topics', release: OPENBIBLE_SOURCE.release, license: OPENBIBLE_SOURCE.license, attribution: OPENBIBLE_SOURCE.attribution, books: bookSet([]) })
    if (ult !== undefined && built.core.chunks !== undefined) {
      if (!listed.some((ref) => ref.key === ult.key)) listed.push(ult)
      used.add(ult.key)
    }
    // The tN the sections come from is a resource of the catalog (with mapLang it is already listed, for the map)
    if (tn !== undefined && topicKeys.has(tn.key)) {
      if (!listed.some((ref) => ref.key === tn!.key)) listed.push(tn)
      used.add(tn.key)
    }
  }

  const complements: { complement: Complement; bytes: Uint8Array }[] = []
  if (o.topics?.maps?.basemap !== undefined) {
    const built = buildBasemap(o.topics.maps.basemap, report)
    complements.push({ complement: { kind: 'basemap', id: built.id, size: built.bytes.length, media: 'application/cbor', version: '1', license: BASEMAP_LICENSE }, bytes: built.bytes })
  }
  segments.sort(compareSegments)
  const resources = [...catalogResources(listed, used), ...extra].sort((a, b) => compareCodePoints(a.key, b.key))
  const catalog = await buildCatalog({ about: { ...o.about, catalog: 'common' }, resources, segments, ...(complements.length === 0 ? {} : { complements: complements.map((c) => c.complement) }) })
  return { segments, catalog, report, complements }
}
