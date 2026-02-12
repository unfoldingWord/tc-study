/**
 * Fetch-parse pipeline: composes adapters for downloading and parsing resources
 */

import type { HttpClient, ResourceAdapter } from '../types'
import { ScriptureAdapter } from '../adapters/scripture-adapter'
import { NotesAdapter } from '../adapters/notes-adapter'
import { QuestionsAdapter } from '../adapters/questions-adapter'
import { AcademyAdapter } from '../adapters/academy-adapter'
import { TranslationWordsAdapter } from '../adapters/translation-words-adapter'
import { TranslationWordsLinksAdapter } from '../adapters/translation-words-links-adapter'

export interface FetchParsePipeline {
  adapters: ResourceAdapter<unknown>[]
}

const defaultHttpClient: HttpClient = {
  get: async <T>(url: string): Promise<{ data: T }> => {
    const res = await fetch(url)
    if (!res.ok) throw new Error(`HTTP ${res.status}: ${url}`)
    const text = await res.text()
    return { data: text as T }
  },
}

/**
 * Create a pipeline with all default adapters (scripture, notes, questions, academy, TW, TWL).
 * Pass an optional HttpClient; uses fetch-based client if not provided.
 */
export function createDefaultPipeline(httpClient: HttpClient = defaultHttpClient): FetchParsePipeline {
  return {
    adapters: [
      new ScriptureAdapter(httpClient),
      new NotesAdapter(httpClient),
      new QuestionsAdapter(httpClient),
      new AcademyAdapter(httpClient),
      new TranslationWordsAdapter(httpClient),
      new TranslationWordsLinksAdapter(httpClient),
    ],
  }
}
