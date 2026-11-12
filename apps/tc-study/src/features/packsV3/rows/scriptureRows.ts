import type { PackReader } from '@bt-synergy/language-pack-client'
import { bookUsfm, origUsfm } from '@bt-synergy/language-pack-v3'
import { processUsfmToUsjResult, writeUsjChapters } from '@bt-synergy/scripture-loader'

/** One row of `tc-study-cache`: the key and the value as the Door43 loaders write them. */
export type Row = { key: string; value: unknown }

/**
 * The rows `ScriptureLoader` writes for one USFM text: the same processor and the same chapter writer, over a cache that
 * collects the rows instead of storing them, so keys and values cannot drift from Door43's.
 */
async function rowsOfUsfm(usfmText: string, resourceKey: string, book: string): Promise<Row[]> {
  const bookId = book.toLowerCase()
  const result = await processUsfmToUsjResult({ usfmText, bookId, bookName: bookId.toUpperCase() })
  const rows: Row[] = []
  await writeUsjChapters(
    {
      get: async () => undefined,
      setMany: async (items) => void rows.push(...items.map(({ key, entry }) => ({ key, value: entry }))),
    },
    resourceKey,
    bookId,
    result.cacheContent,
  )
  return rows
}

/**
 * A space the segment keeps between two aligned groups (`\w*` and `\zaln-e`, or `\zaln-e\*` and `\zaln-s`) is not in the
 * USJ Door43 loads: the source USFM puts a line break there and the parser drops it. The rows must equal Door43's, so the
 * space is left out of the USFM the processor reads. A space inside a group, between two words, stays.
 */
export const withoutMilestoneGaps = (usfm: string): string =>
  usfm.replace(/(\\w\*|\\zaln-e\\\*) +(?=(?:\\zaln-e\\\*)*\\zaln-s )/g, '$1')

/**
 * `scripture-usj:` rows (a row per chapter and the book index) of every Bible the language has for the book. The resource
 * key is the text's `res` as the catalog writes it. Empty when the language has no such book.
 */
export async function scriptureRows(reader: PackReader, book: string): Promise<Row[]> {
  const model = await reader.book(book)
  if (!model) return []
  const orig = await reader.orig(model.book)
  if (!orig) return []
  const rows: Row[] = []
  for (let i = 0; i < model.texts.length; i++) {
    rows.push(...(await rowsOfUsfm(withoutMilestoneGaps(bookUsfm(model, i, orig)), model.texts[i]!.res, book)))
  }
  return rows
}

/** The same for the original of the book: UGNT (`unfoldingWord/el-x-koine/ugnt`) or UHB (`unfoldingWord/hbo/uhb`). */
export async function origRows(reader: PackReader, book: string): Promise<Row[]> {
  const orig = await reader.orig(book)
  if (!orig) return []
  return rowsOfUsfm(origUsfm(orig), orig.key, book)
}
