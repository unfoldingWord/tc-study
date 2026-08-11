/**
 * Canonical short resource type IDs for BT Synergy.
 *
 * Single source of truth for loader registration, catalog inference,
 * Door43 mapping, and app resource-type plugins. Prefer these over
 * long forms (`translation-notes`) or Door43 repo ids (`tn`, `ta`).
 */

export const RESOURCE_TYPE_IDS = {
  /** Scripture resources (Bible translations) */
  SCRIPTURE: 'scripture',

  /** Translation Words - biblical term definitions */
  TRANSLATION_WORDS: 'words',

  /** Translation Words Links - links between scripture and TW articles */
  TRANSLATION_WORDS_LINKS: 'words-links',

  /** Translation Notes - translation helps */
  TRANSLATION_NOTES: 'notes',

  /** Translation Questions - comprehension questions */
  TRANSLATION_QUESTIONS: 'questions',

  /** Translation Academy - translation training */
  TRANSLATION_ACADEMY: 'academy',

  /** Open Bible Stories */
  OBS: 'obs',

  /** OBS Translation Notes */
  OBS_NOTES: 'obs-notes',

  /** OBS Translation Words Links */
  OBS_WORDS_LINKS: 'obs-words-links',

  /** OBS Translation Questions */
  OBS_QUESTIONS: 'obs-questions',

  /** Synthetic Combined Helps (TN + TWL composition) */
  COMBINED_HELPS: 'combined-helps',

  /** Synthetic OBS Combined Helps */
  OBS_COMBINED_HELPS: 'obs-combined-helps',
} as const

export type ResourceTypeId = (typeof RESOURCE_TYPE_IDS)[keyof typeof RESOURCE_TYPE_IDS]

export function isValidResourceTypeId(id: string): id is ResourceTypeId {
  return Object.values(RESOURCE_TYPE_IDS).includes(id as ResourceTypeId)
}

/**
 * Map a Door43 resource identifier (repo id) to a canonical RESOURCE_TYPE_IDS value.
 *
 * Shared by Door43ServerAdapter and Door43ApiClient so emitters never diverge
 * (e.g. words_links vs words-links, stories vs obs).
 *
 * @returns Canonical short ID, or `'unknown'` when the id is not recognized.
 */
export function inferDoor43ResourceTypeId(id: string): string {
  const typeMap: Record<string, string> = {
    ult: RESOURCE_TYPE_IDS.SCRIPTURE,
    glt: RESOURCE_TYPE_IDS.SCRIPTURE,
    ust: RESOURCE_TYPE_IDS.SCRIPTURE,
    gst: RESOURCE_TYPE_IDS.SCRIPTURE,
    ulb: RESOURCE_TYPE_IDS.SCRIPTURE,
    udb: RESOURCE_TYPE_IDS.SCRIPTURE,
    ugnt: RESOURCE_TYPE_IDS.SCRIPTURE,
    uhb: RESOURCE_TYPE_IDS.SCRIPTURE,
    tn: RESOURCE_TYPE_IDS.TRANSLATION_NOTES,
    tq: RESOURCE_TYPE_IDS.TRANSLATION_QUESTIONS,
    tw: RESOURCE_TYPE_IDS.TRANSLATION_WORDS,
    twl: RESOURCE_TYPE_IDS.TRANSLATION_WORDS_LINKS,
    ta: RESOURCE_TYPE_IDS.TRANSLATION_ACADEMY,
    obs: RESOURCE_TYPE_IDS.OBS,
    'obs-tn': RESOURCE_TYPE_IDS.OBS_NOTES,
    'obs-twl': RESOURCE_TYPE_IDS.OBS_WORDS_LINKS,
    'obs-tq': RESOURCE_TYPE_IDS.OBS_QUESTIONS,
  }

  return typeMap[id.toLowerCase()] || 'unknown'
}

export function getResourceTypeDisplayName(id: ResourceTypeId): string {
  const displayNames: Record<ResourceTypeId, string> = {
    [RESOURCE_TYPE_IDS.SCRIPTURE]: 'Scripture',
    [RESOURCE_TYPE_IDS.TRANSLATION_WORDS]: 'Translation Words',
    [RESOURCE_TYPE_IDS.TRANSLATION_WORDS_LINKS]: 'Translation Words Links',
    [RESOURCE_TYPE_IDS.TRANSLATION_NOTES]: 'Translation Notes',
    [RESOURCE_TYPE_IDS.TRANSLATION_QUESTIONS]: 'Translation Questions',
    [RESOURCE_TYPE_IDS.TRANSLATION_ACADEMY]: 'Translation Academy',
    [RESOURCE_TYPE_IDS.OBS]: 'Open Bible Stories',
    [RESOURCE_TYPE_IDS.OBS_NOTES]: 'OBS Translation Notes',
    [RESOURCE_TYPE_IDS.OBS_WORDS_LINKS]: 'OBS Translation Words Links',
    [RESOURCE_TYPE_IDS.OBS_QUESTIONS]: 'OBS Translation Questions',
    [RESOURCE_TYPE_IDS.COMBINED_HELPS]: 'Helps',
    [RESOURCE_TYPE_IDS.OBS_COMBINED_HELPS]: 'OBS Helps',
  }

  return displayNames[id] || id
}
