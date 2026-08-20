import {
  RESOURCE_TYPE_IDS,
  isValidResourceTypeId,
  type ResourceTypeId,
} from '../resourceTypes/resourceTypeIds'

export type NormalizedResourceTypeId = ResourceTypeId

/**
 * Door43 repo ids and legacy catalog values → canonical type ids.
 * Unknown strings return null (callers decide fallback).
 */
const ALIAS_TO_CANONICAL: Record<string, NormalizedResourceTypeId> = {
  // Door43 resource ids
  tn: RESOURCE_TYPE_IDS.TRANSLATION_NOTES,
  tq: RESOURCE_TYPE_IDS.TRANSLATION_QUESTIONS,
  tw: RESOURCE_TYPE_IDS.TRANSLATION_WORDS,
  twl: RESOURCE_TYPE_IDS.TRANSLATION_WORDS_LINKS,
  ta: RESOURCE_TYPE_IDS.TRANSLATION_ACADEMY,
  ult: RESOURCE_TYPE_IDS.SCRIPTURE,
  ust: RESOURCE_TYPE_IDS.SCRIPTURE,
  glt: RESOURCE_TYPE_IDS.SCRIPTURE,
  gst: RESOURCE_TYPE_IDS.SCRIPTURE,
  ulb: RESOURCE_TYPE_IDS.SCRIPTURE,
  udb: RESOURCE_TYPE_IDS.SCRIPTURE,
  ugnt: RESOURCE_TYPE_IDS.SCRIPTURE,
  uhb: RESOURCE_TYPE_IDS.SCRIPTURE,
  obs: RESOURCE_TYPE_IDS.OBS,

  // Legacy / underscore / long-form variants (panels docs historically used long forms)
  notes: RESOURCE_TYPE_IDS.TRANSLATION_NOTES,
  questions: RESOURCE_TYPE_IDS.TRANSLATION_QUESTIONS,
  words: RESOURCE_TYPE_IDS.TRANSLATION_WORDS,
  'words-links': RESOURCE_TYPE_IDS.TRANSLATION_WORDS_LINKS,
  words_links: RESOURCE_TYPE_IDS.TRANSLATION_WORDS_LINKS,
  'translation-notes': RESOURCE_TYPE_IDS.TRANSLATION_NOTES,
  'translation-questions': RESOURCE_TYPE_IDS.TRANSLATION_QUESTIONS,
  'translation-words': RESOURCE_TYPE_IDS.TRANSLATION_WORDS,
  'translation-words-links': RESOURCE_TYPE_IDS.TRANSLATION_WORDS_LINKS,
  'translation-academy': RESOURCE_TYPE_IDS.TRANSLATION_ACADEMY,
  academy: RESOURCE_TYPE_IDS.TRANSLATION_ACADEMY,
  scripture: RESOURCE_TYPE_IDS.SCRIPTURE,
  bible: RESOURCE_TYPE_IDS.SCRIPTURE,
  stories: RESOURCE_TYPE_IDS.OBS,
  'obs-notes': RESOURCE_TYPE_IDS.OBS_NOTES,
  'obs-words-links': RESOURCE_TYPE_IDS.OBS_WORDS_LINKS,
  obs_words_links: RESOURCE_TYPE_IDS.OBS_WORDS_LINKS,
  'obs-questions': RESOURCE_TYPE_IDS.OBS_QUESTIONS,
  'combined-helps': RESOURCE_TYPE_IDS.COMBINED_HELPS,
  'obs-combined-helps': RESOURCE_TYPE_IDS.OBS_COMBINED_HELPS,
}

export function normalizeResourceTypeId(
  raw: string | null | undefined
): NormalizedResourceTypeId | null {
  if (raw == null) return null
  const key = String(raw).trim().toLowerCase()
  if (!key) return null
  if (ALIAS_TO_CANONICAL[key]) return ALIAS_TO_CANONICAL[key]
  if (isValidResourceTypeId(key)) return key
  return null
}

/** True when type is notes (or OBS notes) for the given scope. */
export function isNotesResourceType(
  raw: string | null | undefined,
  scope: 'scripture' | 'obs' = 'scripture'
): boolean {
  const id = normalizeResourceTypeId(raw)
  if (scope === 'obs') return id === RESOURCE_TYPE_IDS.OBS_NOTES
  return id === RESOURCE_TYPE_IDS.TRANSLATION_NOTES
}

/** True when type is words-links (or OBS TWL) for the given scope. */
export function isWordsLinksResourceType(
  raw: string | null | undefined,
  scope: 'scripture' | 'obs' = 'scripture'
): boolean {
  const id = normalizeResourceTypeId(raw)
  if (scope === 'obs') return id === RESOURCE_TYPE_IDS.OBS_WORDS_LINKS
  return id === RESOURCE_TYPE_IDS.TRANSLATION_WORDS_LINKS
}

export function isCombinedHelpsResourceType(raw: string | null | undefined): boolean {
  const id = normalizeResourceTypeId(raw)
  return (
    id === RESOURCE_TYPE_IDS.COMBINED_HELPS ||
    id === RESOURCE_TYPE_IDS.OBS_COMBINED_HELPS
  )
}
