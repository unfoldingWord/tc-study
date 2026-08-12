/**
 * Scripture Loader - Package Exports
 *
 * Sole process + cache path = USJ (`scripture-usj:`).
 * Primary API: ScriptureLoader.loadScriptureResult / loadViewModel.
 * Helps: loadViewModel() + viewModelToOptimizedChapters / extractUsjBroadcastTokens.
 * ProcessedScripture helpers are transitional projections only.
 */

export { ScriptureLoader } from './ScriptureLoader'
export { MemoryCache } from './MemoryCache'
export {
  processUsfmToUsjResult,
  processUsfmToScripture,
  type ProcessUsfmParams,
  type ProcessUsfmToUsjResult,
} from './processUsfm'
export {
  legacyScriptureKey,
  usjScriptureKey,
  LEGACY_SCRIPTURE_PREFIX,
  USJ_SCRIPTURE_PREFIX,
  STALE_SCRIPTURE_CACHE_HINT,
  isUsjScriptureKey,
  isLegacyScriptureKey,
} from './scriptureCacheKeys'
export {
  isUsjScriptureCacheContent,
  isProcessedScriptureContent,
  usjResultFromCache,
  viewModelFromUsjCache,
  processedFromUsjCache,
} from './usjCache'
export type { ScriptureLoadResult } from './scriptureLoadResult'
export {
  viewModelToOptimizedChapters,
  extractUsjBroadcastTokens,
  type BroadcastScriptureToken,
} from './usjHelpsProjection'
export type * from './types'

/** Runtime identity + view-model contract (preferred). */
export type {
  UsjScriptureViewModel,
  UsjWordToken,
  UsjVerseView,
  UsjChapterView,
  UsjScriptureCacheContent,
  USJProcessResult,
  AlignmentMap,
} from '@bt-synergy/usj-processor'
export {
  semanticIdFor,
  semanticIdKey,
  projectToProcessedScripture,
  viewModelFromProcessedScripture,
  usjTokensFromProcessedVerse,
  buildUsjLayoutBlocks,
  filterUsjLayoutBlocks,
  indentLevelForMarker,
  roleForMarker,
  USJ_PROCESSING_VERSION,
  USJ_TOOL_VERSIONS,
} from '@bt-synergy/usj-processor'
export type {
  UsjLayoutBlock,
  UsjLayoutInline,
  UsjLayoutBlockRole,
  FilterUsjLayoutOptions,
} from '@bt-synergy/usj-processor'

/**
 * Transitional ProcessedScripture DTO — import from here (or usj-processor).
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
} from '@bt-synergy/usj-processor'
