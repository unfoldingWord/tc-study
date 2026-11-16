/**
 * Full-text search over an FTS5 table, through a driver the host provides (bun:sqlite, wa-sqlite, expo-sqlite...). This file knows
 * no SQLite binding. The text of the user is never FTS5 syntax: each word is a quoted phrase of its own (all must match).
 */
import type { ArticleModel, BookModel, ObsModel } from '@bt-synergy/language-pack-v3'
import { stemForms, stemmerFor } from './stem'
import { DEFAULT_LIMIT, type Hit, INDEX_VERSION, type PieceRow, queryWords, rowsOf, rowsOfArticles, rowsOfObs, type SearchFilters, type SearchIndex } from './types'

export interface SqlDriver {
  exec(sql: string): Promise<void>
  run(sql: string, params: unknown[]): Promise<void>
  all<T>(sql: string, params: unknown[]): Promise<T[]>
  transaction<T>(fn: () => Promise<T>): Promise<T>
}

const TOKEN = /[\p{L}\p{N}]+/gu

/** All the stem forms of each token of the body, separated by spaces. */
const stemsOf = (lang: string, body: string, memo: Map<string, string>): string => {
  if (stemmerFor(lang) === undefined) return '' // no stemmer: the stems column stays empty and the match leaves out the stems terms
  return [...body.matchAll(TOKEN)]
    .map((m) => {
      const k = `${lang}|${m[0]}`
      let s = memo.get(k)
      if (s === undefined) memo.set(k, (s = stemForms(lang, m[0]).join(' ')))
      return s
    })
    .join(' ')
}

const foldWord = (s: string): string => s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase()

/** The body around its first matched word, with the matched words (by form or by stem) between « and ». */
function snippetOf(lang: string, body: string, words: string[]): string {
  const wanted = words.flatMap((w) => [...w.matchAll(TOKEN)].map((m) => ({ t: foldWord(m[0]), s: stemForms(lang, m[0]) })))
  const toks = [...body.matchAll(TOKEN)].map((m) => ({ w: m[0], start: m.index!, end: m.index! + m[0].length }))
  const marked = toks.map((k) => {
    const t = foldWord(k.w)
    const s = stemForms(lang, k.w)
    return wanted.some((x) => x.t === t || x.s.some((f) => s.includes(f)))
  })
  const first = marked.indexOf(true)
  if (first < 0) return body.slice(0, 80)
  const lo = Math.max(0, first - 6)
  const hi = Math.min(toks.length - 1, first + 6)
  let out = ''
  let at = toks[lo]!.start
  for (let i = lo; i <= hi; i++) {
    const k = toks[i]!
    out += body.slice(at, k.start) + (marked[i] ? `«${k.w}»` : k.w)
    at = k.end
  }
  return `${lo > 0 ? '…' : ''}${out}${hi < toks.length - 1 ? '…' : ''}`
}

const quote = (w: string): string => `"${w.replace(/"/g, '""')}"`

/** One group per query word: the word in the body, or (for a single token) one of its stems. */
function group(lang: string, w: string): string {
  const toks = [...w.matchAll(TOKEN)].map((m) => m[0])
  if (toks.length !== 1 || stemmerFor(lang) === undefined) return `(body : ${quote(w)})`
  return `(${['body : ' + quote(w), ...stemForms(lang, toks[0]!).map((f) => 'stems : ' + quote(f))].join(' OR ')})`
}

export function sqlIndex(driver: SqlDriver): SearchIndex {
  const stemMemo = new Map<string, string>()
  async function store(lang: string, bookName: string, rows: PieceRow[], segmentId: string): Promise<void> {
    await driver.transaction(async () => {
      await driver.run('DELETE FROM pieces WHERE seg = ?', [segmentId])
      await driver.run('DELETE FROM indexed WHERE seg = ?', [segmentId])
      for (const r of rows) {
        await driver.run('INSERT INTO pieces (body, stems, kind, lang, book, ref, res, rid, role, seg) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)', [
          r.body,
          stemsOf(lang, r.body, stemMemo),
          r.kind,
          lang,
          bookName,
          r.ref,
          r.res,
          r.rid,
          r.role ?? '',
          segmentId,
        ])
      }
      await driver.run('INSERT INTO indexed (seg, lang, book) VALUES (?, ?, ?)', [segmentId, lang, bookName])
    })
  }
  return {
    async init() {
      await driver.exec('CREATE TABLE IF NOT EXISTS meta (k TEXT PRIMARY KEY, v TEXT)')
      const v = await driver.all<{ v: string }>("SELECT v FROM meta WHERE k = 'version'", [])
      if (v[0]?.v !== String(INDEX_VERSION)) await driver.exec('DROP TABLE IF EXISTS pieces; DROP TABLE IF EXISTS indexed; DROP TABLE IF EXISTS meta; CREATE TABLE meta (k TEXT PRIMARY KEY, v TEXT);')
      await driver.exec(
        `CREATE VIRTUAL TABLE IF NOT EXISTS pieces USING fts5(body, stems, kind UNINDEXED, lang UNINDEXED, book UNINDEXED, ref UNINDEXED, res UNINDEXED, rid UNINDEXED, role UNINDEXED, seg UNINDEXED, tokenize = 'unicode61 remove_diacritics 2');
         CREATE TABLE IF NOT EXISTS indexed (seg TEXT PRIMARY KEY, lang TEXT, book TEXT);`,
      )
      await driver.run("INSERT OR REPLACE INTO meta (k, v) VALUES ('version', ?)", [String(INDEX_VERSION)])
    },
    async addBook(lang: string, book: BookModel, segmentId: string) {
      await store(lang, book.book, rowsOf(book), segmentId)
    },
    async addObs(lang: string, obs: ObsModel, segmentId: string) {
      await store(lang, 'obs', rowsOfObs(obs), segmentId)
    },
    async addArticles(lang: string, articles: ArticleModel[], segmentId: string) {
      await store(lang, '', rowsOfArticles(articles), segmentId)
    },
    async removeSegment(segmentId) {
      await driver.transaction(async () => {
        await driver.run('DELETE FROM pieces WHERE seg = ?', [segmentId])
        await driver.run('DELETE FROM indexed WHERE seg = ?', [segmentId])
      })
    },
    async has(segmentId) {
      return (await driver.all('SELECT seg FROM indexed WHERE seg = ?', [segmentId])).length > 0
    },
    async search(lang, text, f: SearchFilters = {}) {
      const words = queryWords(text)
      if (words.length === 0) return []
      const match = words.map((w) => group(lang, w)).join(' AND ')
      const params: unknown[] = [match, lang]
      let where = 'pieces MATCH ? AND lang = ?'
      if (f.books !== undefined) {
        if (f.books.length === 0) return []
        where += ` AND book IN (${f.books.map(() => '?').join(', ')})`
        params.push(...f.books)
      }
      if (f.kinds !== undefined) {
        if (f.kinds.length === 0) return []
        where += ` AND kind IN (${f.kinds.map(() => '?').join(', ')})`
        params.push(...f.kinds)
      }
      params.push(f.limit ?? DEFAULT_LIMIT)
      type Row = { kind: string; book: string; ref: string; res: string; rid: string; role: string; body: string; rank: number }
      const rows = await driver.all<Row>(
        `SELECT kind, book, ref, res, rid, role, body, bm25(pieces) AS rank FROM pieces WHERE ${where} ORDER BY rank LIMIT ?`,
        params,
      )
      return rows.map(
        (r): Hit => ({
          kind: r.kind,
          book: r.book,
          ref: r.ref,
          res: r.res,
          ...(r.rid !== '' ? { id: r.rid } : {}),
          ...(r.kind === 'section' && r.role !== '' ? { role: r.role } : {}),
          snippet: snippetOf(lang, r.body, words),
          score: -r.rank,
        }),
      )
    },
  }
}
