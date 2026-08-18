/**
 * Resource Type Plugins
 * 
 * All resource types supported by tc-study are defined here.
 * Each type is a self-contained plugin with loader and viewer.
 * 
 * @see docs/extending-registries.md for resource types, panel entries, and modes
 */

// ===== RESOURCE TYPE IDS (TYPE-SAFE CONSTANTS) =====
export { RESOURCE_TYPE_IDS, getResourceTypeDisplayName, isValidResourceTypeId, type ResourceTypeId } from './resourceTypeIds'

// ===== REGISTERED RESOURCE TYPES =====
export { scriptureResourceType } from './scripture'
export { obsResourceType } from './obs'
export { translationAcademyResourceType } from './translationAcademy'
export { translationNotesResourceType } from './translationNotes'
export { translationQuestionsResourceType } from './translationQuestions'
export { translationWordsResourceType } from './translationWords'
export { translationWordsLinksResourceType } from './translationWordsLinks'

// ===== OBS COMPANION TYPES =====
export { obsTranslationNotesResourceType } from './obsTranslationNotes'
export { obsTranslationWordsLinksResourceType } from './obsTranslationWordsLinks'
export { obsTranslationQuestionsResourceType } from './obsTranslationQuestions'
export {
  combinedHelpsPanelEntry,
  obsCombinedHelpsPanelEntry,
  combinedHelpsComposition,
  obsCombinedHelpsComposition,
} from './combinedHelps'
export {
  scripturePanelEntry,
  obsPanelEntry,
  questionsPanelEntry,
  obsQuestionsPanelEntry,
} from './panelEntries'
export { scripturePanelMode, helpsPanelMode } from './panelModes'
export { scripturePanelGroup, obsPanelGroup } from './panelGroups'

// ===== RESOURCE PANELS INTEGRATION =====
// HOC for adding inter-panel communication to any viewer
export { withPanelCommunication, type InjectedPanelProps, type WithPanelCommunicationProps } from './withPanelCommunication'

// Future resource types (loaders created, need integration):
// export { alignedBibleResourceType } from './aligned-bible'

