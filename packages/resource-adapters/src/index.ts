/**
 * @bt-synergy/resource-adapters
 * Platform-agnostic adapters for fetching and parsing Door43 content
 */

export type {
  HttpClient,
  ResourceContent,
  ResourceContentMetadata,
  DownloadOptions,
  ResourceAdapter,
} from './types'

export { BaseResourceAdapter } from './adapters/base-adapter'
export { ScriptureAdapter } from './adapters/scripture-adapter'
export { NotesAdapter } from './adapters/notes-adapter'
export { QuestionsAdapter } from './adapters/questions-adapter'
export { AcademyAdapter } from './adapters/academy-adapter'
export { TranslationWordsAdapter } from './adapters/translation-words-adapter'
export { TranslationWordsLinksAdapter } from './adapters/translation-words-links-adapter'
export { OriginalAdapter } from './adapters/original-adapter'

export {
  createDefaultPipeline,
  type FetchParsePipeline,
} from './pipeline/fetch-parse-pipeline'
