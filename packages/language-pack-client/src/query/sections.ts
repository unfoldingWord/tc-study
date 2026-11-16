/** `sections`: the section map of the English ULT of a book (the `chunks` table of the `xtopics` core). No Node module here. */
import { BOOKS, formatRef } from '@bt-synergy/language-pack-v3'
import { ClientError } from '../errors'
import type { PackReader } from '../reader'
import { type Answer, missingUnit, newAnswer, releaseOf, usedUnit } from './envelope'

export const SECTIONS_SOURCE = 'unfoldingWord/en/ult'

/** `from` and `to` are references of the book (`1:1`, `1:5`; `2:3` when the section crosses a chapter), `first` and `last` the verse ids. */
export type SectionsData = { book: string; sections: { from: string; to: string; first: number; last: number }[]; source: typeof SECTIONS_SOURCE }

/** `from`/`to` of a section: the verse with its chapter (`1:1`), whatever the chapter. */
const refOf = (book: string, id: number): string => formatRef(book, id, id)

export async function sectionsQuery(reader: PackReader, book: string): Promise<Answer<SectionsData | null>> {
  if (typeof book !== 'string' || !(BOOKS as readonly string[]).includes(book)) throw new ClientError('E_ARG', `not a book: ${JSON.stringify(book)}`)
  const out = newAnswer<SectionsData | null>(reader, 'sections')
  const m = await reader.mapsOf(['xtopics'], { coreOnly: true })
  const x = m.xtopics
  if (x === undefined) {
    missingUnit(out, { unit: 'xtopics', bytes: reader.listed('xtopics') ? reader.size('xtopics') : 0 })
    return out
  }
  usedUnit(out, reader, 'xtopics')
  const list = x.core.chunks?.[book]
  // No table (an older common catalog) or no entry for the book: no source for it, which is `none`, not a zero.
  if (list === undefined) {
    out.data = { book, sections: [], source: SECTIONS_SOURCE }
    out.coverage = { [SECTIONS_SOURCE]: 'none' }
    return out
  }
  out.data = { book, sections: list.map(([first, last]) => ({ from: refOf(book, first), to: refOf(book, last), first, last })), source: SECTIONS_SOURCE }
  out.coverage = { [SECTIONS_SOURCE]: 'count' }
  out.cites.push({ res: SECTIONS_SOURCE, release: releaseOf(x.core.res, SECTIONS_SOURCE) })
  return out
}
