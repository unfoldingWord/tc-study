import type { Door43Resource } from '@bt-synergy/door43-api'

export interface HttpClient {
  get<T>(url: string): Promise<{ data: T }>
}

export interface ResourceContentMetadata {
  resourceId: string
  bookCode?: string
  bookName?: string
  timestamp: string
  source: string
}

export interface ResourceContent<T = unknown> {
  data: T
  metadata: ResourceContentMetadata
  warnings?: string[]
  errors?: string[]
}

export interface DownloadOptions {
  bookCode?: string
  bookName?: string
  includeAlignments?: boolean
  includeSections?: boolean
}

export interface ResourceAdapter<TOutput = unknown> {
  fetchAndParse(
    resource: Door43Resource,
    options?: DownloadOptions
  ): Promise<ResourceContent<TOutput>>
  getSupportedTypes(): string[]
  canHandle(resource: Door43Resource): boolean
}
