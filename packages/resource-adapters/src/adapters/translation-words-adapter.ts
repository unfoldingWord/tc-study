/**
 * Door43 Translation Words Adapter
 * 
 * Fetches and parses markdown translation words
 */

import type { Door43Resource } from '@bt-synergy/door43-api'
import { getContentUrl } from '@bt-synergy/door43-api'
import { MarkdownParser } from '@bt-synergy/resource-parsers'
import type { TranslationWord } from '@bt-synergy/resource-parsers'
import { BaseResourceAdapter } from './base-adapter'
import type { ResourceContent, DownloadOptions, HttpClient } from '../types'

export class TranslationWordsAdapter extends BaseResourceAdapter<TranslationWord[]> {
  private markdownParser: MarkdownParser
  
  constructor(httpClient: HttpClient) {
    super(httpClient)
    this.markdownParser = new MarkdownParser()
  }
  
  getSupportedTypes(): string[] {
    return ['Translation Words', 'translation-words']
  }
  
  async fetchAndParse(
    resource: Door43Resource,
    options: DownloadOptions = {}
  ): Promise<ResourceContent<TranslationWord[]>> {
    // Translation Words is organized as a dictionary of markdown files
    // We'll need to fetch the manifest and then individual files
    
    const baseUrl = getContentUrl(resource)
    
    // For now, return empty array - full implementation would:
    // 1. Fetch the directory structure
    // 2. Download individual .md files
    // 3. Parse markdown to extract term and definition
    
    const words: TranslationWord[] = []
    
    return this.createResult(
      words,
      resource,
      undefined,
      undefined,
      ['Translation Words adapter needs directory listing support']
    )
  }
}
