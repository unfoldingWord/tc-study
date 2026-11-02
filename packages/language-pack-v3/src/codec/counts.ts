import { BOOKS, bookNumber } from '../ids'
import { ColumnError, compareCodePoints, decodeUvarints, encodeUvarints } from './columns'

export type CountUnit = 'occurrences' | 'links' | 'notes'
/** Key to book code to `[count, verses]`; books iterate in canonical order. */
export type CountRows = Map<string, Map<string, [count: number, verses: number]>>
/** Key to full verse ids, ascending and distinct. */
export type VerseLists = Map<string, number[]>
/** Source key to the books it covers whole and in part, in canonical order. */
export type Coverage = Map<string, { whole: string[]; partial: string[] }>

const BOOK_FACTOR = 1_000_000
const SET_BYTES = Math.ceil(BOOKS.length / 8)

function sortedKeys(keys: Iterable<string>): string[] {
  return [...keys].sort(compareCodePoints)
}

function checkKeys(keys: unknown, what: string): string[] {
  if (!Array.isArray(keys) || keys.some((k) => typeof k !== 'string')) throw new ColumnError(`${what}: keys is not a list of text`)
  for (let i = 1; i < keys.length; i++) {
    if (compareCodePoints(keys[i - 1] as string, keys[i] as string) >= 0) {
      throw new ColumnError(`${what}: keys are not sorted by code point or one is repeated`)
    }
  }
  return keys as string[]
}

function asRecord(t: unknown, what: string): Record<string, unknown> {
  if (typeof t !== 'object' || t === null || Array.isArray(t)) throw new ColumnError(`${what}: not a table`)
  return t as Record<string, unknown>
}

function asBytes(v: unknown, what: string): Uint8Array {
  if (!(v instanceof Uint8Array)) throw new ColumnError(`${what}: not a byte string`)
  return v
}

export function encodeCounts(unit: CountUnit, rows: CountRows): { unit: CountUnit; keys: string[]; counts: Uint8Array } {
  const keys = sortedKeys(rows.keys())
  const nums: number[] = []
  for (const key of keys) {
    const books = [...rows.get(key)!.entries()]
      .map(([code, pair]) => ({ n: bookNumber(code), pair }))
      .sort((a, b) => a.n - b.n)
    if (books.length === 0) throw new ColumnError(`counts: key ${JSON.stringify(key)} has no book`)
    nums.push(books.length)
    let previous = 0
    for (const { n, pair } of books) {
      nums.push(n - previous, pair[0], pair[1])
      previous = n
    }
  }
  return { unit, keys, counts: encodeUvarints(nums) }
}

export function decodeCounts(t: unknown, unit: CountUnit): CountRows {
  const table = asRecord(t, 'counts')
  if (table.unit !== unit) throw new ColumnError(`counts: unit is ${JSON.stringify(table.unit)}, expected ${JSON.stringify(unit)}`)
  const keys = checkKeys(table.keys, 'counts')
  const nums = decodeUvarints(asBytes(table.counts, 'counts'))
  const out: CountRows = new Map()
  let i = 0
  const next = (): number => {
    if (i >= nums.length) throw new ColumnError('counts: the column is cut short')
    return nums[i++]
  }
  for (const key of keys) {
    const b = next()
    if (b === 0) throw new ColumnError(`counts: key ${JSON.stringify(key)} has no book`)
    const books = new Map<string, [number, number]>()
    let number = 0
    for (let j = 0; j < b; j++) {
      const delta = next()
      if (delta === 0) throw new ColumnError('counts: book numbers do not strictly increase')
      number += delta
      if (number > BOOKS.length) throw new ColumnError(`counts: book number ${number} is outside 1..66`)
      const count = next()
      const verses = next()
      if (count < 1) throw new ColumnError('counts: count is 0')
      books.set(BOOKS[number - 1], [count, verses])
    }
    out.set(key, books)
  }
  if (i !== nums.length) throw new ColumnError('counts: numbers left over')
  return out
}

export function encodeVerseLists(book: string, lists: VerseLists): { keys: string[]; verses: Uint8Array } {
  const base = bookNumber(book) * BOOK_FACTOR
  const keys = sortedKeys(lists.keys())
  const nums: number[] = []
  for (const key of keys) {
    const ids = lists.get(key)!
    if (ids.length === 0) throw new ColumnError(`verse lists: key ${JSON.stringify(key)} has no verse`)
    nums.push(ids.length)
    let previous = 0
    ids.forEach((id, index) => {
      const offset = id - base
      if (!Number.isInteger(offset) || offset < 0 || offset >= BOOK_FACTOR) {
        throw new ColumnError(`verse lists: ${id} is not a verse of ${book}`)
      }
      if (index > 0 && offset <= previous) throw new ColumnError('verse lists: ids are not strictly increasing')
      nums.push(offset - previous)
      previous = offset
    })
  }
  return { keys, verses: encodeUvarints(nums) }
}

export function decodeVerseLists(book: string, t: unknown): VerseLists {
  const base = bookNumber(book) * BOOK_FACTOR
  const table = asRecord(t, 'verse lists')
  const keys = checkKeys(table.keys, 'verse lists')
  const nums = decodeUvarints(asBytes(table.verses, 'verse lists'))
  const out: VerseLists = new Map()
  let i = 0
  const next = (): number => {
    if (i >= nums.length) throw new ColumnError('verse lists: the column is cut short')
    return nums[i++]
  }
  for (const key of keys) {
    const n = next()
    if (n === 0) throw new ColumnError(`verse lists: key ${JSON.stringify(key)} has no verse`)
    const ids: number[] = []
    let offset = 0
    for (let j = 0; j < n; j++) {
      const delta = next()
      if (j > 0 && delta === 0) throw new ColumnError('verse lists: a verse is repeated')
      offset += delta
      if (offset >= BOOK_FACTOR) throw new ColumnError('verse lists: a verse offset reaches 1 000 000')
      ids.push(base + offset)
    }
    out.set(key, ids)
  }
  if (i !== nums.length) throw new ColumnError('verse lists: numbers left over')
  return out
}

function setOf(books: string[]): Uint8Array {
  const out = new Uint8Array(SET_BYTES)
  for (const code of books) {
    const bit = bookNumber(code) - 1
    out[Math.floor(bit / 8)] += 2 ** (bit % 8) * (Math.floor(out[Math.floor(bit / 8)] / 2 ** (bit % 8)) % 2 === 1 ? 0 : 1)
  }
  return out
}

function booksOf(bytes: unknown): string[] {
  const set = asBytes(bytes, 'coverage')
  if (set.length !== SET_BYTES) throw new ColumnError('coverage: a book set is not 9 bytes')
  const out: string[] = []
  for (let bit = 0; bit < set.length * 8; bit++) {
    if (Math.floor(set[Math.floor(bit / 8)] / 2 ** (bit % 8)) % 2 === 1) {
      if (bit >= BOOKS.length) throw new ColumnError('coverage: a book set has a bit beyond the 66 books')
      out.push(BOOKS[bit])
    }
  }
  return out
}

export function encodeCoverage(c: Coverage): Record<string, Uint8Array[]> {
  const out: Record<string, Uint8Array[]> = {}
  for (const key of sortedKeys(c.keys())) {
    const { whole, partial } = c.get(key)!
    out[key] = partial.length === 0 ? [setOf(whole)] : [setOf(whole), setOf(partial)]
  }
  return out
}

export function decodeCoverage(t: unknown): Coverage {
  const table = asRecord(t, 'coverage')
  const out: Coverage = new Map()
  for (const key of Object.keys(table)) {
    const sets = table[key]
    if (!Array.isArray(sets) || sets.length < 1 || sets.length > 2) {
      throw new ColumnError(`coverage: ${JSON.stringify(key)} is not [whole, partial?]`)
    }
    out.set(key, { whole: booksOf(sets[0]), partial: sets.length === 2 ? booksOf(sets[1]) : [] })
  }
  return out
}
