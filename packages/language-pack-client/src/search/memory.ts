/** The index in memory: the fallback of a reader (and the one of a Worker) when the host gives no SQL driver. Same matches as `sqlIndex`,
 * ranked differently: here by word count over the square root of the piece length, there by SQLite's bm25. With
 * more matches than the limit, the two can keep different hits. */
import type { BookModel } from '@bt-synergy/language-pack-v3'
import { DEFAULT_LIMIT, type Hit, type PieceRow, queryWords, rowsOf, type SearchFilters, type SearchIndex } from './types'

const fold = (s: string): string => s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase()

type Tok = { t: string; start: number; end: number }
function tokens(s: string): Tok[] {
  return [...s.matchAll(/[\p{L}\p{N}]+/gu)].map((m) => ({ t: fold(m[0]), start: m.index!, end: m.index! + m[0].length }))
}

type Row = PieceRow & { lang: string; book: string; seg: string; toks: Tok[] }

/** Where the phrase (the tokens of one query word) starts in the row, in token indexes. */
function phraseAt(toks: Tok[], phrase: string[]): number[] {
  const at: number[] = []
  for (let i = 0; i + phrase.length <= toks.length; i++) if (phrase.every((p, k) => toks[i + k]!.t === p)) at.push(i)
  return at
}

export function memoryIndex(): SearchIndex {
  let rows: Row[] = []
  const segs = new Set<string>()
  return {
    async init() {},
    async addBook(lang: string, book: BookModel, segmentId: string) {
      rows = rows.filter((r) => r.seg !== segmentId)
      for (const r of rowsOf(book)) rows.push({ ...r, lang, book: book.book, seg: segmentId, toks: tokens(r.body) })
      segs.add(segmentId)
    },
    async removeSegment(segmentId) {
      rows = rows.filter((r) => r.seg !== segmentId)
      segs.delete(segmentId)
    },
    async has(segmentId) {
      return segs.has(segmentId)
    },
    async search(lang, text, f: SearchFilters = {}) {
      const phrases = queryWords(text)
        .map((w) => tokens(w).map((x) => x.t))
        .filter((p) => p.length > 0)
      if (phrases.length === 0) return []
      const hits: Hit[] = []
      for (const r of rows) {
        if (r.lang !== lang || (f.books !== undefined && !f.books.includes(r.book)) || (f.kinds !== undefined && !f.kinds.includes(r.kind))) continue
        const found = phrases.map((p) => phraseAt(r.toks, p).map((i) => [i, p.length] as const))
        if (found.some((x) => x.length === 0)) continue
        const marked = new Set<number>()
        let count = 0
        for (const list of found) {
          for (const [i, n] of list) {
            count++
            for (let k = 0; k < n; k++) marked.add(i + k)
          }
        }
        const first = Math.min(...marked)
        const lo = Math.max(0, first - 6)
        const hi = Math.min(r.toks.length - 1, first + 6)
        let snippet = ''
        let at = r.toks[lo]!.start
        for (let i = lo; i <= hi; i++) {
          const tk = r.toks[i]!
          const word = r.body.slice(tk.start, tk.end)
          snippet += r.body.slice(at, tk.start) + (marked.has(i) ? `«${word}»` : word)
          at = tk.end
        }
        hits.push({
          kind: r.kind,
          book: r.book,
          ref: r.ref,
          res: r.res,
          ...(r.rid !== '' ? { id: r.rid } : {}),
          snippet: `${lo > 0 ? '…' : ''}${snippet}${hi < r.toks.length - 1 ? '…' : ''}`,
          score: count / Math.sqrt(r.toks.length),
        })
      }
      return hits.sort((a, b) => b.score - a.score).slice(0, f.limit ?? DEFAULT_LIMIT)
    },
  }
}
