/** The index in memory: the fallback of a reader (and the one of a Worker) when the host gives no SQL driver. It does not have the same
 * matches as `sqlIndex` for a query word of several tokens (here each token is compared by form or stem, there the words are a phrase of
 * the body), and it ranks differently: here by word count over the square root of the piece length, there by SQLite's bm25. With
 * more matches than the limit, the two can keep different hits. Token forms are interned per index (one {t, s} per language and word),
 * so a book does not hold one stem array per occurrence. */
import type { ArticleModel, BookModel, ObsModel } from '@bt-synergy/language-pack-v3'
import { stemForms } from './stem'
import { DEFAULT_LIMIT, type Hit, type PieceRow, queryWords, rowsOf, rowsOfArticles, rowsOfObs, type SearchFilters, type SearchIndex } from './types'

const fold = (s: string): string => s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase()

/** `t` is the folded word, `s` its stem forms in the language of the row (or of the query). */
type Tok = { t: string; s: string[]; start: number; end: number }
/** A tokenizer with its own table of forms: two tokens of the same language and word share the same `s` array. */
export function tokenizer(): (s: string, lang: string) => Tok[] {
  const forms = new Map<string, { t: string; s: string[] }>()
  return (s, lang) =>
    [...s.matchAll(/[\p{L}\p{N}]+/gu)].map((m) => {
      const k = `${lang}|${m[0]}`
      let f = forms.get(k)
      if (f === undefined) forms.set(k, (f = { t: fold(m[0]), s: stemForms(lang, m[0]) }))
      return { t: f.t, s: f.s, start: m.index!, end: m.index! + m[0].length }
    })
}

const sameWord = (a: Tok, b: Tok): boolean => a.t === b.t || a.s.some((x) => b.s.includes(x))

type Row = PieceRow & { lang: string; book: string; seg: string; toks: Tok[] }

/** Where the phrase (the tokens of one query word) starts in the row, in token indexes. */
function phraseAt(toks: Tok[], phrase: Tok[]): number[] {
  const at: number[] = []
  for (let i = 0; i + phrase.length <= toks.length; i++) if (phrase.every((p, k) => sameWord(toks[i + k]!, p))) at.push(i)
  return at
}

export function memoryIndex(): SearchIndex {
  let rows: Row[] = []
  const tokens = tokenizer()
  const segs = new Set<string>()
  return {
    async init() {},
    async addBook(lang: string, book: BookModel, segmentId: string) {
      rows = rows.filter((r) => r.seg !== segmentId)
      for (const r of rowsOf(book)) rows.push({ ...r, lang, book: book.book, seg: segmentId, toks: tokens(r.body, lang) })
      segs.add(segmentId)
    },
    async addObs(lang: string, obs: ObsModel, segmentId: string) {
      rows = rows.filter((r) => r.seg !== segmentId)
      for (const r of rowsOfObs(obs)) rows.push({ ...r, lang, book: 'obs', seg: segmentId, toks: tokens(r.body, lang) })
      segs.add(segmentId)
    },
    async addArticles(lang: string, articles: ArticleModel[], segmentId: string) {
      rows = rows.filter((r) => r.seg !== segmentId)
      for (const r of rowsOfArticles(articles)) rows.push({ ...r, lang, book: '', seg: segmentId, toks: tokens(r.body, lang) })
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
        .map((w) => tokens(w, lang))
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
          ...(r.kind === 'section' && r.role !== undefined ? { role: r.role } : {}),
          snippet: `${lo > 0 ? '…' : ''}${snippet}${hi < r.toks.length - 1 ? '…' : ''}`,
          score: count / Math.sqrt(r.toks.length),
        })
      }
      return hits.sort((a, b) => b.score - a.score).slice(0, f.limit ?? DEFAULT_LIMIT)
    },
  }
}
