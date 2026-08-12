export {
  USJProcessor,
  isUsjCacheVersionCompatible,
  type USJProcessResult,
} from './USJProcessor'
export { attachAlignmentSemanticIds } from './attachAlignmentSemanticIds'
export {
  buildParityReport,
  formatParityReport,
  collectSemanticIdSet,
  collectSurfaceOccurrenceSet,
  compareAlignedOriginalWordIds,
  type ParityReport,
  type ParityBucket,
  type AlignmentParity,
} from './parity'
export {
  semanticIdFor,
  remapVerseRefBookCode,
  assignSurfaceOccurrences,
  semanticIdKey,
  type SurfaceOccurrence,
} from './identity'
export {
  buildUsjViewModel,
  attachAlignedOriginalWordIds,
  flattenUsjTokens,
  collectViewModelSemanticIdSet,
  type UsjScriptureViewModel,
  type UsjChapterView,
  type UsjVerseView,
  type UsjWordToken,
  type BuildUsjViewModelParams,
} from './usjViewModel'
export { projectToProcessedScripture } from './projectToProcessedScripture'
export {
  viewModelFromProcessedScripture,
  usjTokensFromProcessedVerse,
} from './viewModelFromProcessed'
export { collectUsjWords, parseVerseSid, extractText } from './usjWalk'
export { USJ_PROCESSING_VERSION, USJ_TOOL_VERSIONS, type UsjToolVersions } from './versions'
export type { CachedUsjDocument, UsjScriptureCacheContent } from './usjCacheTypes'
export type { AlignmentMap } from './usfmTools'

/**
 * Transitional ProcessedScripture DTO types (USJ projection). Prefer
 * UsjScriptureViewModel / UsjWordToken for new Viewer / Helps code.
 */
export type {
  ProcessedScripture,
  ProcessedChapter,
  ProcessedVerse,
  ProcessedParagraph,
  WordToken,
  WordAlignment,
  TranslatorSection,
  ProcessingResult,
  USJProcessingOptions,
} from './processedTypes'
