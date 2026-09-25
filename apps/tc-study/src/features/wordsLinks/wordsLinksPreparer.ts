/**
 * Translation Words Links preparer — light + full chapter rows.
 * React-free; safe for workers. Reads `twl:{resourceKey}:{book}` cache.
 */

import type {
  ProcessedWordsLinks,
  TranslationWordsLink,
} from '@bt-synergy/resource-parsers'
import { RESOURCE_TYPE_IDS } from '../../resourceTypes/resourceTypeIds'
import { semanticIdMatchKey } from '../helps/semanticIdMatchKey'
import {
  registerPreparer,
  type PrepareContext,
  type ResourcePreparer,
} from '../prepare/prepareRegistry'

/** Bump when light/full row shape changes (invalidates prepared: rows). */
export const WORDS_LINKS_PREPARE_VERSION = 1

export function twlCacheKey(resourceKey: string, bookId: string): string {
  return `twl:${resourceKey}:${bookId}`
}

/** Resolve bible/kt/god from an rc:// tw dict link. */
export function articlePathFromTwLink(twLink: string | undefined | null): string {
  if (!twLink) return ''
  const m = twLink.match(/rc:\/\/\*\/tw\/dict\/(.+)$/)
  return m?.[1] ?? ''
}

export interface WordsLinksLightRow {
  id: string
  reference: string
  origWords: string
  occurrence: string
  twLink: string
  tags: string
  articlePath: string
}

export interface WordsLinksFullRow {
  id: string
  reference: string
  origWords: string
  occurrence: string
  twLink: string
  tags: string
  articlePath: string
  /** Folded origWords surface for cheap matching. */
  quoteFolded?: string
}

export interface WordsLinksNavRecord {
  version: number
  bookId: string
  bookName: string
  chapters: number[]
  totalLinks: number
}

export interface WordsLinksLightChapter {
  version: number
  unit: number
  links: WordsLinksLightRow[]
}

export interface WordsLinksFullChapter {
  version: number
  unit: number
  links: WordsLinksFullRow[]
}

export type WordsLinksSource = {
  resourceKey: string
  bookId: string
  links: ProcessedWordsLinks
}

function unwrapCacheEntry(entry: unknown): ProcessedWordsLinks | null {
  if (!entry || typeof entry !== 'object') return null
  const e = entry as Record<string, unknown>
  if (e.linksByChapter || Array.isArray(e.links)) {
    return e as unknown as ProcessedWordsLinks
  }
  if (e.content && typeof e.content === 'object') {
    return unwrapCacheEntry(e.content)
  }
  return null
}

function linksForUnit(source: WordsLinksSource, unit: number): TranslationWordsLink[] {
  const byChapter = source.links.linksByChapter
  if (byChapter && typeof byChapter === 'object') {
    return byChapter[String(unit)] ?? []
  }
  return (source.links.links ?? []).filter((l) => {
    const ch = parseInt(l.reference.split(':')[0] || '0', 10)
    return ch === unit
  })
}

function unitsFromSource(source: WordsLinksSource): number[] {
  const byChapter = source.links.linksByChapter
  if (byChapter && typeof byChapter === 'object') {
    return Object.keys(byChapter)
      .map((k) => parseInt(k, 10))
      .filter((n) => Number.isFinite(n) && n > 0)
      .sort((a, b) => a - b)
  }
  const fromMeta = source.links.metadata?.chaptersWithLinks
  if (Array.isArray(fromMeta) && fromMeta.length > 0) {
    return [...fromMeta].sort((a, b) => a - b)
  }
  const chapters = new Set<number>()
  for (const l of source.links.links ?? []) {
    const ch = parseInt(l.reference.split(':')[0] || '0', 10)
    if (Number.isFinite(ch) && ch > 0) chapters.add(ch)
  }
  return [...chapters].sort((a, b) => a - b)
}

function toLightRow(link: TranslationWordsLink): WordsLinksLightRow {
  const twLink = link.twLink || ''
  return {
    id: link.id,
    reference: link.reference,
    origWords: link.origWords || '',
    occurrence: link.occurrence || '1',
    twLink,
    tags: link.tags || '',
    articlePath: articlePathFromTwLink(twLink),
  }
}

function toFullRow(link: TranslationWordsLink): WordsLinksFullRow {
  const light = toLightRow(link)
  const origWords = light.origWords
  return {
    ...light,
    quoteFolded: origWords ? semanticIdMatchKey(origWords) : undefined,
  }
}

export function buildWordsLinksNav(source: WordsLinksSource): WordsLinksNavRecord {
  const units = unitsFromSource(source)
  return {
    version: WORDS_LINKS_PREPARE_VERSION,
    bookId: source.links.bookCode || source.bookId,
    bookName: source.links.bookName || source.bookId,
    chapters: units,
    totalLinks: source.links.links?.length ?? 0,
  }
}

export function buildWordsLinksLight(
  source: WordsLinksSource,
  unit: number
): WordsLinksLightChapter {
  return {
    version: WORDS_LINKS_PREPARE_VERSION,
    unit,
    links: linksForUnit(source, unit).map(toLightRow),
  }
}

export function buildWordsLinksFull(
  source: WordsLinksSource,
  unit: number
): WordsLinksFullChapter {
  return {
    version: WORDS_LINKS_PREPARE_VERSION,
    unit,
    links: linksForUnit(source, unit).map(toFullRow),
  }
}

export const wordsLinksPreparer: ResourcePreparer<WordsLinksSource, number> = {
  id: RESOURCE_TYPE_IDS.TRANSLATION_WORDS_LINKS,
  version: WORDS_LINKS_PREPARE_VERSION,

  async readSource(ctx: PrepareContext, resourceKey: string, bookId: string) {
    const key = twlCacheKey(resourceKey, bookId)
    const entry = await ctx.cacheAdapter.get(key)
    const links = unwrapCacheEntry(entry)
    if (!links) return null
    return { resourceKey, bookId, links }
  },

  unitsFor: unitsFromSource,

  prepareNav(source) {
    return buildWordsLinksNav(source)
  },

  prepareLight(source, unit) {
    return buildWordsLinksLight(source, unit)
  },

  prepareFull(source, unit) {
    return buildWordsLinksFull(source, unit)
  },
}

registerPreparer(wordsLinksPreparer)
