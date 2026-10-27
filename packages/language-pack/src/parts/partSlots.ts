/**
 * Which part a cache row belongs to (spec §1). Groups are a fixed function of an item's name or number, never cut by
 * size or order, so a new article or entry never moves another one into a different part.
 */

import { ORIGINAL_LANGUAGE_KEYS, belongsTo, bookOfRow, isBookScoped, scansFor } from '../keys'
import type { PackLayer } from '../types'
import type { PartEntry, PartKind } from './partsList'

export type PartSlot = { kind: PartKind; resource: string; book?: string; group?: string }

/** The bucket counts are part of the compat key: changing one moves items between parts. */
export const TW_BUCKETS = 8
export const TA_TRANSLATE_BUCKETS = 4
export const LEXICON_RANGE = 1000
export const OBS_STORIES_PER_PART = 10

/** 32-bit FNV-1a of the text's UTF-8 bytes: the same everywhere, cheap, and spreads short names well. */
export function fnv1a32(text: string): number {
  let hash = 0x811c9dc5
  for (const byte of new TextEncoder().encode(text)) {
    hash ^= byte
    hash = Math.imul(hash, 0x01000193)
  }
  return hash >>> 0
}

export function slotId(slot: PartSlot): string {
  return [slot.kind, slot.resource, ...(slot.book ? [slot.book] : []), ...(slot.group ? [slot.group] : [])].join(':')
}

/** The slot a list entry fills: the builder and the importer place a part by this one rule. */
export function slotOfEntry(entry: PartEntry): PartSlot {
  return {
    kind: entry.kind,
    resource: entry.resource,
    ...(entry.book !== undefined ? { book: entry.book } : {}),
    ...(entry.group !== undefined ? { group: entry.group } : {}),
  }
}

type Resource = { key: string; type?: string; subject?: string }

const idOf = (key: string) => key.split('/').pop() ?? ''

function isObs(r: Resource): boolean {
  const id = idOf(r.key)
  return String(r.type ?? '').startsWith('obs') || id.startsWith('obs') || id.endsWith('-obs') || /\bOBS\b|Open Bible Stories/.test(String(r.subject ?? ''))
}
const isMacula = (r: Resource) => r.type === 'original-syntax' || idOf(r.key) === 'macula'
const isTw = (r: Resource) => r.type === 'words' || idOf(r.key) === 'tw' || r.subject === 'Translation Words'
const isTa = (r: Resource) => r.type === 'academy' || idOf(r.key) === 'ta' || r.subject === 'Translation Academy'
const isLexicon = (r: Resource) => r.type === 'lexicon' || idOf(r.key) === 'uhl' || idOf(r.key) === 'ugl'

/** Whether today's pack carries the row for this resource: the same scans `rowsOfResource` makes. */
function carried(row: { layer: PackLayer; key: string }, resourceKey: string): boolean {
  if (row.layer === 'receipt') return false
  return scansFor(resourceKey).some((scan) => scan.layer === row.layer && row.key.startsWith(scan.prefix) && belongsTo(row.key, resourceKey, scan))
}

/**
 * The article (or file) an article-style row is about: `{key}/{id}` (sot), or the unit of
 * `prepared:{type}:{key}:{id, lowercase}:{id}:{tier}` as the warm article jobs write it. The unit keeps the source
 * row's case, so both rows of one article hash alike.
 */
export function articleIdOfRow(row: { layer: PackLayer; key: string }, resourceKey: string): string | null {
  if (row.layer === 'sot' && row.key.startsWith(`${resourceKey}/`)) return row.key.slice(resourceKey.length + 1)
  if (row.layer === 'prepared') {
    const parts = row.key.split(':')
    return (parts.length >= 6 ? parts.slice(4, -1).join(':') : parts[3]) || null
  }
  return null
}

/** A TW article's group, from its row id (`bible/kt/god`) or its file (`bible/kt/god.md`): both give one group. */
export function twGroupOf(item: string): string | null {
  const m = item.replace(/^bible\//, '').match(/^(kt|names|other)\/(.+?)(?:\.md)?$/)
  return m ? `${m[1]}:${fnv1a32(`${m[1]}/${m[2]}.md`) % TW_BUCKETS}` : null
}

/** A TA article's group, from its row id (`translate/figs-idiom`) or any file under it (`translate/figs-idiom/01.md`). */
export function taGroupOf(item: string): string | null {
  const [manual, article] = item.split('/')
  if (!article || !['translate', 'checking', 'process', 'intro'].includes(manual)) return null
  // The manual is already the group; its article directory alone picks the bucket.
  return manual === 'translate' ? `translate:${fnv1a32(article) % TA_TRANSLATE_BUCKETS}` : manual
}

/** Every lexicon file has a part: a file named by no Strong number (an index, a manifest) goes in `other`. */
export function lexiconGroupOf(item: string): string {
  if (item.startsWith('domains/')) return 'domains'
  const m = item.match(/^content\/[^/\d]*(\d+)[^/]*$/)
  return m ? String(Math.floor(Number(m[1]) / LEXICON_RANGE)) : 'other'
}

/** The story a row of OBS or of its helps is about: the first number after the resource (the last, in derived keys). */
function obsGroup(row: { layer: PackLayer; key: string }, resourceKey: string): string {
  let segments: string[] = []
  if (row.layer === 'quote' || row.layer === 'align') segments = row.key.split(':').slice(-1)
  else if (row.layer === 'prepared') segments = row.key.split(':').slice(3)
  else if (row.key.startsWith(`${resourceKey}/`)) segments = row.key.slice(resourceKey.length + 1).split(/[/.]/)
  else {
    const head = row.key.indexOf(`${resourceKey}:`)
    if (head >= 0) segments = row.key.slice(head + resourceKey.length + 1).split(':')
  }
  const story = Number(segments.find((s) => /^\d+$/.test(s)))
  // Rows for the whole of OBS (which stories a helps resource has) go apart, so no story range depends on them.
  if (!Number.isInteger(story) || story < 1) return 'index'
  const low = Math.floor((story - 1) / OBS_STORIES_PER_PART) * OBS_STORIES_PER_PART + 1
  return `${low}-${low + OBS_STORIES_PER_PART - 1}`
}

/**
 * The part a row goes in, or null when no part carries it: receipts, rows of other resources and keys of no resource
 * (`warm-coverage:v1`). A row today's pack carries but no rule places throws: a part build must never lose a row.
 */
export function slotOfRow(row: { layer: PackLayer; key: string }, resource: Resource): PartSlot | null {
  const rk = resource.key
  if (!carried(row, rk)) return null
  const slot = placeRow(row, resource)
  if (!slot) throw new Error(`No part for the ${row.layer} row ${row.key} of ${rk}`)
  return slot
}

/** Which rules place a resource's rows (and say which of its files each part reads), in the order they are tried. */
export type ResourceFamily = 'original' | 'macula' | 'obs' | 'book' | 'tw' | 'ta' | 'lexicon'

export function familyOf(resource: Resource): ResourceFamily | null {
  if ((ORIGINAL_LANGUAGE_KEYS as readonly string[]).includes(resource.key)) return 'original'
  if (isMacula(resource)) return 'macula'
  if (isObs(resource)) return 'obs'
  if (isBookScoped(resource)) return 'book'
  if (isTw(resource)) return 'tw'
  if (isTa(resource)) return 'ta'
  if (isLexicon(resource)) return 'lexicon'
  return null
}

function placeRow(row: { layer: PackLayer; key: string }, resource: Resource): PartSlot | null {
  const rk = resource.key
  const family = familyOf(resource)
  if (family === 'original') {
    const book = bookOfRow(row.key, row.layer, rk)
    return book ? { kind: 'original', resource: rk, book } : null
  }
  if (family === 'macula') {
    const m = articleIdOfRow(row, rk)?.match(/^(?:trees|referents)\/([1-3A-Za-z]{3})$/)
    return m ? { kind: 'macula', resource: rk, book: m[1].toLowerCase() } : null
  }
  if (family === 'obs') return row.layer === 'text' ? null : { kind: 'obs', resource: rk, group: obsGroup(row, rk) }
  if (family === 'book') {
    if (row.layer === 'text') return null
    const book = bookOfRow(row.key, row.layer, rk)
    if (!book) return null
    return { kind: row.layer === 'align' ? 'alignments' : 'book', resource: rk, book }
  }
  if ((family === 'tw' || family === 'ta') && row.layer === 'text') return { kind: 'titles', resource: rk }
  const item = articleIdOfRow(row, rk)
  if (!item) return null
  const group = family === 'tw' ? twGroupOf(item) : family === 'ta' ? taGroupOf(item) : family === 'lexicon' ? lexiconGroupOf(item) : null
  if (!group || !family) return null
  return { kind: family, resource: rk, group }
}
