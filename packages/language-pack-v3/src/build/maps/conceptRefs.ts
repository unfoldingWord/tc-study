import { conceptOfSupportReference, conceptOfTwLink, parseRef } from '../../ids'
import type { Row } from '../../source/rows'
import { looseRange, sourceRows } from '../bookHelps'
import type { Tally } from './tally'
import { expandRange } from './verses'

/** The concept of a help row and the verses it names; no `from`/`to` when the reference could not be read. */
export type ConceptRef = { concept: string; from?: number; to?: number }

const CONCEPT = {
  notes: { column: 'supportReference', of: conceptOfSupportReference },
  links: { column: 'twLink', of: conceptOfTwLink },
} as const

/**
 * The concept and the verses of each row of the notes or links of a book that has a concept, in row order. The concept is
 * the one phase 1 derives (`extractHelps`). A list reference gives the lowest and highest verse named; a reference that
 * names no verse gives no range and one line in `issues`.
 */
export function conceptRefs(rows: Row[], book: string, res: string, kind: 'notes' | 'links', issues: string[] = []): ConceptRef[] {
  const { column, of } = CONCEPT[kind]
  const out: ConceptRef[] = []
  for (const { item } of sourceRows(rows, book, res, kind)) {
    if (typeof item !== 'object' || item === null) continue
    const record = item as Record<string, unknown>
    const value = record[column]
    if (typeof value !== 'string' || value === '') continue
    const concept = of(value)
    if (concept === null) continue
    const reference = typeof record.reference === 'string' ? record.reference : ''
    let range = parseRef(book, reference)
    if (range === null) {
      const front = /^([1-9][0-9]{0,2}):front$/.exec(reference.trim())
      range = front === null ? null : parseRef(book, `${front[1]}:intro`)
    }
    range ??= looseRange(book, reference)
    if (range === null) {
      issues.push(`${res} ${String(record.id)}: the reference ${JSON.stringify(reference)} names no verse; the row counts and covers no verse`)
      out.push({ concept })
    } else {
      out.push({ concept, from: range[0], to: range[1] })
    }
  }
  return out
}

/** Adds each ref to the tally: one occurrence, and the verses of the range among `verses` (none when unreadable). */
export function tallyRefs(tally: Tally, book: string, refs: ConceptRef[], verses: readonly number[]): void {
  for (const ref of refs) tally.add(ref.concept, book, ref.from === undefined ? [] : expandRange(verses, ref.from, ref.to ?? ref.from))
}
