/** `search`: the hits of an index, with the cites and unit revisions they came from, and the books of the language that are not installed. No Node module here. */
import type { PackReader } from '../reader'
import type { Hit, SearchFilters, SearchIndex } from '../search/types'
import { type Answer, missingUnit, newAnswer, releaseOf, usedUnit } from './envelope'

export async function searchQuery(
  reader: PackReader,
  index: SearchIndex,
  listedBooks: string[],
  text: string,
  filters: SearchFilters = {},
): Promise<Answer<Hit[]>> {
  const out = newAnswer<Hit[]>(reader, 'search')
  const hits = await index.search(reader.lang, text, filters)
  out.data = hits
  const releases = new Map<string, readonly (readonly [string, string])[] | undefined>()
  for (const h of hits) {
    if (!releases.has(h.book)) {
      const unit = `book:${h.book}`
      releases.set(h.book, reader.installed(unit) ? (await reader.book(h.book))?.res : undefined)
      usedUnit(out, reader, unit)
    }
    out.cites.push({ res: h.res, release: releaseOf(releases.get(h.book), h.res), ...(h.id !== undefined ? { id: h.id } : {}), ref: `${h.book} ${h.ref}` })
  }
  for (const unit of listedBooks) {
    const book = unit.slice('book:'.length)
    if (filters.books !== undefined && !filters.books.includes(book)) continue
    const bytes = reader.size(unit)
    if (!reader.installed(unit) && bytes > 0) missingUnit(out, { book, unit, bytes })
  }
  return out
}
