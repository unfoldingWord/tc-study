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
  usjScriptureChapterKey,
  LEGACY_SCRIPTURE_PREFIX,
  USJ_SCRIPTURE_PREFIX,
  STALE_SCRIPTURE_CACHE_HINT,
  isUsjScriptureKey,
  isUsjScriptureChapterKey,
  isLegacyScriptureKey,
} from './scriptureCacheKeys'
export {
  buildUsjChapterContent,
  buildUsjBookIndex,
  writeUsjChapters,
  readUsjChapter,
  readUsjBook,
  hasUsjChapterOrBook,
  unwrapUsjEntry,
  isUsjBookIndex,
  type UsjChapterCache,
  type UsjScriptureBookIndex,
} from './usjChapterStore'
export {
  scriptureChapterNumbers,
  hasScripturePayload,
  hasUsableScriptureChapter,
  isScriptureBookComplete,
  readScriptureBookCompleteInputs,
  isCachedScriptureBookComplete,
  type ScriptureBookCache,
} from './scriptureBookComplete'
export {
  ABSENT_FROM_RELEASE_KEY,
  normalizeIngredientPath,
  ingredientPresentInPathSet,
  partitionIngredientsByReleasePaths,
  pathSetFromZipFileNames,
  omitAbsentIngredients,
  readAbsentFromRelease,
  mergeAbsentFromReleaseIds,
  presentIngredientCount,
  persistAbsentFromRelease,
  fetchReleasePathSet,
  type IngredientPathRef,
} from './releaseIngredientPresence'
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
  viewModelChapterToOptimized,
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
  buildUsjLayoutBlocksForChapter,
  filterUsjLayoutBlocks,
  clipLayoutInlineToVerses,
  collectVerseDisplayInline,
  collectVerseBlockSequence,
  plainTextFromLayoutInline,
  shouldInsertSpaceBeforeInline,
  indentLevelForMarker,
  roleForMarker,
  USJ_PROCESSING_VERSION,
  USJ_TOOL_VERSIONS,
} from '@bt-synergy/usj-processor'
export type {
  UsjLayoutBlock,
  UsjLayoutInline,
  UsjLayoutBlockRole,
  UsjVerseBlockItem,
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
