/**
 * USFM parser exports — USJ-backed facade (`USFMProcessor` name kept for API stability).
 * SoT: `@bt-synergy/usj-processor` (not the deleted `@bt-synergy/usfm-processor` package).
 */

export { USFMProcessor, usfmProcessor } from './usfm-processor'
export type { OptimizedScripture, ProcessingResult } from './usfm-processor'
export {
  viewModelToOptimizedChapters,
  extractUsjBroadcastTokens,
} from './usj-projection'
export type { BroadcastScriptureToken } from './usj-projection'
export type {
  OptimizedChapter,
  OptimizedVerse,
  OptimizedToken,
  OptimizedParagraph,
} from '../../types/optimized-tokens'
