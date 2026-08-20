import { ResourceFormat } from '@bt-synergy/resource-catalog'
import type { ResourceInfo } from '../../contexts/types'
import {
  COMBINED_HELPS_RESOURCE_ID,
  OBS_COMBINED_HELPS_RESOURCE_ID,
} from './combinedHelpsIds'
import { RESOURCE_TYPE_IDS } from '../../resourceTypes/resourceTypeIds'
import {
  isNotesResourceType,
  isWordsLinksResourceType,
} from '../../utils/normalizeResourceTypeId'

export type HelpsScope = 'scripture' | 'obs'

export interface HelpsKeyPair {
  tnKey?: string
  twlKey?: string
}

/** Inject when either TN or TWL exists so first-open is not blocked on both catalog hits. */
export function shouldInjectCombinedHelps(pair: HelpsKeyPair): boolean {
  return Boolean(pair.tnKey || pair.twlKey)
}

export function findHelpsKeysAmongResources(
  resources: Iterable<ResourceInfo | null | undefined>,
  scope: HelpsScope,
  options?: {
    langCode?: string
    skipKeys?: Set<string>
  }
): HelpsKeyPair {
  const want = primaryLangSegment(options?.langCode || '')
  const skip = options?.skipKeys ?? new Set<string>()
  let tnKey: string | undefined
  let twlKey: string | undefined

  for (const r of resources) {
    if (!r) continue
    const key = r.key || r.id
    if (!key || skip.has(key)) continue
    if (want && !keyMatchesLang(key, want)) continue
    if (isNotesResourceType(r.type, scope) && !tnKey) tnKey = key
    if (isWordsLinksResourceType(r.type, scope) && !twlKey) twlKey = key
  }

  return { tnKey, twlKey }
}

export function buildCombinedHelpsResourceInfo(options: {
  scope: HelpsScope
  languageCode: string
  tnKey?: string
  twlKey?: string
  /** Override resource key (per-panel CombinedHelps when both panes are helps). */
  id?: string
}): ResourceInfo {
  const isObs = options.scope === 'obs'
  const id =
    options.id || (isObs ? OBS_COMBINED_HELPS_RESOURCE_ID : COMBINED_HELPS_RESOURCE_ID)
  const type = isObs
    ? RESOURCE_TYPE_IDS.OBS_COMBINED_HELPS
    : RESOURCE_TYPE_IDS.COMBINED_HELPS

  return {
    id,
    key: id,
    resourceKey: id,
    title: isObs ? 'OBS Helps' : 'Helps',
    type,
    category: 'Combined helps',
    subject: isObs ? 'Combined OBS TN+TWL' : 'Combined TN+TWL',
    owner: 'local',
    language: options.languageCode,
    languageCode: options.languageCode,
    languageName: options.languageCode,
    resourceId: isObs ? 'combined-helps-obs' : 'combined-helps',
    server: 'git.door43.org',
    format: ResourceFormat.TSV,
    contentType: 'text/tab-separated-values',
    contentStructure: 'book',
    version: '1.0',
    description: isObs
      ? 'Combined OBS Translation Notes and Translation Words Links'
      : 'Combined Translation Notes and Translation Words Links for Scripture',
    availability: { online: true, offline: false, bundled: false, partial: false },
    locations: [],
    catalogedAt: new Date().toISOString(),
    helpsTnResourceKey: options.tnKey,
    helpsTwlResourceKey: options.twlKey,
    appliesToScope: options.scope,
  } as unknown as ResourceInfo
}

function primaryLangSegment(code: string): string {
  return String(code || '')
    .trim()
    .split(/[-_/]/)[0]!
    .toLowerCase()
}

function keyMatchesLang(key: string, want: string): boolean {
  const seg = primaryLangSegment(key.split('/')[1] || '')
  return seg === want
}
