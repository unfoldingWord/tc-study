/**
 * Resource Type Plugins
 * 
 * All resource types supported by tc-study are defined here.
 * Each type is a self-contained plugin with loader and viewer.
 * 
 * @see RESOURCE_TYPE_DEVELOPMENT.md for guide on adding new resource types
 */

// ===== RESOURCE TYPE IDS (TYPE-SAFE CONSTANTS) =====
export { RESOURCE_TYPE_IDS, getResourceTypeDisplayName, isValidResourceTypeId, type ResourceTypeId } from './resourceTypeIds'

// ===== REGISTERED RESOURCE TYPES =====
export { scriptureResourceType } from './scripture'
export { translationWordsResourceType } from './translationWords'
export { translationWordsLinksResourceType } from './translationWordsLinks'
export { translationAcademyResourceType } from './translationAcademy'
export { translationNotesResourceType } from './translationNotes'

// ===== RESOURCE PANELS INTEGRATION =====
// HOC for adding inter-panel communication to any viewer
export { withPanelCommunication, type InjectedPanelProps, type WithPanelCommunicationProps } from './withPanelCommunication'

// Future resource types (loaders created, need integration):
// export { questionsResourceType } from './questions'
// export { alignedBibleResourceType } from './aligned-bible'

