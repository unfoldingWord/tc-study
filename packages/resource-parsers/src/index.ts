/**
 * @bt-synergy/resource-parsers
 * 
 * Platform-agnostic resource parsers for Door43 content
 */

// Interfaces
export type {
  ResourceParser,
  ParserOptions,
  ParserResult,
  USFMParser,
  USFMParserOptions,
  TSVParser,
  TSVParserOptions,
  MarkdownParser as IMarkdownParser,
  MarkdownParserOptions,
  JSONParser as IJSONParser,
  JSONParserOptions,
} from './interfaces/parser'

// Types
export type {
  ProcessedContent,
  TranslationNote,
  ProcessedNotes,
  TranslationQuestion,
  ProcessedQuestions,
  TranslationWordsLink,
  ProcessedWordsLinks,
  TranslationWord,
  AcademyArticle,
  OptimizedToken,
} from './types'

// USFM Parser
export {
  USFMProcessor,
  OptimizedScripture,
  OptimizedChapter,
  OptimizedVerse,
  usfmProcessor,
} from './parsers/usfm'

// TSV Parsers
export {
  NotesProcessor,
  QuestionsProcessor,
  WordsLinksProcessor,
} from './parsers/tsv'

// Markdown Parser
export { MarkdownParser } from './parsers/markdown'

// JSON Parser
export { JSONParser } from './parsers/json'

// Utilities
export {
  QuoteMatcher,
  generateSemanticId,
} from './utils'
