import type { CountRows, CountUnit, VerseLists } from '../../codec/counts'
import { bookNumber } from '../../ids'
import type { CountTable } from '../../model'

/**
 * Counts per key and book (`counts.md`). One `add` is one occurrence, link or note; its count is the number of adds and
 * its verses are the distinct verses of all of them (a Strong three times in one verse is `[3, 1]`; a note on 1:2-4 is
 * `[1, 3]`; an add with no verse still counts, `[1, 0]`).
 */
export class Tally {
  private readonly data = new Map<string, Map<string, { count: number; verses: Set<number> }>>()

  constructor(private readonly unit: CountUnit) {}

  add(key: string, book: string, verses: readonly number[]): void {
    bookNumber(book)
    let byBook = this.data.get(key)
    if (byBook === undefined) this.data.set(key, (byBook = new Map()))
    let cell = byBook.get(book)
    if (cell === undefined) byBook.set(book, (cell = { count: 0, verses: new Set() }))
    cell.count++
    for (const v of verses) cell.verses.add(v)
  }

  table(): CountTable {
    const rows: CountRows = new Map()
    for (const [key, byBook] of this.data) {
      const sorted = [...byBook.entries()].sort((a, b) => bookNumber(a[0]) - bookNumber(b[0]))
      rows.set(key, new Map(sorted.map(([book, cell]) => [book, [cell.count, cell.verses.size] as [number, number]])))
    }
    return { unit: this.unit, rows }
  }

  /** The verse ids of each key in `book`, ascending and distinct; a key without a verse there has no entry. */
  verseLists(book: string): VerseLists {
    const out: VerseLists = new Map()
    for (const [key, byBook] of this.data) {
      const cell = byBook.get(book)
      if (cell !== undefined && cell.verses.size > 0) out.set(key, [...cell.verses].sort((a, b) => a - b))
    }
    return out
  }

  /** The books with any count, in canonical order. */
  books(): string[] {
    const set = new Set<string>()
    for (const byBook of this.data.values()) for (const book of byBook.keys()) set.add(book)
    return [...set].sort((a, b) => bookNumber(a) - bookNumber(b))
  }
}
