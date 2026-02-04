/**
 * Base Resource Adapter
 * 
 * Provides common functionality for all adapters
 */

import type { Door43Resource } from '@bt-synergy/door43-api'
import type { HttpClient, ResourceAdapter, ResourceContent, DownloadOptions } from '../types'

export abstract class BaseResourceAdapter<TOutput = any> implements ResourceAdapter<TOutput> {
  constructor(protected httpClient: HttpClient) {}
  
  /**
   * Fetch and parse resource (must be implemented by subclasses)
   */
  abstract fetchAndParse(
    resource: Door43Resource,
    options?: DownloadOptions
  ): Promise<ResourceContent<TOutput>>
  
  /**
   * Get supported resource types (must be implemented by subclasses)
   */
  abstract getSupportedTypes(): string[]
  
  /**
   * Check if this adapter can handle a resource
   */
  canHandle(resource: Door43Resource): boolean {
    const supportedTypes = this.getSupportedTypes()
    return supportedTypes.includes(resource.subject || '')
  }
  
  /**
   * Download raw content from URL
   */
  protected async downloadContent(url: string): Promise<string> {
    const response = await this.httpClient.get<string>(url)
    return response.data
  }
  
  /**
   * Download binary content (e.g., zip files)
   */
  protected async downloadBinary(url: string): Promise<ArrayBuffer> {
    const response = await this.httpClient.get<ArrayBuffer>(url)
    return response.data
  }
  
  /**
   * Create metadata object
   */
  protected createMetadata(
    resource: Door43Resource,
    bookCode?: string,
    bookName?: string
  ) {
    return {
      resourceId: resource.id,
      bookCode,
      bookName,
      timestamp: new Date().toISOString(),
      source: resource.html_url || '',
    }
  }
  
  /**
   * Create resource content result
   */
  protected createResult<T>(
    data: T,
    resource: Door43Resource,
    bookCode?: string,
    bookName?: string,
    warnings?: string[],
    errors?: string[]
  ): ResourceContent<T> {
    return {
      data,
      metadata: this.createMetadata(resource, bookCode, bookName),
      warnings,
      errors,
    }
  }
}
