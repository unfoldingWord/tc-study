/**
 * Resource Type IDs
 * 
 * Central source of truth for all resource type identifiers.
 * Use these constants instead of string literals to ensure type safety.
 * 
 * @example
 * ```typescript
 * // ✅ Good - type safe
 * dependencies: [RESOURCE_TYPE_IDS.TRANSLATION_WORDS]
 * 
 * // ❌ Bad - error prone
 * dependencies: ['words']
 * ```
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
} as const

// Type-safe union of all valid resource type IDs
export type ResourceTypeId = typeof RESOURCE_TYPE_IDS[keyof typeof RESOURCE_TYPE_IDS]

/**
 * Validate if a string is a valid resource type ID
 */
export function isValidResourceTypeId(id: string): id is ResourceTypeId {
  return Object.values(RESOURCE_TYPE_IDS).includes(id as ResourceTypeId)
}

/**
 * Get display name for a resource type ID
 * Useful for error messages and logging
 */
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
  }
  
  return displayNames[id] || id
}
