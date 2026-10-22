/**
 * Which part a cache row belongs to (spec §1). Groups are a fixed function of an item's name or number, never cut by
 * size or order, so a new article or entry never moves another one into a different part.
 */

import { ORIGINAL_LANGUAGE_KEYS, belongsTo, bookOfRow, isBookScoped, scansFor } from '../keys'
import type { PackLayer } from '../types'
import type { PartKind } from './partsList'

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

/** What an article-style row names after its resource: `{key}/{item}` (sot) or `prepared:{type}:{key}:{item}`. */
function itemOf(row: { layer: PackLayer; key: string }, resourceKey: string): string | null {
  if (row.layer === 'sot' && row.key.startsWith(`${resourceKey}/`)) return row.key.slice(resourceKey.length + 1)
  if (row.layer === 'prepared') return row.key.split(':').slice(3).join(':') || null
  return null
}

function twGroup(item: string): string | null {
  const m = item.replace(/^bible\//, '').match(/^(kt|names|other)\/(.+?)(?:\.md)?$/)
  return m ? `${m[1]}:${fnv1a32(`${m[1]}/${m[2]}.md`) % TW_BUCKETS}` : null
}

function taGroup(item: string): string | null {
  const [manual, article] = item.split('/')
  if (!article || !['translate', 'checking', 'process', 'intro'].includes(manual)) return null
  // The manual is already the group; its article directory alone picks the bucket.
  return manual === 'translate' ? `translate:${fnv1a32(article) % TA_TRANSLATE_BUCKETS}` : manual
}

function lexiconGroup(item: string): string | null {
  if (item.startsWith('domains/')) return 'domains'
  const m = item.match(/^content\/[^/\d]*(\d+)[^/]*$/)
  return m ? String(Math.floor(Number(m[1]) / LEXICON_RANGE)) : null
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
 * The part a row goes in, or null when no part carries it: receipts, rows of other resources, keys of no resource
 * (`warm-coverage:v1`), and rows of a resource whose item no rule names.
 */
export function slotOfRow(row: { layer: PackLayer; key: string }, resource: Resource): PartSlot | null {
  const rk = resource.key
  if (!carried(row, rk)) return null

  if ((ORIGINAL_LANGUAGE_KEYS as readonly string[]).includes(rk)) {
    const book = bookOfRow(row.key, row.layer, rk)
    return book ? { kind: 'original', resource: rk, book } : null
  }
  if (isMacula(resource)) {
    const m = itemOf(row, rk)?.match(/^(?:trees|referents)\/([1-3A-Za-z]{3})$/)
    return m ? { kind: 'macula', resource: rk, book: m[1].toLowerCase() } : null
  }
  if (isObs(resource)) return row.layer === 'text' ? null : { kind: 'obs', resource: rk, group: obsGroup(row, rk) }
  if (isBookScoped(resource)) {
    if (row.layer === 'text') return null
    const book = bookOfRow(row.key, row.layer, rk)
    if (!book) return null
    return { kind: row.layer === 'align' ? 'alignments' : 'book', resource: rk, book }
  }
  const tw = isTw(resource)
  const ta = !tw && isTa(resource)
  if ((tw || ta) && row.layer === 'text') return { kind: 'titles', resource: rk }
  const item = itemOf(row, rk)
  if (!item) return null
  const group = tw ? twGroup(item) : ta ? taGroup(item) : isLexicon(resource) ? lexiconGroup(item) : null
  if (!group) return null
  return { kind: tw ? 'tw' : ta ? 'ta' : 'lexicon', resource: rk, group }
}
