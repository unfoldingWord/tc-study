/** The search index contract and the rows of a book that both indexes keep. No Node module here. */
import type { BookModel, Event, Piece } from '@bt-synergy/language-pack-v3'

export type SearchKind = 'text' | 'note' | 'question' | 'link'

export type SearchFilters = { books?: string[]; kinds?: SearchKind[]; limit?: number }

/** The keys of `SearchFilters`, for the test that checks the `search` schema against the method. */
export const SEARCH_FILTER_KEYS: Record<keyof SearchFilters, true> = { books: true, kinds: true, limit: true }

export const DEFAULT_LIMIT = 20

/**
 * `ref` is the reference as the resource has it (`1:1`), `res` the resource key, `id` the row id of a note, question or link.
 * `snippet` is a piece of the body with the matched words between « and ». `score` is higher for a better match.
 */
export type Hit = { kind: string; book: string; ref: string; res: string; id?: string; snippet: string; score: number }

export interface SearchIndex {
  init(): Promise<void>
  addBook(lang: string, book: BookModel, segmentId: string): Promise<void>
  removeSegment(segmentId: string): Promise<void>
  has(segmentId: string): Promise<boolean>
  search(lang: string, text: string, f?: SearchFilters): Promise<Hit[]>
}

export type PieceRow = { kind: SearchKind; ref: string; res: string; rid: string; body: string }

const NUMBER = /^(\d+)/

function verses(pieces: Piece[], events: Event[]): { ref: string; body: string }[] {
  const out: { ref: string; body: string }[] = []
  let chapter = ''
  let verse = ''
  let start = -1
  const flush = (end: number): void => {
    if (verse === '' || start < 0) return
    const body = pieces
      .slice(start, end)
      .map((p) => p[0])
      .join('')
      .trim()
    if (body !== '') out.push({ ref: `${chapter}:${verse}`, body })
  }
  for (const [position, kind, arg] of events) {
    if (kind !== 'chapter' && kind !== 'verse') continue
    flush(position)
    start = position
    if (kind === 'chapter') {
      chapter = NUMBER.exec(arg)?.[1] ?? arg
      verse = ''
    } else verse = arg
  }
  flush(pieces.length)
  return out
}

const str = (v: string | boolean | undefined): string => (typeof v === 'string' ? v : '')

/** One row per verse of each text, per note, per question (question and response together) and per link. */
export function rowsOf(book: BookModel): PieceRow[] {
  const rows: PieceRow[] = []
  for (const t of book.texts) for (const v of verses(t.pieces, t.events)) rows.push({ kind: 'text', ref: v.ref, res: t.res, rid: '', body: v.body })
  for (const r of book.notes?.rows ?? []) rows.push({ kind: 'note', ref: r.ref, res: book.notes!.res, rid: r.id, body: str(r.cols.note) })
  for (const r of book.questions?.rows ?? [])
    rows.push({ kind: 'question', ref: r.ref, res: book.questions!.res, rid: r.id, body: `${str(r.cols.question)}\n${str(r.cols.response)}`.trim() })
  for (const r of book.links?.rows ?? [])
    rows.push({
      kind: 'link',
      ref: r.ref,
      res: book.links!.res,
      rid: r.id,
      body: [str(r.cols.origWords), str(r.cols.tags), str(r.cols.articlePath), r.concept ?? ''].filter((s) => s !== '').join(' '),
    })
  return rows.filter((r) => r.body !== '')
}

/** The words of a user's text worth searching: those with at least one letter or digit. */
export function queryWords(text: string): string[] {
  return text.split(/\s+/).filter((w) => /[\p{L}\p{N}]/u.test(w))
}
