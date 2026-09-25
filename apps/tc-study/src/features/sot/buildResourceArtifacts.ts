/**
 * One artifact builder, two SoT backends.
 * Writes today's IDB keys (`prepared:`, `helps-quote:`) from a resolved SoT
 * payload — same keys whether the payload came from zip IDB or a DCS file.
 */

import { getArtifactRecipe } from '../../config/resourceArtifactRecipe'
import {
  helpsQuoteKey,
  writeCachedQuoteTokens,
  type CachedQuoteTokens,
  type HelpsQuoteCacheAdapter,
} from '../helps/helpsQuoteCache'
import { preparedUnitKey } from '../prepare/prepareKeys'
import { prepareBookWithPreparer } from '../prepare/runPrepare'
import type { PrepareCacheAdapter } from '../prepare/prepareRegistry'

export type ArtifactCache = PrepareCacheAdapter & HelpsQuoteCacheAdapter

export type BuildResourceArtifactsArgs = {
  typeId: string
  resourceKey: string
  book: string
  chapter: number
  /** Already-resolved SoT (IDB row or DCS hydrate). */
  sot: unknown
  cache: ArtifactCache
  quote?: {
    helpsStamp: string
    olKey: string
    olStamp: string
    tokensByLinkId: CachedQuoteTokens
  }
}

export type BuildResourceArtifactsResult = {
  preparedKeys: string[]
  quoteKey?: string
}

function sourceFromSoT(typeId: string, resourceKey: string, book: string, sot: unknown): unknown {
  if (sot && typeof sot === 'object' && 'resourceKey' in (sot as object)) {
    return sot
  }
  if (typeId === 'notes' || typeId === 'obs-notes') {
    return { resourceKey, bookId: book, notes: sot }
  }
  if (typeId === 'words-links' || typeId === 'obs-words-links') {
    return { resourceKey, bookId: book, links: sot }
  }
  if (typeId === 'questions' || typeId === 'obs-questions') {
    return { resourceKey, bookId: book, questions: sot }
  }
  if (typeId === 'scripture') {
    return { resourceKey, bookId: book, viewModel: sot }
  }
  return sot
}

/**
 * Prepare the open chapter (and write quote row when the recipe asks).
 * CPU-heavy callers should run this on a worker; this module is React-free.
 */
export async function buildResourceArtifacts(
  args: BuildResourceArtifactsArgs
): Promise<BuildResourceArtifactsResult> {
  const recipe = getArtifactRecipe(args.typeId)
  const book = args.book.toLowerCase()
  const preparedKeys: string[] = []

  if (recipe?.artifacts.includes('prepare') && recipe.prepareTiers.includes('full')) {
    const source = sourceFromSoT(args.typeId, args.resourceKey, book, args.sot)
    await prepareBookWithPreparer({
      typeId: args.typeId,
      resourceKey: args.resourceKey,
      bookId: book,
      cacheAdapter: args.cache,
      source,
      units: [args.chapter],
      tiers: ['light', 'full'],
    })
    preparedKeys.push(
      preparedUnitKey(args.typeId, args.resourceKey, book, args.chapter, 'light'),
      preparedUnitKey(args.typeId, args.resourceKey, book, args.chapter, 'full')
    )
  }

  let quoteKey: string | undefined
  if (recipe?.artifacts.includes('quotes') && args.quote) {
    const q = args.quote
    quoteKey = helpsQuoteKey({
      helpsKey: args.resourceKey,
      helpsStamp: q.helpsStamp,
      olKey: q.olKey,
      olStamp: q.olStamp,
      book,
      chapter: args.chapter,
    })
    await writeCachedQuoteTokens(
      args.cache,
      {
        helpsKey: args.resourceKey,
        helpsStamp: q.helpsStamp,
        olKey: q.olKey,
        olStamp: q.olStamp,
        book,
        chapter: args.chapter,
      },
      q.tokensByLinkId
    )
  }

  return { preparedKeys, quoteKey }
}
