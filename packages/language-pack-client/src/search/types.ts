/** The search index contract and the rows of a book that both indexes keep. No Node module here. */
import type { ArticleModel, BookModel, Event, ObsModel, Piece } from '@bt-synergy/language-pack-v3'

export type SearchKind = 'text' | 'note' | 'question' | 'link' | 'title' | 'section'

export type SearchFilters = { books?: string[]; kinds?: SearchKind[]; limit?: number }

/** The keys of `SearchFilters`, for the test that checks the `search` schema against the method. */
export const SEARCH_FILTER_KEYS: Record<keyof SearchFilters, true> = { books: true, kinds: true, limit: true }

export const DEFAULT_LIMIT = 20

/** Version of the index layout. A stored index with another version is dropped and rebuilt by `init()`. */
export const INDEX_VERSION = 2

/**
 * `ref` is the reference as the resource has it (`1:1`), `res` the resource key, `id` the row id of a note, question or link.
 * `snippet` is a piece of the body with the matched words between « and ». `score` is higher for a better match.
 */
export type Hit = { kind: string; book: string; ref: string; res: string; id?: string; snippet: string; score: number }

export interface SearchIndex {
  init(): Promise<void>
  addBook(lang: string, book: BookModel, segmentId: string): Promise<void>
  /** The rows of the `obs` unit, with `book: 'obs'` (`rowsOfObs`). */
  addObs(lang: string, obs: ObsModel, segmentId: string): Promise<void>
  addArticles(lang: string, articles: ArticleModel[], segmentId: string): Promise<void>
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

const pad = (n: number): string => String(n).padStart(2, '0')
const frameRef = (frame: number): string => `${pad(Math.floor(frame / 100))}:${pad(frame % 100)}`

/** The rows of Open Bible Stories: a title (`NN:0`, none when the title is empty), each frame, each note (quote and note), each question (question and response). */
export function rowsOfObs(obs: ObsModel): PieceRow[] {
  const rows: PieceRow[] = []
  for (const s of obs.stories) {
    rows.push({ kind: 'title', ref: `${pad(s.n)}:0`, res: s.res, rid: '', body: s.title.trim() })
    for (const f of s.frames) rows.push({ kind: 'text', ref: `${pad(s.n)}:${pad(f.n)}`, res: s.res, rid: '', body: f.text })
  }
  for (const r of obs.notes?.rows ?? [])
    rows.push({ kind: 'note', ref: frameRef(r.frame), res: obs.notes!.res, rid: r.id, body: `${str(r.cols.quote)} ${str(r.cols.note)}`.trim() })
  for (const r of obs.questions?.rows ?? [])
    rows.push({ kind: 'question', ref: frameRef(r.frame), res: obs.questions!.res, rid: r.id, body: `${str(r.cols.question)}\n${str(r.cols.response)}`.trim() })
  return rows.filter((r) => r.body !== '')
}

/** One row per section with text: the article title, the section title and the text. A section hit has no book and no ref. */
export function rowsOfArticles(articles: ArticleModel[]): PieceRow[] {
  const rows: PieceRow[] = []
  for (const a of articles)
    for (const s of a.sections) {
      if (s.md.trim() === '') continue
      rows.push({ kind: 'section', ref: '', res: a.res, rid: `${a.id}#${s.sid}`, body: [a.title, s.title ?? '', s.md].filter((x) => x !== '').join('\n') })
    }
  return rows
}

/** The words of a user's text worth searching: those with at least one letter or digit. */
export function queryWords(text: string): string[] {
  return text.split(/\s+/).filter((w) => /[\p{L}\p{N}]/u.test(w))
}
