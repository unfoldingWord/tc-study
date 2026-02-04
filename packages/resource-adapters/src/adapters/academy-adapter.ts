/**
 * Door43 Translation Academy Adapter
 * 
 * Fetches and parses markdown academy articles
 */

import type { Door43Resource } from '@bt-synergy/door43-api'
import { getContentUrl } from '@bt-synergy/door43-api'
import { MarkdownParser } from '@bt-synergy/resource-parsers'
import type { AcademyArticle } from '@bt-synergy/resource-parsers'
import { BaseResourceAdapter } from './base-adapter'
import type { ResourceContent, DownloadOptions, HttpClient } from '../types'

export class AcademyAdapter extends BaseResourceAdapter<AcademyArticle[]> {
  private markdownParser: MarkdownParser
  
  constructor(httpClient: HttpClient) {
    super(httpClient)
    this.markdownParser = new MarkdownParser()
  }
  
  getSupportedTypes(): string[] {
    return ['Translation Academy', 'translation-academy']
  }
  
  async fetchAndParse(
    resource: Door43Resource,
    options: DownloadOptions = {}
  ): Promise<ResourceContent<AcademyArticle[]>> {
    // Translation Academy is organized as a collection of markdown files
    // Similar to Translation Words, needs directory listing support
    
    const baseUrl = getContentUrl(resource)
    
    const articles: AcademyArticle[] = []
    
    return this.createResult(
      articles,
      resource,
      undefined,
      undefined,
      ['Translation Academy adapter needs directory listing support']
    )
  }
}
