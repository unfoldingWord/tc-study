/**
 * The names of a language's map (`spec/cddl/map.cddl`): the names of the books (from the `toc` markers of the texts, else a
 * list), the names of the concepts (tW and tA titles), the subtitles and the titles of the OBS stories. No Node module is used.
 */
import { compareCodePoints } from '../../codec/columns'
import { hasOwn } from '../../codec/values'
import { BOOKS } from '../../ids'
import type { ArticleModel, BookModel, BookName, ObsModel, TextModel } from '../../model'

const TOC = ['para:toc1', 'para:toc2', 'para:toc3']

/** The joined pieces inside the nodes `para:toc1` to `para:toc3` of a text; `null` when there is no `toc1`. */
export function tocOfText(text: TextModel): [string, string, string] | null {
  const out: (string | null)[] = [null, null, null]
  const { events, pieces } = text
  for (let i = 0; i < events.length; i++) {
    const [position, kind, arg] = events[i]
    const which = kind === 'open' ? TOC.indexOf(arg) : -1
    if (which < 0) continue
    let depth = 1
    let end = pieces.length
    for (let j = i + 1; j < events.length; j++) {
      const k = events[j][1]
      if (k === 'open') depth++
      else if (k === 'close' && --depth === 0) {
        end = events[j][0]
        break
      }
    }
    if (out[which] === null) out[which] = pieces.slice(position, end).map((p) => p[0]).join('')
  }
  if (out[0] === null) return null
  return [out[0], out[1] ?? '', out[2] ?? '']
}

/** The 66 names in canonical order: the toc of the first text that has one, else the list, else none. */
export function bookNames(books: BookModel[], list?: Record<string, [string, string, string]>): BookName[] {
  return BOOKS.map((code): BookName => {
    for (const book of books) {
      if (book.book !== code) continue
      for (const text of book.texts) {
        const toc = tocOfText(text)
        if (toc) return [toc[0], toc[1], toc[2], 'text']
      }
    }
    const listed = list && hasOwn(list, code) ? list[code] : undefined
    if (listed) return [listed[0], listed[1], listed[2], 'list']
    return ['', '', '', 'none']
  })
}

/** The names of each concept: a tW title split at commas, a tA title whole; keys sorted by code point. */
export function conceptNames(articles: ArticleModel[]): Record<string, string[]> {
  const out: Record<string, string[]> = {}
  for (const a of [...articles].sort((x, y) => compareCodePoints(x.id, y.id))) {
    if (a.id.startsWith('tw:')) {
      const parts = a.title.split(',').map((s) => s.trim()).filter((s) => s !== '')
      if (parts.length > 0) out[a.id] = parts
    } else if (a.id.startsWith('ta:')) {
      if (a.title.trim() !== '') out[a.id] = [a.title]
    }
  }
  return out
}

/** The subtitle of each tA article that has one. */
export function subtitlesOf(articles: ArticleModel[]): Record<string, string> {
  const out: Record<string, string> = {}
  for (const a of [...articles].sort((x, y) => compareCodePoints(x.id, y.id))) {
    if (a.id.startsWith('ta:') && a.subtitle !== undefined) out[a.id] = a.subtitle
  }
  return out
}

/** The `[number, title]` of each OBS story. */
export function obsTitles(obs: ObsModel | null): [number, string][] | undefined {
  return obs ? obs.stories.map((s): [number, string] => [s.n, s.title]) : undefined
}
