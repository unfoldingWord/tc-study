/**
 * Scripture Loader - Package Exports
 *
 * Default process path = USJ (UsjScriptureViewModel + scripture-usj: cache).
 * ProcessedScripture helpers are transitional projections for Viewer / Panels.
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
export type * from './types'

/** Re-export runtime contract types other teams should import. */
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
  USJ_PROCESSING_VERSION,
  USJ_TOOL_VERSIONS,
} from '@bt-synergy/usj-processor'

