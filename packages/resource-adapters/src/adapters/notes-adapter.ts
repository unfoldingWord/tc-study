/**
 * Door43 Translation Notes Adapter
 * 
 * Fetches and parses TSV translation notes
 */

import type { Door43Resource } from '@bt-synergy/door43-api'
import { getNotesUrl } from '@bt-synergy/door43-api'
import { NotesProcessor } from '@bt-synergy/resource-parsers'
import type { ProcessedNotes } from '@bt-synergy/resource-parsers'
import { BaseResourceAdapter } from './base-adapter'
import type { ResourceContent, DownloadOptions, HttpClient } from '../types'

export class NotesAdapter extends BaseResourceAdapter<ProcessedNotes> {
  private notesProcessor: NotesProcessor
  
  constructor(httpClient: HttpClient) {
    super(httpClient)
    this.notesProcessor = new NotesProcessor()
  }
  
  getSupportedTypes(): string[] {
    return ['Translation Notes', 'TSV Translation Notes', 'translation-notes']
  }
  
  async fetchAndParse(
    resource: Door43Resource,
    options: DownloadOptions = {}
  ): Promise<ResourceContent<ProcessedNotes>> {
    const { bookCode, bookName } = options
    
    if (!bookCode) {
      throw new Error('bookCode is required for translation notes')
    }
    
    // Get notes URL using door43-api helper
    const tsvUrl = getNotesUrl(resource, bookCode)
    
    // Download TSV content
    const tsvContent = await this.downloadContent(tsvUrl)
    
    // Parse notes
    const notes = await this.notesProcessor.processNotes(
      tsvContent,
      bookCode,
      bookName || bookCode
    )
    
    return this.createResult(
      notes,
      resource,
      bookCode,
      bookName
    )
  }
}
