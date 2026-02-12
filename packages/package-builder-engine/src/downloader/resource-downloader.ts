import type { FetchParsePipeline } from '@bt-synergy/resource-adapters'
import type { DownloadProgress } from '../types'

export class ResourceDownloader {
  constructor(private pipeline: FetchParsePipeline) {}

  async downloadResources(
    _requests: Array<{ resource: unknown; options: unknown }>,
    _onProgress?: (progress: DownloadProgress) => void
  ): Promise<Array<{ data: unknown }>> {
    return []
  }
}
