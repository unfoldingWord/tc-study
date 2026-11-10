/** `passage`: the texts of a verse range from `pieces` and `events`, with the notes, questions and word links in range. No Node module here. */
import { type BookModel, type Event, type HelpRow, parseRef, type Piece, verseId } from '@bt-synergy/language-pack-v3'
import { ClientError } from '../errors'
import type { PackReader } from '../reader'
import { type Answer, type CellState, missingUnit, newAnswer, releaseOf, usedUnit } from './envelope'

export type PassageData = {
  book: string
  ref: string
  texts: { res: string; text: string }[]
  notes: HelpRow[]
  questions: HelpRow[]
  links: HelpRow[]
}

/** `tit 1:1-2` -> book `tit` and the range of verse ids; `E_ARG` for anything else. */
export function parsePassage(ref: string): { book: string; ref: string; range: [number, number] } {
  const m = /^([a-z0-9]{3})\s+(\S+)$/.exec(ref.trim().toLowerCase())
  const range = m === null ? null : parseRef(m[1]!, m[2]!)
  if (m === null || range === null) throw new ClientError('E_ARG', `not a reference: ${JSON.stringify(ref)}`)
  return { book: m[1]!, ref: m[2]!, range }
}

const NUMBER = /^(\d+)(?:-(\d+))?/

/** The text of the verse ids `[from, to]` of a text, by its events. Verses are joined by a space. */
export function textOfRange(book: string, pieces: Piece[], events: Event[], from: number, to: number): string {
  const parts: string[] = []
  let chapter = 0
  let first = 0
  let last = 0
  let start = 0
  const flush = (end: number): void => {
    const lo = verseId(book, chapter, first)
    const hi = verseId(book, chapter, last)
    if (lo <= to && hi >= from && end > start) parts.push(pieces.slice(start, end).map((p) => p[0]).join('').trim())
  }
  for (const [position, kind, arg] of events) {
    if (kind !== 'chapter' && kind !== 'verse') continue
    flush(position)
    start = position
    const m = NUMBER.exec(arg)
    if (m === null) {
      first = last = 0
      continue
    }
    if (kind === 'chapter') {
      chapter = Number(m[1])
      first = last = 0
    } else {
      first = Number(m[1])
      last = m[2] === undefined ? first : Number(m[2])
    }
  }
  flush(pieces.length)
  return parts.filter((p) => p !== '').join(' ')
}

const HELPS = ['notes', 'questions', 'links'] as const
const COVERED = new Set(['tn', 'tq', 'twl'])
const idOf = (key: string): string => key.slice(key.lastIndexOf('/') + 1)

export async function passageQuery(reader: PackReader, input: string): Promise<Answer<PassageData>> {
  const { book, ref, range } = parsePassage(input)
  const out = newAnswer<PassageData>(reader, 'passage')
  const unit = `book:${book}`
  const model: BookModel | undefined = reader.installed(unit) ? await reader.book(book) : undefined
  if (model === undefined) {
    missingUnit(out, { book, unit, bytes: reader.size(unit) })
    return out
  }
  usedUnit(out, reader, unit)
  const [from, to] = range
  const data: PassageData = { book, ref, texts: [], notes: [], questions: [], links: [] }
  /** Rows in range by resource key, for the coverage. */
  const inRange = new Map<string, number>()
  for (const t of model.texts) {
    data.texts.push({ res: t.res, text: textOfRange(book, t.pieces, t.events, from, to) })
    out.cites.push({ res: t.res, release: releaseOf(model.res, t.res), ref: `${book} ${ref}` })
  }
  for (const kind of HELPS) {
    const table = model[kind]
    if (table === undefined) continue
    for (const row of table.rows) {
      if (row.from > to || row.to < from) continue
      data[kind].push(row)
      inRange.set(table.res, (inRange.get(table.res) ?? 0) + 1)
      out.cites.push({ res: table.res, release: releaseOf(model.res, table.res), id: row.id, ref: row.ref })
    }
  }
  out.data = data
  // The coverage needs the `map` only: the other map units are not read for a passage.
  const maps = await reader.mapsOf(['map'])
  if (maps.map !== undefined) {
    usedUnit(out, reader, 'map')
    const cov: Record<string, CellState> = {}
    for (const [key] of maps.map.core.res) {
      if (!COVERED.has(idOf(key))) continue
      const c = maps.map.core.coverage.get(key)
      // queries/README.md "States": a whole source with no row in the range is `zero`, not `count`.
      cov[key] = c?.whole.includes(book) ? ((inRange.get(key) ?? 0) > 0 ? 'count' : 'zero') : c?.partial.includes(book) ? 'partial' : 'none'
    }
    out.coverage = cov
  }
  return out
}
