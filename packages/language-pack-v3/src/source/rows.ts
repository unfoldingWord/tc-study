/**
 * Row sources: today's language data (format 2.0 parts, format 1.1 packs) read as streams of rows, which the builders
 * of format 3 turn into segments. A row is a cache row as a pack carries it: its layer, its key and its value.
 *
 * Nothing here imports a Node module (a browser or a Worker can use it): `zipSource` is in `zipSource.ts`; the parts
 * on a disk are read by `node/partsSource.ts`.
 *
 * ## Order
 *
 * A source gives its rows in a stable order, the same on every run, so that anything built from them is too:
 * - **parts**: the order of the list's `parts`, then of the lines in each part;
 * - **packs** (format 1.1): the order of the manifest's `resources`; in each resource the layers `sot`, `prepared`,
 *   `quote`, `align`, `text`, `index` (`LAYERS`), then the lines of that layer's file.
 *
 * The two orders differ, so rows are compared as sets (a multiset of `(layer, key)`), never as sequences.
 *
 * ## Filters
 *
 * `rows({ lang, book?, resource?, layer? })` keeps the rows that match every field given:
 * - `lang`: the language of the source (`es-419`), or `'originals'` for the original languages. A language the source
 *   does not hold has no rows and no resources (an empty sequence, not an error).
 * - `book`: lowercase USFM code. A row that is not about one book (tW, tA, lexicons, titles) matches no book.
 * - `resource`: the key of the resource (`{owner}/{language}/{id}`), as `ResourceRef.key` gives it.
 * - `layer`: `sot`, `prepared`, `quote`, `align`, `text` or `index`. Receipts are not rows of a source.
 */

import { ungzip } from 'pako'

/** A row of the cache: `layer` says what it is (§2 of the old format), `key` is its cache key, `value` its content. */
export type Row = { layer: string; key: string; value: unknown }

export type ResourceRef = {
  /** `{owner}/{language}/{id}`, e.g. `es-419_gl/es-419/glt`. */
  key: string
  /** The release of the resource the rows were made from: `resourceContentStamp` of its catalog row (`v42#2026-08-11T12_22_03Z`). */
  stamp: string
  /** What the resource is: the Door43 subject of its catalog row (`Aligned Bible`, `TSV Translation Notes`, `Greek Lexicon`). */
  kind: string
  /** The books (lowercase, sorted) this source has rows for; empty for a resource that is not about one book. */
  books: string[]
}

export type RowFilter = { lang: string; book?: string; resource?: string; layer?: string }

export interface RowSource {
  rows(f: RowFilter): AsyncIterable<Row>
  /** `lang` is `'originals'` for the original languages. */
  resources(lang: string): Promise<ResourceRef[]>
}

/** `lang` of the original languages (UGNT, UHB, MACULA), the same for every language. */
export const ORIGINALS = 'originals'

/** The layers a source reads, in the order a pack gives them. Receipts say a release is complete: no row of a part has one. */
export const LAYERS: readonly string[] = ['sot', 'prepared', 'quote', 'align', 'text', 'index']

/** The non-empty lines of a text. */
export function lines(text: string): string[] {
  return text.split('\n').filter((line) => line.length > 0)
}

/** The rows of a part file (`parts/<sha256>.part.gz`): gzip of JSONL `{"layer","key","value"}`. */
export function partRows(bytes: Uint8Array): Row[] {
  const out: Row[] = []
  for (const line of lines(new TextDecoder().decode(ungzip(bytes)))) {
    const row = JSON.parse(line) as Partial<Row>
    if (typeof row.layer !== 'string' || typeof row.key !== 'string' || !('value' in row)) {
      throw new Error(`A row of a part needs a layer, a key and a value: ${line.slice(0, 80)}`)
    }
    out.push({ layer: row.layer, key: row.key, value: row.value })
  }
  return out
}
