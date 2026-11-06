/**
 * Full-text search over an FTS5 table, through a driver the host provides (bun:sqlite, wa-sqlite, expo-sqlite...). This file knows
 * no SQLite binding. The text of the user is never FTS5 syntax: each word is a quoted phrase of its own (all must match).
 */
import type { BookModel } from '@bt-synergy/language-pack-v3'
import { DEFAULT_LIMIT, type Hit, queryWords, rowsOf, type SearchFilters, type SearchIndex } from './types'

export interface SqlDriver {
  exec(sql: string): Promise<void>
  run(sql: string, params: unknown[]): Promise<void>
  all<T>(sql: string, params: unknown[]): Promise<T[]>
  transaction<T>(fn: () => Promise<T>): Promise<T>
}

export function sqlIndex(driver: SqlDriver): SearchIndex {
  return {
    async init() {
      await driver.exec(
        `CREATE VIRTUAL TABLE IF NOT EXISTS pieces USING fts5(body, kind UNINDEXED, lang UNINDEXED, book UNINDEXED, ref UNINDEXED, res UNINDEXED, rid UNINDEXED, seg UNINDEXED, tokenize = 'unicode61 remove_diacritics 2');
         CREATE TABLE IF NOT EXISTS indexed (seg TEXT PRIMARY KEY, lang TEXT, book TEXT);`,
      )
    },
    async addBook(lang: string, book: BookModel, segmentId: string) {
      const rows = rowsOf(book)
      await driver.transaction(async () => {
        await driver.run('DELETE FROM pieces WHERE seg = ?', [segmentId])
        await driver.run('DELETE FROM indexed WHERE seg = ?', [segmentId])
        for (const r of rows) {
          await driver.run('INSERT INTO pieces (body, kind, lang, book, ref, res, rid, seg) VALUES (?, ?, ?, ?, ?, ?, ?, ?)', [
            r.body,
            r.kind,
            lang,
            book.book,
            r.ref,
            r.res,
            r.rid,
            segmentId,
          ])
        }
        await driver.run('INSERT INTO indexed (seg, lang, book) VALUES (?, ?, ?)', [segmentId, lang, book.book])
      })
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
      const match = words.map((w) => `"${w.replace(/"/g, '""')}"`).join(' ')
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
      type Row = { kind: string; book: string; ref: string; res: string; rid: string; snippet: string; rank: number }
      const rows = await driver.all<Row>(
        `SELECT kind, book, ref, res, rid, snippet(pieces, 0, '«', '»', '…', 12) AS snippet, bm25(pieces) AS rank FROM pieces WHERE ${where} ORDER BY rank LIMIT ?`,
        params,
      )
      return rows.map(
        (r): Hit => ({
          kind: r.kind,
          book: r.book,
          ref: r.ref,
          res: r.res,
          ...(r.rid !== '' ? { id: r.rid } : {}),
          snippet: r.snippet,
          score: -r.rank,
        }),
      )
    },
  }
}
