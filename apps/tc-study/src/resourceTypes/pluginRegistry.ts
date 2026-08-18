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
] as const

export type ResourceTypePluginExportName = (typeof RESOURCE_TYPE_PLUGIN_EXPORTS)[number]

/**
 * Pane-member + composition entries registered after resource types so `consumes` ids exist.
 * Not loader SoT / CatalogManager rows. TN/TWL have no 1:1 entries.
 */
export const PANEL_ENTRY_PLUGIN_EXPORTS = [
  'scripturePanelEntry',
  'obsPanelEntry',
  'questionsPanelEntry',
  'obsQuestionsPanelEntry',
  'combinedHelpsPanelEntry',
  'obsCombinedHelpsPanelEntry',
] as const

export type PanelEntryPluginExportName = (typeof PANEL_ENTRY_PLUGIN_EXPORTS)[number]

export const PANEL_MODE_PLUGIN_EXPORTS = ['scripturePanelMode', 'helpsPanelMode'] as const

export const PANEL_GROUP_PLUGIN_EXPORTS = ['scripturePanelGroup', 'obsPanelGroup'] as const

/** @deprecated Use PANEL_ENTRY_PLUGIN_EXPORTS */
export const COMPOSITION_PLUGIN_EXPORTS = [
  'combinedHelpsPanelEntry',
  'obsCombinedHelpsPanelEntry',
] as const
