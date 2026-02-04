/**
 * @bt-synergy/passage-sets
 * 
 * Passage set management system for Bible study and translation
 * Supports hierarchical passage sets with multimedia labels
 */

export { PassageSetManager } from './PassageSetManager'
export { PassageSetStorage } from './storage/PassageSetStorage'
export { PassageSetBuilderImpl, createPassageSetBuilder } from './builders/PassageSetBuilderImpl'

// Helper utilities
export {
  bcvToPassage,
  passageToBCV,
  parseSimpleRef,
  formatPassageRef,
  flattenPassageSet,
  getBookCodes,
  countPassages,
  estimateTotalTime,
  findNodeById,
  getNodePath,
  createSimplePassageSet,
} from './utils/passageHelpers'

// Core types
export type {
  // Passage Set types
  PassageSet,
  PassageSetMetadata,
  PassageSetCollection,
  PassageSetSearchOptions,
  PassageSetStats,
  
  // Node types
  PassageSetNode,
  PassageGroup,
  PassageLeaf,
  
  // Passage types
  Passage,
  RefRange,
  SimpleRef,
  VerseRef,
  VerseRange,
  ChapterRef,
  
  // Legacy types (backward compatibility)
  BCVReference,
  
  // Multimedia types
  MultimediaLabel,
  MediaType,
  MediaContent,
  MediaContentType,
  TextContent,
  ImageContent,
  AudioContent,
  VideoContent,
  
  // Metadata
  PassageMetadata,
  
  // Utility types
  FlatPassageList,
  PassageProgress,
  PassageFilter,
  
  // Builder types
  PassageSetBuilder,
  
  // Template types
  PassageSetTemplate,
  TemplateConfig,
  
  // Other
  ValidationResult,
  ExportFormat,
} from './types'
