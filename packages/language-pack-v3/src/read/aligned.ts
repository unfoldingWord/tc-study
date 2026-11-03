/**
 * The reader of the segment of the index of aligned phrases (`spec/cddl/aligned.cddl`): a {@link Segment} that `readSegment`
 * has accepted, back into its entries. It rejects the segment with `E_BODY` at the first defect. It imports no builder code
 * and no Node module.
 */
import { ColumnError, compareCodePoints, decodeTexts, decodeUvarints } from '../codec/columns'
import type { Segment } from '../codec/container'
import { FormatError } from '../codec/errors'
import { isMap } from '../codec/values'
import { BOOKS } from '../ids'
import type { AlignedModel } from '../model'

/** The tables this reader knows, as `readSegment` takes them in `known`. */
export const ALIGNED_TABLES: Readonly<Record<string, number[]>> = { keys: [1], strongs: [1], data: [1] }

function bad(what: string): never {
  throw new FormatError('E_BODY', `the aligned segment is malformed: ${what}`)
}

/** The group of an `aligned` header: a letter, a range of two letters in order, or `other`. */
function checkGroup(group: string): void {
  const m = /^([a-z])(?:-([a-z]))?$/.exec(group)
  if (group === 'other' || (m !== null && (m[2] === undefined || m[1] < m[2]))) return
  bad(`the group ${JSON.stringify(group)} is not a letter, a range of two letters or "other"`)
}

/**
 * The part and its entries. `groups` are the groups of the `aligned:` units of the catalog, when the caller has it: with it a
 * key of `other` inside the range of one of them is `E_BODY`; without it that check is not made.
 *
 * Throws {@link FormatError} `E_BODY` when the segment is not an aligned segment or a table is not what `aligned.cddl` says.
 */
export function alignedView(seg: Segment, groups?: readonly string[]): AlignedModel {
  const { h, t } = seg
  if (h.class !== 'aligned') bad(`the class is "${h.class}"`)
  if (h.lang === undefined) bad('the header has no lang')
  if (h.group === undefined) bad('the header has no group')
  if (h.res === undefined || h.res.length === 0) bad('the header has no resource (res)')
  checkGroup(h.group)
  const group = h.group

  let keys: string[] = []
  let strongs: string[] = []
  let data: number[] = []
  try {
    if (!isMap(t.keys) || !(t.keys.utf8 instanceof Uint8Array) || !(t.keys.len instanceof Uint8Array)) bad('keys is not a texts column')
    keys = decodeTexts({ utf8: t.keys.utf8, len: t.keys.len })
    if (!Array.isArray(t.strongs) || !t.strongs.every((s) => typeof s === 'string')) bad('strongs is not a list of text')
    strongs = t.strongs as string[]
    if (!(t.data instanceof Uint8Array)) bad('data is not a byte string')
    data = decodeUvarints(t.data)
  } catch (error) {
    if (error instanceof ColumnError) bad(error.message)
    throw error
  }

  const low = group.charCodeAt(0)
  const high = group.charCodeAt(group.length - 1)
  for (let i = 0; i < keys.length; i++) {
    const key = keys[i]
    if (key === '') bad(`keys[${i}] is empty`)
    if (i > 0 && compareCodePoints(keys[i - 1], key) >= 0) bad('keys are not sorted by code point or one is repeated')
    const first = key.codePointAt(0)!
    if (group !== 'other' && (first < low || first > high)) bad(`the key ${JSON.stringify(key)} does not begin in the range ${group}`)
    if (group === 'other' && groups !== undefined) {
      for (const g of groups) {
        if (g !== 'other' && first >= g.charCodeAt(0) && first <= g.charCodeAt(g.length - 1)) {
          bad(`the key ${JSON.stringify(key)} begins in the range ${g}, which has its own part`)
        }
      }
    }
  }

  const entries: AlignedModel['entries'] = new Map()
  let pos = 0
  const next = (what: string): number => {
    if (pos >= data.length) bad(`data ends inside ${what}`)
    return data[pos++]
  }
  for (const key of keys) {
    const s = next(`the entry ${JSON.stringify(key)}`)
    if (s === 0) bad(`the entry ${JSON.stringify(key)} has no Strong key`)
    const byStrong = new Map<string, Map<string, [number, number]>>()
    const seen = new Set<number>()
    for (let k = 0; k < s; k++) {
      const si = next('a Strong index')
      if (si >= strongs.length) bad(`a Strong index is ${si}, and strongs has ${strongs.length}`)
      if (seen.has(si)) bad(`the entry ${JSON.stringify(key)} repeats the Strong key ${JSON.stringify(strongs[si])}`)
      seen.add(si)
      const b = next('a count of books')
      if (b === 0) bad(`the entry ${JSON.stringify(key)} has no book for ${JSON.stringify(strongs[si])}`)
      const books = new Map<string, [number, number]>()
      let book = 0
      for (let j = 0; j < b; j++) {
        const delta = next('a book delta')
        if (delta === 0) bad('a book delta is 0')
        book += delta
        if (book > 66) bad(`the book number ${book} is above 66`)
        const verses = next('verses')
        const occurrences = next('occurrences')
        if (verses === 0 || verses > occurrences) bad(`${verses} verses and ${occurrences} occurrences`)
        books.set(BOOKS[book - 1], [verses, occurrences])
      }
      byStrong.set(strongs[si], books)
    }
    entries.set(key, byStrong)
  }
  if (pos !== data.length) bad(`data has ${data.length - pos} numbers left over`)

  return { lang: h.lang, group, res: h.res.map(([k, tag]) => [k, tag]), entries }
}
