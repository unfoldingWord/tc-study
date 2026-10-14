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

/** NT and OT original languages, whose scripture the quotes of notes and word links are built against (§6). */
export const ORIGINAL_LANGUAGE_KEYS = ['unfoldingWord/el-x-koine/ugnt', 'unfoldingWord/hbo/uhb'] as const

/** A file name for a resource key: readable and unique (keys are kept inside each row, never rebuilt from it). */
export function fileSafe(resourceKey: string): string {
  return encodeURIComponent(resourceKey).replace(/%/g, '~')
}
