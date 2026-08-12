/**
 * Scripture Loader - Package Exports
 *
 * Default process path = USJ (UsjScriptureViewModel + scripture-usj: cache).
 * ProcessedScripture helpers are transitional projections for Helps.
 *
 * Viewer: prefer loadViewModel() / loadScriptureResult() and import types from here
 * (not @bt-synergy/usfm-processor).
 */

export { ScriptureLoader } from './ScriptureLoader'
export { MemoryCache } from './MemoryCache'
export { resolveUseUsjPipeline } from './resolveUseUsjPipeline'
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
  USJ_PROCESSING_VERSION,
  USJ_TOOL_VERSIONS,
} from '@bt-synergy/usj-processor'

/**
 * Transitional ProcessedScripture DTO — import from here (or usj-processor),
 * not from @bt-synergy/usfm-processor, so Viewer can drop usfm-processor.
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
  USFMProcessingOptions,
} from '@bt-synergy/usj-processor'
