/** `search`: the hits of an index, with the cites and unit revisions they came from, and the books and the `obs` unit of the language that are not installed. No Node module here. */
import type { PackReader } from '../reader'
import type { Hit, SearchFilters, SearchIndex } from '../search/types'
import { type Answer, missingUnit, newAnswer, releaseOf, usedUnit } from './envelope'

/** The unit a hit comes from: the `obs` unit for book `obs`, else the book's. */
const unitOf = (book: string): string => (book === 'obs' ? 'obs' : `book:${book}`)

export async function searchQuery(
  reader: PackReader,
  index: SearchIndex,
  listedBooks: string[],
  text: string,
  filters: SearchFilters = {},
): Promise<Answer<Hit[]>> {
  const out = newAnswer<Hit[]>(reader, 'search')
  // The index may hold books this reader does not have active (a shared index, a book removed since): those hits are left out.
  const hits = (await index.search(reader.lang, text, filters)).filter((h) => reader.installed(unitOf(h.book)))
  out.data = hits
  const releases = new Map<string, readonly (readonly [string, string])[] | undefined>()
  for (const h of hits) {
    if (!releases.has(h.book)) {
      const unit = unitOf(h.book)
      releases.set(h.book, h.book === 'obs' ? (await reader.obs())?.res : (await reader.book(h.book))?.res)
      usedUnit(out, reader, unit)
    }
    out.cites.push({ res: h.res, release: releaseOf(releases.get(h.book), h.res), ...(h.id !== undefined ? { id: h.id } : {}), ref: `${h.book} ${h.ref}` })
  }
  for (const unit of listedBooks) {
    const book = unit === 'obs' ? 'obs' : unit.slice('book:'.length)
    if (filters.books !== undefined && !filters.books.includes(book)) continue
    // The kinds of the unit `obs`: a search for links only has nothing to find there.
    if (book === 'obs' && filters.kinds !== undefined && !filters.kinds.some((k) => k !== 'link')) continue
    const bytes = reader.size(unit)
    if (!reader.installed(unit) && bytes > 0) missingUnit(out, book === 'obs' ? { unit, bytes } : { book, unit, bytes })
  }
  return out
}
