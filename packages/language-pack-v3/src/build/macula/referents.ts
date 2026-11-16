/**
 * The MACULA referents of a book as `macula` v2 (`spec/cddl/orig.cddl`, "Builder rules"): the published v1 value, whose referring
 * words are found by verse, key and occurrence, becomes one row per reference with absolute word positions, and the antecedent
 * is fixed to one word when the rule allows. Builders import this; it uses no Node module.
 */
import { strongKey } from '../../ids'
import type { Event, MaculaReferents, OrigWord, Piece } from '../../model'
import { stringTable } from '../../codec/columns'
import { verseSpans } from './trees'

/** What was left out or left empty, per book, for the build report. */
export type MaculaReferentCounts = {
  /** Referring words (key and occurrence) not found in their verse, whose rows were left out. */
  words: number
  /** The rows of those words. */
  rows: number
  /** Rows kept, and among them those whose antecedent the rule could not fix (`ante` 0). */
  kept: number
  open: number
}

/**
 * What a word is found by: its letters alone (Taller's `referentKey`, `src/domain/referents.ts`): no marks, lowercase, a final
 * sigma as sigma, nothing that is not a letter.
 */
export function referentKey(surface: string): string {
  return surface
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/ς/g, 'σ')
    .replace(/[^\p{L}]/gu, '')
}

/**
 * The number of a Strong for the antecedent rule: the letter and, for Greek, the first four digits; for Hebrew the number
 * without leading zeros; any letter suffix is ignored. `''` when it has none (it matches nothing).
 */
export function strongNumber(strong: string): string {
  const m = /([HG])(\d+)/.exec(strongKey(strong))
  if (m === null) return ''
  return m[1] === 'G' ? 'G' + m[2].padStart(4, '0').slice(0, 4) : 'H' + String(Number(m[2]))
}

/** The Strong of an entity as a map key (ids.md): the Hebrew as published, the Greek in five digits; `''` when it is neither. */
function entityStrong(strong: unknown): string {
  if (typeof strong !== 'string') return ''
  const key = strongKey(strong)
  if (/^G\d{4}$/.test(key)) return key + '0'
  return /^(H\d+[a-z]?|G\d{5})$/.test(key) ? key : ''
}

const bad = (what: unknown): Error => new Error(`macula referents: ${JSON.stringify(what)} is not of the published shape`)

/**
 * Turns the published v1 value `{words: [[form, strong]], verses: {"C:V": [[key, occurrence, [[kind, piece, x, y, n]]]]}}` into
 * `MaculaReferents` of this book, and counts what it left out. Throws `Error` for a value that is not the published shape.
 */
export function buildMaculaReferents(
  published: unknown,
  words: OrigWord[],
  pieces: Piece[],
  events: Event[],
): { referents: MaculaReferents; counts: MaculaReferentCounts } {
  const value = published as { words?: unknown; verses?: unknown } | null
  if (value === null || typeof value !== 'object' || !Array.isArray(value.words) || value.verses === null || typeof value.verses !== 'object') {
    throw new Error('macula referents: the published value has no `words` and `verses`')
  }
  const named = value.words as unknown[]
  const verses = verseSpans(pieces, events)
  const counts: MaculaReferentCounts = { words: 0, rows: 0, kept: 0, open: 0 }

  const keysOf = new Map<string, string[]>()
  const keys = (verse: string): string[] => {
    let list = keysOf.get(verse)
    if (list === undefined) {
      const span = verses.get(verse)!
      list = []
      for (let p = span.first; p < span.first + span.words; p++) list.push(referentKey(words[p].form))
      keysOf.set(verse, list)
    }
    return list
  }
  const numbers: string[] = []
  const numberAt = (p: number): string => (numbers[p] ??= strongNumber(words[p].strong))

  const entIndex = new Map<number, number>()
  const ents: [string, string][] = []
  const entOf = (n: unknown): number => {
    if (typeof n !== 'number' || !Number.isInteger(n) || n < 0 || !Array.isArray(named[n])) throw bad(n)
    let at = entIndex.get(n)
    if (at === undefined) {
      const [form, strong] = named[n] as [unknown, unknown]
      const pair: [string, string] = [typeof form === 'string' ? form : '', entityStrong(strong)]
      at = ents.findIndex((e) => e[0] === pair[0] && e[1] === pair[1])
      if (at < 0) at = ents.push(pair) - 1
      entIndex.set(n, at)
    }
    return at
  }

  /** The position + 1 of the antecedent in `verse` (R1), or 0. */
  const ante = (verse: string, n: number): number => {
    const span = verses.get(verse)
    const [form, strong] = named[n] as [unknown, unknown]
    const number = strongNumber(typeof strong === 'string' ? strong : '')
    if (span === undefined || number === '') return 0
    let hits: number[] = []
    for (let p = span.first; p < span.first + span.words; p++) if (numberAt(p) === number) hits.push(p)
    if (hits.length > 1) {
      const want = referentKey(typeof form === 'string' ? form : '')
      const list = keys(verse)
      hits =
        want === ''
          ? []
          : hits.filter((p) => {
              const k = list[p - span.first]
              return k !== '' && (k.includes(want) || want.includes(k))
            })
    }
    return hits.length === 1 ? hits[0] + 1 : 0
  }

  type Row = { word: number; kind: string; piece: string; ent: number; ch: number; vs: number; ante: number }
  const rows: Row[] = []
  for (const [verse, items] of Object.entries(value.verses as Record<string, unknown>)) {
    if (!/^[0-9]+:[0-9]+$/.test(verse) || !Array.isArray(items)) throw bad(verse)
    const span = verses.get(verse)
    const [ch, vs] = verse.split(':').map(Number)
    for (const item of items) {
      if (!Array.isArray(item) || typeof item[0] !== 'string' || !Number.isInteger(item[1]) || !Array.isArray(item[2])) throw bad(item)
      const [key, occurrence, targets] = item as [string, number, unknown[]]
      let word = -1
      if (span !== undefined && key !== '') {
        const list = keys(verse)
        let seen = 0
        for (let i = 0; i < list.length; i++) {
          if (list[i] === key && seen++ === occurrence) {
            word = span.first + i
            break
          }
        }
      }
      if (word < 0) {
        counts.words++
        counts.rows += targets.length
        continue
      }
      for (const target of targets) {
        if (!Array.isArray(target) || target.length !== 5 || typeof target[0] !== 'string' || typeof target[1] !== 'string') throw bad(target)
        const [kind, piece, x, y, n] = target as [string, string, number, number, number]
        if (!Number.isInteger(x) || !Number.isInteger(y) || x < 0 || y < 0) throw bad(target)
        const ent = entOf(n)
        const [tc, tv] = x === 0 ? [ch, vs] : [x, y]
        const at = ante(`${tc}:${tv}`, n)
        counts.kept++
        if (at === 0) counts.open++
        rows.push({ word, kind, piece, ent, ch: tc, vs: tv, ante: at })
      }
    }
  }
  // Rows by the position of their word; the sort is stable, so the source order stays within a word.
  rows.sort((a, b) => a.word - b.word)
  const kinds = stringTable(rows.map((r) => r.kind))
  const pieceTable = stringTable(rows.map((r) => r.piece))
  const referents: MaculaReferents = {
    ents,
    kinds: kinds.list,
    pieces: pieceTable.list,
    word: rows.map((r) => r.word),
    kind: rows.map((r) => kinds.index.get(r.kind)!),
    piece: rows.map((r) => pieceTable.index.get(r.piece)!),
    ent: rows.map((r) => r.ent),
    ch: rows.map((r) => r.ch),
    vs: rows.map((r) => r.vs),
    ante: rows.map((r) => r.ante),
  }
  return { referents, counts }
}

/** The report lines for what {@link buildMaculaReferents} left out or left empty (none when nothing was). */
export function maculaReferentIssues(counts: MaculaReferentCounts): string[] {
  const lines: string[] = []
  if (counts.words > 0) lines.push(`MACULA referents: ${counts.words} referring word(s) not found in their verse, with ${counts.rows} reference(s): left out`)
  if (counts.open > 0) lines.push(`MACULA referents: ${counts.open} of ${counts.kept} reference(s) with an antecedent the rule cannot fix: ante left empty`)
  return lines
}
