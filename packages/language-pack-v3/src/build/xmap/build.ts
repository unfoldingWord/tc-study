import { compareCodePoints } from '../../codec/columns'
import type { VerseLists } from '../../codec/counts'
import { bookNumber } from '../../ids'
import type { Concept, CountTable, OrigModel, XmapCore, XmapPart } from '../../model'
import type { ResourceRef, Row, RowFilter, RowSource } from '../../source/rows'
import { ORIGINALS } from '../../source/rows'
import { conceptRefs, tallyRefs } from '../maps/conceptRefs'
import { coverageOf } from '../maps/coverage'
import { Tally } from '../maps/tally'
import { versesOf } from '../maps/verses'
import { strongTally } from './strong'
import { strongsOfQuotes, strongsRecord } from './strongs'

export type XmapBuild = { core: XmapCore; parts: XmapPart[]; report: string[] }

const TN_SUBJECT = 'TSV Translation Notes'
const TWL_SUBJECT = 'TSV Translation Words Links'
const TW_SUBJECT = 'Translation Words'
const TA_SUBJECT = 'Translation Academy'

/** `helps-text:tw-title:{res}@{stamp}:{path}` and the same for `ta-title`: the rows that name every article. */
const TITLE_KEY = /^helps-text:(tw|ta)-title:([^@]+)@[^:]*:(.+)$/
const TW_PATH = /^(kt|names|other)\/[A-Za-z0-9_-]+$/
const TA_PATH = /^[a-z0-9_-]+\/[A-Za-z0-9_-]+$/

const tagOf = (stamp: string): string => stamp.split('#')[0]
const byKey = (a: ResourceRef, b: ResourceRef): number => compareCodePoints(a.key, b.key)

async function collect(source: RowSource, f: RowFilter): Promise<Row[]> {
  const out: Row[] = []
  for await (const row of source.rows(f)) out.push(row)
  return out
}

/** Adds the rows of `from` to `into`; a key and book pair is counted by one original, so cells never collide. */
function mergeRows(into: CountTable['rows'], from: CountTable['rows']): void {
  for (const [key, byBook] of from) {
    const have = into.get(key)
    if (have === undefined) into.set(key, new Map(byBook))
    else for (const [book, cell] of byBook) have.set(book, cell)
  }
}

/** The rows with the books of each key in canonical order. */
function sortedRows(rows: CountTable['rows']): CountTable['rows'] {
  const out: CountTable['rows'] = new Map()
  for (const [key, byBook] of rows) out.set(key, new Map([...byBook].sort((a, b) => bookNumber(a[0]) - bookNumber(b[0]))))
  return out
}

/**
 * The common map of a set of original books and the English resources of `lang`: the core and one part per book.
 *
 * - Sources: the originals (`strong`), the tN of the language (`notes`), the tWL (`links`, `strongs`), the tW and tA articles
 *   (`concepts`). A concept comes from a note or a link, or from the title of an article; its `source` is the tW or tA
 *   resource, its `tw` category the one in the id (`tw:kt/grace` is `kt`; every `ta:` concept is `none`), its `kind` `none`.
 * - `res`: the originals first, then every other source, each by key, with its release tag.
 * - Coverage: the originals, the tN and the tWL, whole for the books of `origs` they have.
 * - Parts: one per book of `origs`, in canonical order; a book with no verse list in any table has none.
 */
export async function buildXmap(o: { source: RowSource; origs: OrigModel[]; lang: string }): Promise<XmapBuild> {
  const { source, lang } = o
  const report: string[] = []
  const origs = [...o.origs].sort((a, b) => bookNumber(a.book) - bookNumber(b.book))
  for (let i = 1; i < origs.length; i++) if (origs[i].book === origs[i - 1].book) throw new Error(`Two originals for the book ${origs[i].book}`)

  const originals = (await source.resources(ORIGINALS)).filter((ref) => origs.some((orig) => orig.key === ref.key)).sort(byKey)
  for (const orig of origs) if (!originals.some((ref) => ref.key === orig.key)) throw new Error(`The source has no original ${orig.key}`)
  const refs = await source.resources(lang)
  const ofKind = (subject: string): ResourceRef[] => refs.filter((ref) => ref.kind === subject).sort(byKey)
  const tns = ofKind(TN_SUBJECT)
  const twls = ofKind(TWL_SUBJECT)
  const tws = ofKind(TW_SUBJECT)
  const tas = ofKind(TA_SUBJECT)

  const others = [...tns, ...twls, ...tws, ...tas].sort(byKey)
  const res: [string, string][] = [...originals, ...others].map((ref) => [ref.key, tagOf(ref.stamp)])

  // Strong
  const strongRows: CountTable['rows'] = new Map()
  const strongLists = new Map<string, VerseLists>()
  for (const orig of origs) {
    const tally = strongTally(orig)
    mergeRows(strongRows, tally.table().rows)
    strongLists.set(orig.book, tally.verseLists(orig.book))
  }

  // Notes, links and the Strong keys of the links
  const notes = new Tally('notes')
  const links = new Tally('links')
  const strongs = new Map<string, Set<string>>()
  for (const orig of origs) {
    const verses = versesOf(orig)
    for (const ref of tns) {
      if (!ref.books.includes(orig.book)) continue
      const rows = await collect(source, { lang, book: orig.book, resource: ref.key })
      tallyRefs(notes, orig.book, conceptRefs(rows, orig.book, ref.key, 'notes', report), verses)
    }
    for (const ref of twls) {
      if (!ref.books.includes(orig.book)) continue
      const rows = await collect(source, { lang, book: orig.book, resource: ref.key })
      tallyRefs(links, orig.book, conceptRefs(rows, orig.book, ref.key, 'links', report), verses)
      strongsOfQuotes(rows, orig.book, ref.key, orig, strongs)
    }
  }

  // Concepts
  const concepts = new Map<string, Concept>()
  const sourceOf = (id: string): string => {
    const list = id.startsWith('tw:') ? tws : tas
    if (list.length === 0) throw new Error(`The concept ${id} needs a ${id.startsWith('tw:') ? 'tW' : 'tA'} resource of ${lang}, and there is none`)
    return list[0].key
  }
  const addConcept = (id: string, key?: string): void => {
    if (concepts.has(id)) return
    const category = id.startsWith('tw:') ? /^tw:([^/]+)\//.exec(id)?.[1] : undefined
    const tw = category === 'kt' || category === 'names' || category === 'other' ? category : 'none'
    concepts.set(id, { kind: 'none', tw, source: key ?? sourceOf(id) })
  }
  for (const tally of [notes, links]) for (const key of tally.table().rows.keys()) addConcept(key)
  for (const ref of [...tws, ...tas]) {
    for (const row of await collect(source, { lang, resource: ref.key, layer: 'text' })) {
      const m = TITLE_KEY.exec(row.key)
      if (m === null || m[2] !== ref.key) continue
      const [, kind, , path] = m
      if (!(kind === 'tw' ? TW_PATH : TA_PATH).test(path)) continue
      addConcept(`${kind}:${path.toLowerCase()}`, ref.key)
    }
  }

  const core: XmapCore = {
    part: 'core',
    res,
    coverage: coverageOf(
      [...originals, ...tns, ...twls].map((ref) => ({ ...ref, books: ref.books.filter((book) => origs.some((orig) => orig.book === book)) })),
      false,
    ),
    strong: { unit: 'occurrences', rows: sortedRows(strongRows) },
    concepts: new Map([...concepts].sort((a, b) => compareCodePoints(a[0], b[0]))),
  }
  if (twls.length > 0) core.links = links.table()
  if (tns.length > 0) core.notes = notes.table()
  const record = strongsRecord(strongs)
  if (Object.keys(record).length > 0) core.strongs = record

  const parts: XmapPart[] = []
  for (const orig of origs) {
    const strong = strongLists.get(orig.book) ?? new Map()
    const part: XmapPart = { part: orig.book, strong }
    const l = links.verseLists(orig.book)
    const n = notes.verseLists(orig.book)
    if (twls.length > 0) part.links = l
    if (tns.length > 0) part.notes = n
    if (strong.size === 0 && l.size === 0 && n.size === 0) continue
    parts.push(part)
  }
  return { core, parts, report }
}
