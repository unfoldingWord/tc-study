/**
 * Which TA/TW article a note or a words link points to, and its title from the resource's TOC index. Pure, so the
 * Read page's hooks and a language-pack builder (which titles every article, not only the visible ones) agree on the
 * `helps-text:` entry ids and on when a title is confident enough to keep.
 */

import { parseTWLink } from './quoteTokens/parseTWLink'
import type { HelpsTextResolveResult } from './helpsTextStore'
import { lookupTocTitle } from './tocTitleIndex'

/** What the Read page shows when a TA reference has no usable path. */
export const TA_TITLE_FALLBACK = 'Learn more'

// `rc://*/ta/man/translate/figs-metaphor` → `translate/figs-metaphor`.
export function parseTAReference(supportRef: string): string | null {
  const match = supportRef.match(/rc:\/\/\*\/ta\/man\/(.+)/)
  return match ? match[1] : null
}

/** The TA resource that goes with a notes resource: `{owner}/{lang}/tn` → `{owner}/{lang}/ta`. */
export function taResourceKeyFor(tnResourceKey: string): string | null {
  const parts = tnResourceKey.split('/')
  if (parts.length < 2) return null
  const [owner, langPart] = parts
  const language = langPart.split('_')[0]
  return `${owner}/${language}/ta`
}

/** Last path segment, shown until the real title is known. */
export function taTitlePlaceholder(articlePath: string): string {
  return articlePath.split('/').pop() || TA_TITLE_FALLBACK
}

export function resolveTaTitle(
  index: Map<string, string> | null,
  articlePath: string
): HelpsTextResolveResult {
  const title = index ? lookupTocTitle(index, articlePath) : null
  if (!title) return { value: taTitlePlaceholder(articlePath), confident: false }
  return { value: title, confident: true }
}

/** The TW resource that goes with a words-links resource. */
export function twResourceKeyFor(twlResourceKey: string): string | null {
  const parts = twlResourceKey.split('/')
  if (parts.length < 2) return null
  const [owner, ...rest] = parts
  if (rest.length === 1) {
    const language = rest[0].split('_')[0]
    return `${owner}/${language}_tw`
  }
  if (rest.length >= 2) {
    return `${owner}/${rest[0]}/tw`
  }
  return null
}

export interface TwTitleEntry {
  category: string
  term: string
  /** `helps-text:` entry id: `{category}/{term}`. */
  entryId: string
  /** TOC identifier: `bible/{category}/{term}`. */
  articleId: string
}

/** The TW article a link points to, or null when the link cannot be read. */
export function twTitleEntry(linkSource: string | undefined): TwTitleEntry | null {
  const { category, term } = parseTWLink(linkSource)
  if (category === 'unknown' || !term) return null
  return { category, term, entryId: `${category}/${term}`, articleId: `bible/${category}/${term}` }
}

export function resolveTwTitle(
  index: Map<string, string> | null,
  entry: TwTitleEntry
): HelpsTextResolveResult {
  if (!index) return { value: entry.term, confident: false }
  const title = lookupTocTitle(index, entry.articleId) || lookupTocTitle(index, entry.entryId)
  if (!title) return { value: entry.term, confident: false }
  return { value: title, confident: true }
}
