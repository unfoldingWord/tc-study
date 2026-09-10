/**
 * Local SoT cache keys for backend A (zip / processed book payload).
 * DCS hydrate (backend B) writes the same keys so the zip pass skip-if-exists.
 */

import { usjScriptureChapterKey, usjScriptureKey } from '@bt-synergy/scripture-loader'
import { getArtifactRecipe } from '../../config/resourceArtifactRecipe'
import { tnCacheKey } from '../notes/notesPreparer'
import { obsCacheKey } from '../obs/obsPreparer'
import { tqCacheKey } from '../questions/questionsPreparer'
import { twlCacheKey } from '../wordsLinks/wordsLinksPreparer'

export function sotCacheKey(args: {
  typeId: string
  resourceKey: string
  book: string
  chapter?: number
}): string {
  const recipe = getArtifactRecipe(args.typeId)
  const book = args.book.toLowerCase()
  const grain = recipe?.sotGrain ?? 'book'
  const prefix = recipe?.sotPrefix ?? ''

  if (grain === 'article') {
    return `${args.resourceKey}/${args.book}`
  }
  if (grain === 'story') {
    const n = args.chapter ?? parseInt(book, 10)
    return obsCacheKey(args.resourceKey, Number.isFinite(n) && n > 0 ? n : 1)
  }
  if (prefix === 'scripture-usj:') {
    if (args.chapter != null && Number.isFinite(args.chapter)) {
      return usjScriptureChapterKey(args.resourceKey, book, args.chapter)
    }
    return usjScriptureKey(args.resourceKey, book)
  }
  if (prefix === 'tn:') return tnCacheKey(args.resourceKey, book)
  if (prefix === 'twl:') return twlCacheKey(args.resourceKey, book)
  if (prefix === 'tq:') return tqCacheKey(args.resourceKey, book)
  if (prefix === 'obs:') {
    const n = args.chapter ?? parseInt(book, 10)
    return obsCacheKey(args.resourceKey, Number.isFinite(n) && n > 0 ? n : 1)
  }
  return `${prefix}${args.resourceKey}:${book}`
}
