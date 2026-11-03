/**
 * The segment of the index of aligned phrases (`spec/cddl/aligned.cddl`): one part of one language, the keys that begin in
 * the range of its group. The reader is `read/aligned.ts`. No Node module is used.
 */
import type { CborValue } from '../../codec/cbor'
import { compareCodePoints, encodeTexts, encodeUvarints, stringTable } from '../../codec/columns'
import type { Segment } from '../../codec/container'
import { BOOKS, bookNumber } from '../../ids'
import type { AlignedModel } from '../../model'

/** A letter, a range of two letters (the first before the last) or `other`. */
export function isAlignedGroup(group: string): boolean {
  if (group === 'other') return true
  if (/^[a-z]$/.test(group)) return true
  return /^[a-z]-[a-z]$/.test(group) && group[0] < group[2]
}

/** Whether the first code point of `key` is inside the range of a range group (`a`, `b-c`). */
export function inAlignedRange(group: string, key: string): boolean {
  const first = key.codePointAt(0)
  if (first === undefined) return false
  return first >= group.charCodeAt(0) && first <= group.charCodeAt(group.length - 1)
}

/**
 * The segment of one part. Keys are sorted by code point, the Strong keys of an entry too, the books ascending; the `strongs`
 * table has the most used first. Throws `Error` for a group that is not valid, a key that is empty or outside the range of a
 * range group, an entry with no Strong key, a count that is not a whole number, `verses` 0 or above `occurrences`, a book
 * that is not one of the 66, or no resource.
 */
export function alignedSegment(model: AlignedModel): Segment {
  const { lang, group, res } = model
  if (!isAlignedGroup(group)) throw new Error(`The group ${JSON.stringify(group)} is not a letter, a range of two letters or "other"`)
  if (res.length === 0) throw new Error('The header needs at least one resource (res)')

  const keys = [...model.entries.keys()].sort(compareCodePoints)
  const rows = keys.map((key) => {
    if (key === '') throw new Error('A key is empty')
    if (group !== 'other' && !inAlignedRange(group, key)) throw new Error(`The key ${JSON.stringify(key)} does not begin in the range ${group}`)
    const byStrong = model.entries.get(key)!
    if (byStrong.size === 0) throw new Error(`The key ${JSON.stringify(key)} has no Strong key`)
    const strongs = [...byStrong.keys()].sort(compareCodePoints)
    return { key, byStrong, strongs }
  })
  const { list, index } = stringTable(rows.flatMap((r) => r.strongs))

  const data: number[] = []
  for (const { key, byStrong, strongs } of rows) {
    data.push(strongs.length)
    for (const strong of strongs) {
      const books = [...byStrong.get(strong)!].map(([code, counts]) => [bookNumber(code), counts] as const).sort((a, b) => a[0] - b[0])
      if (books.length === 0) throw new Error(`The key ${JSON.stringify(key)} has no book for ${strong}`)
      data.push(index.get(strong)!, books.length)
      let previous = 0
      for (const [book, [verses, occurrences]] of books) {
        if (book === previous) throw new Error(`The key ${JSON.stringify(key)} lists ${BOOKS[book - 1]} twice for ${strong}`)
        if (!Number.isSafeInteger(verses) || !Number.isSafeInteger(occurrences) || verses < 1 || verses > occurrences) {
          throw new Error(`The key ${JSON.stringify(key)}, ${strong}, ${BOOKS[book - 1]}: ${verses} verses and ${occurrences} occurrences`)
        }
        data.push(book - previous, verses, occurrences)
        previous = book
      }
    }
  }

  const t: Record<string, CborValue> = { keys: encodeTexts(keys), strongs: list, data: encodeUvarints(data) }
  return {
    h: {
      class: 'aligned',
      v: 1,
      tables: { keys: [1, true], strongs: [1, true], data: [1, true] },
      lang,
      group,
      res: res.map(([key, tag]) => [key, tag]),
    },
    t,
  }
}
