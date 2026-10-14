/**
 * The stamp bags the warm lanes key their jobs by, read from catalog metadata: helps and target stamps per resource,
 * TA/TW article ids, and the UGNT and UHB stamps so lane 3 can quote and align both testaments. tc-study's Read page
 * (`useWarmLanes`) and a language-pack build use the same function, so they plan the same jobs under the same keys.
 */

import { resourceContentStamp } from '@bt-synergy/resource-catalog'
import { targetContentStamp } from '../helps/helpsAlignCache'
import { olContentStamp } from '../helps/helpsQuoteCache'
import { UGNT_RESOURCE_KEY, UHB_RESOURCE_KEY } from '../scripture/originalLanguageSpecs'
import { classifyWarmResource } from './warmResourceClass'

type StampMeta = {
  version?: string
  language?: string
  release?: { tag_name?: string; published_at?: string }
  contentMetadata?: { ingredients?: Array<{ identifier?: string }> }
}

export type WarmStampBags = {
  helpsStampByKey: Record<string, string>
  targetStampByKey: Record<string, string>
  textLanguageByTarget: Record<string, string>
  articleIdsByKey: Record<string, string[]>
  olStampByKey: Record<string, string>
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
  const helpsStampByKey: Record<string, string> = {}
  const targetStampByKey: Record<string, string> = {}
  const textLanguageByTarget: Record<string, string> = {}
  const articleIdsByKey: Record<string, string[]> = {}

  await Promise.all(
    [...args.stampKeys].map(async (key) => {
      try {
        const meta = (await catalog.getResourceMetadata(key)) as StampMeta | null
        const classified = classifyWarmResource(key)
        const visible = visibleResources.find((r) => r.resourceKey === key)
        if (visible?.role === 'helps' || classified.stampBag === 'helps') {
          helpsStampByKey[key] = resourceContentStamp(meta)
        }
        if (
          visible?.role === 'scripture' ||
          key === sourceResourceId ||
          classified.stampBag === 'target'
        ) {
          targetStampByKey[key] = targetContentStamp(meta)
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

  const olStampByKey: Record<string, string> = {}
  await Promise.all(
    [UGNT_RESOURCE_KEY, UHB_RESOURCE_KEY].map(async (olKey) => {
      try {
        const olMeta = (await catalog.getResourceMetadata(olKey)) as
          | { version?: string; release?: { tag_name?: string; published_at?: string } }
          | null
        olStampByKey[olKey] = olContentStamp(olMeta)
      } catch {
        olStampByKey[olKey] = 'nostamp'
      }
    })
  )

  return { helpsStampByKey, targetStampByKey, textLanguageByTarget, articleIdsByKey, olStampByKey }
}
