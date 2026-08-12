/**
 * USFM → USJ Helps projections (OptimizedScripture / OptimizedChapter).
 * Parse SoT: `@bt-synergy/usj-processor` (`USJProcessor`, UsjScriptureViewModel).
 */

export {
  processUsfmToOptimizedScripture,
  viewModelToOptimizedScripture,
} from './optimized-scripture'
export type { OptimizedScripture } from './optimized-scripture'
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
