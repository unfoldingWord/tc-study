/**
 * Door43 Translation Questions Adapter
 * 
 * Fetches and parses TSV translation questions
 */

import type { Door43Resource } from '@bt-synergy/door43-api'
import { getQuestionsUrl } from '@bt-synergy/door43-api'
import { QuestionsProcessor } from '@bt-synergy/resource-parsers'
import type { ProcessedQuestions } from '@bt-synergy/resource-parsers'
import { BaseResourceAdapter } from './base-adapter'
import type { ResourceContent, DownloadOptions, HttpClient } from '../types'

export class QuestionsAdapter extends BaseResourceAdapter<ProcessedQuestions> {
  private questionsProcessor: QuestionsProcessor
  
  constructor(httpClient: HttpClient) {
    super(httpClient)
    this.questionsProcessor = new QuestionsProcessor()
  }
  
  getSupportedTypes(): string[] {
    return ['Translation Questions', 'TSV Translation Questions', 'translation-questions']
  }
  
  async fetchAndParse(
    resource: Door43Resource,
    options: DownloadOptions = {}
  ): Promise<ResourceContent<ProcessedQuestions>> {
    const { bookCode, bookName } = options
    
    if (!bookCode) {
      throw new Error('bookCode is required for translation questions')
    }
    
    // Get questions URL using door43-api helper
    const tsvUrl = getQuestionsUrl(resource, bookCode)
    
    // Download TSV content
    const tsvContent = await this.downloadContent(tsvUrl)
    
    // Parse questions
    const questions = await this.questionsProcessor.processQuestions(
      tsvContent,
      bookCode,
      bookName || bookCode
    )
    
    return this.createResult(
      questions,
      resource,
      bookCode,
      bookName
    )
  }
}
