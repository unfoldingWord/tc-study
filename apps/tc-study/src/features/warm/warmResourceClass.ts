/**
 * Classify Door43 catalog keys for warm admission.
 * SoT type ids come from inferDoor43ResourceTypeId; aliases + fallbacks live here.
 */

import { inferDoor43ResourceTypeId, RESOURCE_TYPE_IDS } from '@bt-synergy/resource-catalog'
import {
  getDownloadPriority,
  getWorkerPrepareConfigs,
  recipeHasAlign,
  recipeHasQuotes,
} from '../../config/loaderConfig'

const DOOR43_ALIASES: Record<string, string> = {
  'tn-obs': RESOURCE_TYPE_IDS.OBS_NOTES,
  'twl-obs': RESOURCE_TYPE_IDS.OBS_WORDS_LINKS,
  'tq-obs': RESOURCE_TYPE_IDS.OBS_QUESTIONS,
}

const PREPARE_TYPE_IDS = new Set(getWorkerPrepareConfigs().map((c) => c.id))

const OBS_FAMILY = new Set<string>([
  RESOURCE_TYPE_IDS.OBS,
  RESOURCE_TYPE_IDS.OBS_NOTES,
  RESOURCE_TYPE_IDS.OBS_WORDS_LINKS,
  RESOURCE_TYPE_IDS.OBS_QUESTIONS,
])

const ARTICLE_TYPES = new Set<string>([
  RESOURCE_TYPE_IDS.TRANSLATION_ACADEMY,
  RESOURCE_TYPE_IDS.TRANSLATION_WORDS,
])

/** Bible TN / TWL — quote OL and align to each scripture (recipe SoT). */

export type WarmUnitScope = 'canon' | 'obs-stories' | 'obs-book' | 'articles' | 'none'

export type WarmStampBag = 'helps' | 'target'

export type ClassifiedWarmKey = {
  key: string
  catalogId: string
  language: string
  typeId: string
  /** True for Bible translations (including unknown Door43 scripture ids). */
  isScripture: boolean
  isObsFamily: boolean
  isArticle: boolean
  hasPrepare: boolean
  quotesOl: boolean
  aligns: boolean
  unitScope: WarmUnitScope
  stampBag: WarmStampBag
  helpsType?: 'notes' | 'words-links'
}

export function languageFromKey(key: string): string {
  return key.split('/')[1]?.split('_')[0]?.toLowerCase() ?? ''
}

export function catalogIdFromKey(key: string): string {
  return key.split('/')[2]?.split('#')[0] ?? ''
}

/**
 * Map a Door43 repo id (third key segment) to a canonical RESOURCE_TYPE_IDS value.
 * `obs-tn` / `tn-obs` are helps, never scripture.
 */
export function typeIdFromCatalogId(catalogId: string): string {
  const id = catalogId.toLowerCase()
  if (!id) return RESOURCE_TYPE_IDS.SCRIPTURE
  if (DOOR43_ALIASES[id]) return DOOR43_ALIASES[id]

  const inferred = inferDoor43ResourceTypeId(id)
  if (inferred !== 'unknown') return inferred

  if (id.startsWith('obs-') || id.endsWith('-obs')) {
    if (id.includes('tn') || id.includes('notes')) return RESOURCE_TYPE_IDS.OBS_NOTES
    if (id.includes('twl') || id.includes('words')) return RESOURCE_TYPE_IDS.OBS_WORDS_LINKS
    if (id.includes('tq') || id.includes('questions')) return RESOURCE_TYPE_IDS.OBS_QUESTIONS
    return RESOURCE_TYPE_IDS.OBS
  }
  return RESOURCE_TYPE_IDS.SCRIPTURE
}

export function unitScopeForTypeId(typeId: string): WarmUnitScope {
  if (typeId === RESOURCE_TYPE_IDS.OBS) return 'obs-stories'
  if (
    typeId === RESOURCE_TYPE_IDS.OBS_NOTES ||
    typeId === RESOURCE_TYPE_IDS.OBS_QUESTIONS
  ) {
    return 'obs-book'
  }
  if (ARTICLE_TYPES.has(typeId)) return 'articles'
  if (typeId === RESOURCE_TYPE_IDS.OBS_WORDS_LINKS) return 'none'
  if (
    typeId === RESOURCE_TYPE_IDS.COMBINED_HELPS ||
    typeId === RESOURCE_TYPE_IDS.OBS_COMBINED_HELPS
  ) {
    return 'none'
  }
  return 'canon'
}

export function helpsTypeForTypeId(typeId: string): 'notes' | 'words-links' | undefined {
  if (typeId === RESOURCE_TYPE_IDS.TRANSLATION_NOTES) return 'notes'
  if (typeId === RESOURCE_TYPE_IDS.TRANSLATION_WORDS_LINKS) return 'words-links'
  return undefined
}

export function classifyWarmResource(key: string): ClassifiedWarmKey {
  const catalogId = catalogIdFromKey(key)
  const typeId = typeIdFromCatalogId(catalogId)
  const isScripture = typeId === RESOURCE_TYPE_IDS.SCRIPTURE
  const quotesOl = recipeHasQuotes(typeId)
  return {
    key,
    catalogId,
    language: languageFromKey(key),
    typeId,
    isScripture,
    isObsFamily: OBS_FAMILY.has(typeId),
    isArticle: ARTICLE_TYPES.has(typeId),
    hasPrepare: PREPARE_TYPE_IDS.has(typeId),
    quotesOl,
    aligns: recipeHasAlign(typeId),
    unitScope: unitScopeForTypeId(typeId),
    stampBag: isScripture || typeId === RESOURCE_TYPE_IDS.OBS ? 'target' : 'helps',
    helpsType: helpsTypeForTypeId(typeId),
  }
}

export function sharesCurrentMode(typeId: string, bookId: string): boolean {
  const obsMode = bookId.toLowerCase() === 'obs'
  return obsMode ? OBS_FAMILY.has(typeId) : !OBS_FAMILY.has(typeId)
}

export function downloadPriorityOf(typeId: string): number {
  return getDownloadPriority(typeId)
}

export function keysInLanguages(keys: string[], langs: Iterable<string>): string[] {
  const set = new Set([...langs].map((l) => l.toLowerCase()).filter(Boolean))
  if (set.size === 0) return []
  return keys.filter((k) => set.has(languageFromKey(k)))
}
