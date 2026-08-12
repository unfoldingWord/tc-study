/**
 * Door43 Scripture Adapter
 *
 * Fetches USFM and projects via USJProcessor → OptimizedScripture (Helps DTO).
 */

import type { Door43Resource } from '@bt-synergy/door43-api'
import { getUSFMUrl } from '@bt-synergy/door43-api'
import { processUsfmToOptimizedScripture } from '@bt-synergy/resource-parsers'
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
    const { bookCode, bookName } = options

    if (!bookCode) {
      throw new Error('bookCode is required for scripture resources')
    }

    const usfmUrl = getUSFMUrl(resource, bookCode)
    const usfmContent = await this.downloadContent(usfmUrl)

    const optimized = await processUsfmToOptimizedScripture(
      usfmContent,
      bookCode,
      bookName || bookCode
    )

    return this.createResult(optimized, resource, bookCode, bookName)
  }
}
