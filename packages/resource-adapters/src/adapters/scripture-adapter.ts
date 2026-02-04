/**
 * Door43 Scripture Adapter
 * 
 * Fetches and parses USFM scripture content
 */

import type { Door43Resource } from '@bt-synergy/door43-api'
import { getUSFMUrl } from '@bt-synergy/door43-api'
import { usfmProcessor } from '@bt-synergy/resource-parsers'
import type { OptimizedScripture } from '@bt-synergy/resource-parsers'
import { BaseResourceAdapter } from './base-adapter'
import type { ResourceContent, DownloadOptions, HttpClient } from '../types'

export class ScriptureAdapter extends BaseResourceAdapter<OptimizedScripture> {
  constructor(httpClient: HttpClient) {
    super(httpClient)
  }
  
  getSupportedTypes(): string[] {
    return ['Bible', 'Aligned Bible', 'bible', 'aligned-bible']
  }
  
  async fetchAndParse(
    resource: Door43Resource,
    options: DownloadOptions = {}
  ): Promise<ResourceContent<OptimizedScripture>> {
    const { bookCode, bookName, includeAlignments = true, includeSections = true } = options
    
    if (!bookCode) {
      throw new Error('bookCode is required for scripture resources')
    }
    
    // Get USFM URL using door43-api helper
    const usfmUrl = getUSFMUrl(resource, bookCode)
    
    // Download USFM content
    const usfmContent = await this.downloadContent(usfmUrl)
    
    // Parse USFM
    const processingResult = await usfmProcessor.processUSFM(
      usfmContent,
      bookCode,
      bookName || bookCode
    )
    
    return this.createResult(
      processingResult.structuredText as any,
      resource,
      bookCode,
      bookName
    )
  }
}
