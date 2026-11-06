/**
 * The map of a language (`spec/cddl/map.cddl`): the core (book names, concept names, subtitles, OBS titles, coverage and the
 * usage counts of the language's notes) and one part per book that has notes (the verses behind the usage). Count semantics are
 * `counts.md`; English notes (`xmap`) are never added to these. No Node module is used.
 */
import { BOOKS, bookNumber } from '../../ids'
import type { ArticleModel, BookModel, MapCore, MapPart, ObsModel } from '../../model'
import type { ResourceRef } from '../../source/rows'
import { compareCodePoints } from '../../codec/columns'
import { coverageOf } from '../maps/coverage'
import { Tally } from '../maps/tally'
import { expandRange } from '../maps/verses'
import { bookNames, conceptNames, obsTitles, subtitlesOf } from './names'

export type MapBuild = { core: MapCore; parts: MapPart[] }

const BOOK_CODES: ReadonlySet<string> = new Set(BOOKS)
const tagOf = (stamp: string): string => stamp.split('#')[0]

/**
 * The map of `lang`.
 *
 * - `usage`: one count per note row of each book model that has a concept; the verses are `from` to `to` among `verses` of the
 *   book (a note on 1:2-4 is 1 note and 3 verses). A core with no such row has no `usage`, and a book with no verse has no part.
 * - `coverage`: every resource of `refs`, whole for its books among those of `books`, or partial when `partial` (a bridged pack).
 * - `res`: every resource of `refs` by key, with its release tag.
 */
export function buildMap(o: {
  lang: string
  refs: ResourceRef[]
  books: { model: BookModel; verses: number[] }[]
  articles: ArticleModel[]
  obs: ObsModel | null
  bookNames?: Record<string, [string, string, string]>
  partial?: boolean
}): MapBuild {
  const books = [...o.books].sort((a, b) => bookNumber(a.model.book) - bookNumber(b.model.book))
  const usage = new Tally('notes')
  for (const { model, verses } of books) {
    for (const row of model.notes?.rows ?? []) {
      if (row.concept === undefined) continue
      usage.add(row.concept, model.book, expandRange(verses, row.from, row.to))
    }
  }
  // Only the books the pack built are covered: a book left out is "no source" (counts.md), not "zero".
  const built = new Set(books.map((b) => b.model.book))
  const refs = [...o.refs].sort((a, b) => compareCodePoints(a.key, b.key))
  const core: MapCore = {
    lang: o.lang,
    part: 'core',
    res: refs.map((ref) => [ref.key, tagOf(ref.stamp)]),
    books: bookNames(books.map((b) => b.model), o.bookNames),
    names: conceptNames(o.articles),
    coverage: coverageOf(refs.map((ref) => ({ ...ref, books: ref.books.filter((b) => BOOK_CODES.has(b) && built.has(b)) })), o.partial === true),
  }
  const subtitles = subtitlesOf(o.articles)
  if (Object.keys(subtitles).length > 0) core.subtitles = subtitles
  const table = usage.table()
  if (table.rows.size > 0) core.usage = table
  const titles = obsTitles(o.obs)
  if (titles !== undefined) core.obs = titles

  const parts: MapPart[] = []
  for (const book of usage.books()) {
    const lists = usage.verseLists(book)
    if (lists.size > 0) parts.push({ lang: o.lang, part: book, usage: lists })
  }
  return { core, parts }
}
