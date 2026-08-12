/**
 * @deprecated Import from `./optimized-scripture` (or `@bt-synergy/resource-parsers`).
 * Thin re-export kept for one release — USJ naming is canonical.
 */

export {
  USFMProcessor,
  usfmProcessor,
  processUsfmToOptimizedScripture,
  viewModelToOptimizedScripture,
} from './optimized-scripture'
export type {
  OptimizedScripture,
  OptimizedToken,
  OptimizedVerse,
  OptimizedParagraph,
  OptimizedChapter,
  ProcessingResult,
  TranslatorSection,
  USFMProcessingOptions,
} from './optimized-scripture'
