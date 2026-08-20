/**
 * Ordered list of resource type plugin export names registered at runtime.
 * Must stay in parity with loaderConfig SoT entries where `surfaces.mainPlugin`.
 */
export const RESOURCE_TYPE_PLUGIN_EXPORTS = [
  'scriptureResourceType',
  'obsResourceType',
  'translationWordsLinksResourceType',
  'translationNotesResourceType',
  'translationQuestionsResourceType',
  'obsTranslationNotesResourceType',
  'obsTranslationWordsLinksResourceType',
  'obsTranslationQuestionsResourceType',
  'translationWordsResourceType',
  'translationAcademyResourceType',
  'combinedHelpsResourceType',
  'obsCombinedHelpsResourceType',
] as const

export type ResourceTypePluginExportName = (typeof RESOURCE_TYPE_PLUGIN_EXPORTS)[number]
