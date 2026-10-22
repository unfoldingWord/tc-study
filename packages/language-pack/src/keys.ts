/**
 * Which cache rows belong to a resource, and to which layer, from the key conventions of
 * apps/tc-study/docs/cache-data-structure.md §3:
 *
 * - receipt   `resource:{key}`
 * - sot       `scripture-usj:{key}:…`, `tn:{key}:…`, `twl:{key}:…`, `tq:{key}:…`, `obs:{key}:…`, articles `{key}/…`
 * - prepared  `prepared:{type}:{key}:…`
 * - quote     `helps-quote:{key}@…` (the helps resource comes first)
 * - align     `helps-align:{key}@…`
 * - text      `helps-text:{kind}:{key}@…`
 */

import type { PackLayer } from './types'

const SOT_PREFIXES = ['scripture-usj:', 'tn:', 'twl:', 'tq:', 'obs:'] as const

/** The prefixes to scan in the store to find every row of `resourceKey`, with the layer each one gives. */
export function scansFor(resourceKey: string): Array<{ prefix: string; layer: PackLayer; exact?: boolean }> {
  return [
    { prefix: `resource:${resourceKey}`, layer: 'receipt', exact: true },
    ...SOT_PREFIXES.map((p) => ({ prefix: `${p}${resourceKey}:`, layer: 'sot' as const })),
    // A book key without a chapter (`tn:{key}:{book}`) is a row of its own; chapter chunks start with it.
    { prefix: `${resourceKey}/`, layer: 'sot' },
    { prefix: 'prepared:', layer: 'prepared' },
    { prefix: `helps-quote:${resourceKey}@`, layer: 'quote' },
    { prefix: `helps-align:${resourceKey}@`, layer: 'align' },
    { prefix: 'helps-text:', layer: 'text' },
  ]
}

/**
 * Whether a row found by a scan really belongs to `resourceKey`. The broad scans (`prepared:`, `helps-text:`) find
 * the rows of every resource, so their middle part is checked; `resource:{key}` must be the key itself, not a longer
 * key that starts with it (`…/tn` and `…/tn-extra`).
 */
export function belongsTo(key: string, resourceKey: string, scan: { prefix: string; layer: PackLayer; exact?: boolean }): boolean {
  if (scan.exact) return key === scan.prefix
  if (scan.layer === 'prepared') return key.split(':')[2] === resourceKey
  if (scan.layer === 'text') return (key.split(':')[2] ?? '').startsWith(`${resourceKey}@`)
  return key.startsWith(scan.prefix)
}

/** Resource types whose rows are kept book by book; everything else (TA, TW, OBS…) is not about one book. */
const BOOK_SCOPED_TYPES = new Set(['scripture', 'notes', 'questions', 'words-links'])
/**
 * The Door43 subjects of those types, as tc-study's resource types list them. tc-study's catalog rows say
 * `type: 'unknown'` for some of them (word links, for one), so the subject decides as well.
 */
const BOOK_SCOPED_SUBJECTS = new Set([
  'Bible',
  'Aligned Bible',
  'Greek New Testament',
  'Hebrew Old Testament',
  'TSV Translation Notes',
  'TSV Translation Questions',
  'TSV Translation Words Links',
])

/** Whether a resource's rows are kept book by book, from its catalog row. */
export function isBookScoped(metadata: { type?: unknown; subject?: unknown }): boolean {
  return BOOK_SCOPED_TYPES.has(String(metadata.type ?? '')) || BOOK_SCOPED_SUBJECTS.has(String(metadata.subject ?? ''))
}

/**
 * The book a row of `resourceKey` is about, lowercase, or null for rows that are not about one book (receipts,
 * articles, titles). Source rows carry it right after the resource key (`tn:{key}:{book}…`), prepared rows in their
 * fourth part (`prepared:{type}:{key}:{book}:…`), quotes and aligned quotes before the chapter (`…:{book}:{chapter}`).
 */
export function bookOfRow(key: string, layer: PackLayer, resourceKey: string): string | null {
  if (layer === 'sot') {
    for (const prefix of SOT_PREFIXES) {
      const head = `${prefix}${resourceKey}:`
      if (key.startsWith(head)) return key.slice(head.length).split(':')[0].toLowerCase() || null
    }
    return null
  }
  if (layer === 'prepared') return key.split(':')[3]?.toLowerCase() || null
  if (layer === 'quote' || layer === 'align') {
    const parts = key.split(':')
    return parts.length >= 2 ? parts[parts.length - 2].toLowerCase() : null
  }
  return null
}

/** The original a quote or aligned-quote row was built against, and the book the row is about. */
export type DerivedRowOriginal = {
  key: string
  /**
   * The original's stamp for that book, without the `+{usj}` suffix: the book file's blob stamp (`g` + hex), or the
   * release stamp when no blob was recorded (`bookContentStamp` of the original's catalog row).
   */
  stamp: string
  /** Lowercase, as keys write it. */
  book: string
}

/**
 * The original-language book a quote or aligned-quote row was built against. Their keys name it third and the book
 * second to last: `helps-quote:{helps}@{stamp}:{original}@{stamp}+{usj}:…:{book}:{chapter}` (stamps never hold `:`).
 */
export function originalOfDerivedRow(key: string): DerivedRowOriginal | null {
  const parts = key.split(':')
  const part = parts[2]
  if (!part || parts.length < 5) return null
  const at = part.indexOf('@')
  if (at <= 0) return null
  // The `+{usj}` suffix is always last; a release stamp may hold a `+` of its own (a `+02:00` offset)
  const rest = part.slice(at + 1)
  const plus = rest.lastIndexOf('+')
  return { key: part.slice(0, at), stamp: plus < 0 ? rest : rest.slice(0, plus), book: parts[parts.length - 2].toLowerCase() }
}

/** NT and OT original languages, whose scripture the quotes of notes and word links are built against (§6). */
export const ORIGINAL_LANGUAGE_KEYS = ['unfoldingWord/el-x-koine/ugnt', 'unfoldingWord/hbo/uhb'] as const

/** A file name for a resource key: readable and unique (keys are kept inside each row, never rebuilt from it). */
export function fileSafe(resourceKey: string): string {
  return encodeURIComponent(resourceKey).replace(/%/g, '~')
}
