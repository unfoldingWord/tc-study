/** `academy`: the tA articles the notes of a book cite, most cited first, from the usage of the `map`. No Node module here. */
import { BOOKS, type MapSet } from '@bt-synergy/language-pack-v3'
import { ClientError } from '../errors'
import type { PackReader } from '../reader'
import { type Answer, newAnswer, usedUnit } from './envelope'
import { haveMap, languageTn, usageBooks } from './maps'

export type AcademyArticle = { id: string; title?: string; count: number; partial: boolean }
/** `covered` is false when the language has no tN source for the book (none of its own, or one that does not cover it): `articles` is then [] for lack of a source, not because nothing is cited. */
export type AcademyData = { book: string; covered: boolean; articles: AcademyArticle[] }

/** True when the tN the usage reads covers the book, wholly or in part (a concept with no row still has the coverage cell). */
export function academyCovered(m: MapSet, book: string): boolean {
  const c = usageBooks(m, 'ta:')[book]
  return c !== undefined && c.state !== 'none'
}

/** The `ta:` ids the maps know: the usage table of the language, the English notes, and the names of the map. */
function taIds(m: MapSet): Set<string> {
  const ids = new Set<string>()
  const add = (keys: Iterable<string> | undefined) => {
    for (const k of keys ?? []) if (k.startsWith('ta:')) ids.add(k)
  }
  add(m.map?.core.usage?.rows.keys())
  add(m.xmap?.core.notes?.rows.keys())
  add(Object.keys(m.map?.core.names ?? {}))
  return ids
}

export function academyOf(m: MapSet, book: string): AcademyArticle[] {
  const names = m.map?.core.names ?? {}
  const out: AcademyArticle[] = []
  // The coverage of the book is the same for every article: read it once, then only the count of each article.
  const cover = usageBooks(m, 'ta:')[book]
  if (cover === undefined || cover.state === 'none') return out
  const partial = cover.state === 'partial'
  const rows = languageTn(m) !== undefined ? m.map?.core.usage?.rows : m.xmap?.core.notes?.rows
  for (const id of taIds(m)) {
    const count = rows?.get(id)?.get(book)?.[0]
    if (count === undefined || count <= 0) continue
    const title = names[id]?.[0]
    out.push({ id, ...(title !== undefined ? { title } : {}), count, partial })
  }
  return out.sort((a, b) => b.count - a.count || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
}

export async function academyQuery(reader: PackReader, book: string): Promise<Answer<AcademyData | null>> {
  if (typeof book !== 'string' || !(BOOKS as readonly string[]).includes(book)) throw new ClientError('E_ARG', `not a book: ${JSON.stringify(book)}`)
  const out = newAnswer<AcademyData | null>(reader, 'academy')
  const m = await reader.maps()
  // Only the maps read: the `xmap` is read for English only.
  // The counts of a language come from its own tN in the `map`; English has none, so its counts are the notes of the `xmap`.
  const english = m.map !== undefined && languageTn(m) === undefined && m.map.core.lang === 'en'
  if (m.map !== undefined) usedUnit(out, reader, 'map')
  if (english && m.xmap !== undefined) usedUnit(out, reader, 'xmap')
  const ok = haveMap(out, reader, m, 'map')
  if (!ok || (english && !haveMap(out, reader, m, 'xmap'))) {
    out.data = null
    return out
  }
  const covered = academyCovered(m, book)
  out.data = { book, covered, articles: covered ? academyOf(m, book) : [] }
  return out
}
