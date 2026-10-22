/**
 * The stamps the warm lanes key their jobs by, read from catalog metadata: helps and target stamps per resource and
 * book, TA/TW article ids, and the UGNT and UHB stamps so lane 3 can quote and align both testaments. tc-study's Read
 * page (`useWarmLanes`) and a language-pack build use the same function, so they plan the same jobs under the same
 * keys.
 *
 * Stamps are per book (the book file's blob sha, or the release stamp when none was recorded), so the bags keep the
 * metadata they read and answer per book instead of holding one stamp per resource.
 */

import type { BookStampSource } from '@bt-synergy/resource-catalog'
import { targetBookStamp } from '../helps/helpsAlignCache'
import { helpsBookStamp, olBookStamp } from '../helps/helpsQuoteCache'
import { UGNT_RESOURCE_KEY, UHB_RESOURCE_KEY } from '../scripture/originalLanguageSpecs'
import { classifyWarmResource } from './warmResourceClass'

type StampMeta = BookStampSource & {
  language?: string
  contentMetadata?: BookStampSource['contentMetadata'] & { ingredients?: Array<{ identifier?: string }> }
}

/** An original whose row could not be read: nothing to build or collect by. */
export const NO_OL_STAMP = 'nostamp'

export type WarmStampResolvers = {
  /** The helps side of a quote/align key for this book; undefined when `key` was not read as helps. */
  helpsStampOf(key: string, book: string): string | undefined
  /** The target side of an align key for this book; undefined when `key` was not read as a target. */
  targetStampOf(key: string, book: string): string | undefined
  /** The original's side for this book; `'nostamp'` when its row could not be read. */
  olStampOf(olKey: string, book: string): string
}

export type WarmStampBags = WarmStampResolvers & {
  textLanguageByTarget: Record<string, string>
  articleIdsByKey: Record<string, string[]>
}

export interface WarmStampCatalog {
  getResourceMetadata(key: string): Promise<unknown>
}

export async function resolveWarmStamps(args: {
  catalog: WarmStampCatalog
  stampKeys: Iterable<string>
  /** Resources on screen: their role decides the bag even when the key alone would not. */
  visibleResources?: ReadonlyArray<{ resourceKey: string; role: 'scripture' | 'helps' }>
  sourceResourceId?: string | null
}): Promise<WarmStampBags> {
  const { catalog, visibleResources = [], sourceResourceId = null } = args
  const helpsMetaByKey = new Map<string, StampMeta | null>()
  const targetMetaByKey = new Map<string, StampMeta | null>()
  const textLanguageByTarget: Record<string, string> = {}
  const articleIdsByKey: Record<string, string[]> = {}

  await Promise.all(
    [...args.stampKeys].map(async (key) => {
      try {
        const meta = (await catalog.getResourceMetadata(key)) as StampMeta | null
        const classified = classifyWarmResource(key)
        const visible = visibleResources.find((r) => r.resourceKey === key)
        if (visible?.role === 'helps' || classified.stampBag === 'helps') {
          helpsMetaByKey.set(key, meta)
        }
        if (
          visible?.role === 'scripture' ||
          key === sourceResourceId ||
          classified.stampBag === 'target'
        ) {
          targetMetaByKey.set(key, meta)
          if (meta?.language) textLanguageByTarget[key] = meta.language
        }
        if (classified.isArticle) {
          const ids = (meta?.contentMetadata?.ingredients ?? [])
            .map((ing) => ing.identifier)
            .filter((id): id is string => Boolean(id))
          if (ids.length) articleIdsByKey[key] = ids
        }
      } catch {
        /* ignore */
      }
    })
  )

  // A missing row (null) still stamps, as `nostamp+…`, which is what the quote hooks compute for it; only a read
  // that throws leaves the original unstamped.
  const olMetaByKey = new Map<string, StampMeta | null>()
  await Promise.all(
    [UGNT_RESOURCE_KEY, UHB_RESOURCE_KEY].map(async (olKey) => {
      try {
        olMetaByKey.set(olKey, (await catalog.getResourceMetadata(olKey)) as StampMeta | null)
      } catch {
        /* stays unstamped */
      }
    })
  )

  return {
    helpsStampOf: (key, book) =>
      helpsMetaByKey.has(key) ? helpsBookStamp(helpsMetaByKey.get(key), book) : undefined,
    targetStampOf: (key, book) =>
      targetMetaByKey.has(key) ? targetBookStamp(targetMetaByKey.get(key), book) : undefined,
    olStampOf: (olKey, book) =>
      olMetaByKey.has(olKey) ? olBookStamp(olMetaByKey.get(olKey), book) : NO_OL_STAMP,
    textLanguageByTarget,
    articleIdsByKey,
  }
}

/**
 * Stamps from several screens as one: the later screen answers first and an earlier one fills what it lacks, as
 * `Object.assign` did with the per-resource maps.
 */
export function mergeWarmStamps(
  list: ReadonlyArray<Partial<WarmStampResolvers> | null | undefined>
): WarmStampResolvers {
  const newestFirst = list.filter((s): s is Partial<WarmStampResolvers> => Boolean(s)).reverse()
  return {
    helpsStampOf: (key, book) => {
      for (const s of newestFirst) {
        const stamp = s.helpsStampOf?.(key, book)
        if (stamp !== undefined) return stamp
      }
      return undefined
    },
    targetStampOf: (key, book) => {
      for (const s of newestFirst) {
        const stamp = s.targetStampOf?.(key, book)
        if (stamp !== undefined) return stamp
      }
      return undefined
    },
    olStampOf: (olKey, book) => {
      for (const s of newestFirst) {
        const stamp = s.olStampOf?.(olKey, book)
        if (stamp !== undefined && stamp !== NO_OL_STAMP) return stamp
      }
      return NO_OL_STAMP
    },
  }
}
