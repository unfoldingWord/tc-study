/**
 * Door43 Server Adapter
 * 
 * Transforms Door43 API metadata into our unified ResourceMetadata format
 */

import type { ResourceMetadata } from '../types'
import { LocationType, ResourceFormat, ResourceType } from '../types'
import { BaseServerAdapter } from './types'

// Door43-specific types (imported from @bt-synergy/door43-api in real usage)
interface Door43Resource {
  id: string
  name: string
  owner: string
  language: string
  language_title?: string
  language_direction?: 'ltr' | 'rtl'
  subject: string
  version: string
  content_format?: string
  flavor_type?: string
  flavor?: string
  books?: string[]
  ingredients?: Array<{
    identifier: string
    title: string
    categories?: string[]
  }>
  release?: {
    tag_name: string
    zipball_url: string
    tarball_url: string
    published_at: string
  }
  metadata?: Record<string, any>
  [key: string]: any
}

export class Door43ServerAdapter extends BaseServerAdapter {
  readonly id = 'door43'
  readonly name = 'Door43 Content Service'
  readonly baseUrl = 'https://git.door43.org'
  
  /**
   * Transform Door43Resource to ResourceMetadata
   */
  async transformMetadata(externalMetadata: unknown): Promise<ResourceMetadata> {
    const door43Resource = externalMetadata as Door43Resource
    
    // Build resource key
    const resourceKey = this.buildResourceKey({
      owner: door43Resource.owner,
      language: door43Resource.language,
      resourceId: door43Resource.id,
    })
    
    // Map content format
    const format = this.mapContentFormat(door43Resource.content_format)
    const contentType = this.mapContentType(door43Resource.content_format)
    
    // Detect content structure
    const contentStructure = this.detectContentStructure(door43Resource)
    
    // Extract ingredients
    const ingredients = door43Resource.ingredients?.map(ing => ({
      id: ing.identifier,
      title: ing.title,
      categories: ing.categories,
    }))
    
    return {
      // Resource identity
      resourceKey,
      server: this.baseUrl,
      owner: door43Resource.owner,
      language: door43Resource.language,
      resourceId: door43Resource.id,
      
      // Basic info
      subject: door43Resource.subject,
      version: door43Resource.version,
      title: door43Resource.name || door43Resource.id,
      
      // Resource type & format
      type: this.inferResourceType(door43Resource.id, door43Resource.subject) as ResourceType,
      format,
      contentType,
      contentStructure, // ✅ Auto-detected from Door43 metadata
      
      // Availability
      availability: {
        online: true,
        offline: false,
        bundled: false,
        partial: false,
      },
      
      // Locations
      locations: [{
        type: LocationType.NETWORK,
        path: `${this.baseUrl}/${door43Resource.owner}/${door43Resource.language}_${door43Resource.id}`,
        priority: 1,
      }],
      
      // Content metadata
      contentMetadata: {
        books: door43Resource.books,
        ingredients: ingredients?.map(ing => ({
          identifier: ing.id,
          title: ing.title,
          path: '',
          categories: ing.categories,
        })),
      },
      
      // Release information
      release: door43Resource.release,
      
      // Catalog tracking
      catalogedAt: new Date().toISOString(),
    }
  }
  
  /**
   * Auto-detect content structure from Door43 metadata
   */
  detectContentStructure(externalMetadata: unknown): 'book' | 'entry' {
    const resource = externalMetadata as Door43Resource
    
    const subject = resource.subject?.toLowerCase() || ''
    const flavor = resource.flavor?.toLowerCase() || ''
    
    // Entry-organized patterns
    if (subject.includes('translation words') || flavor.includes('translationwords')) {
      return 'entry'
    }
    if (subject.includes('translation academy') || flavor.includes('translationacademy')) {
      return 'entry'
    }
    
    // Default to book-organized
    // (Scripture, Notes, Questions, Links, etc.)
    return 'book'
  }
  
  /**
   * Map Door43 content_format to our ResourceFormat
   */
  private mapContentFormat(contentFormat?: string): ResourceFormat {
    const formatMap: Record<string, ResourceFormat> = {
      'usfm': ResourceFormat.USFM,
      'markdown': ResourceFormat.MARKDOWN,
      'text/tsv': ResourceFormat.TSV,
      'tsv7': ResourceFormat.TSV,
      'tsv': ResourceFormat.TSV,
    }
    
    return formatMap[contentFormat?.toLowerCase() || ''] || ResourceFormat.UNKNOWN
  }
  
  /**
   * Map Door43 content_format to MIME type
   */
  private mapContentType(contentFormat?: string): string {
    const typeMap: Record<string, string> = {
      'usfm': 'text/usfm',
      'markdown': 'text/markdown',
      'tsv7': 'text/tsv',
      'tsv': 'text/tsv',
    }
    
    return typeMap[contentFormat?.toLowerCase() || ''] || 'text/plain'
  }
  
  /**
   * Infer resource type from Door43 metadata
   */
  private inferResourceType(id: string, subject: string): string {
    const typeMap: Record<string, string> = {
      'ult': 'scripture',
      'glt': 'scripture',
      'ust': 'scripture',
      'gst': 'scripture',
      'ulb': 'scripture',
      'udb': 'scripture',
      'ugnt': 'scripture',
      'uhb': 'scripture',
      'tn': 'notes',
      'tq': 'questions',
      'tw': 'words',
      'twl': 'words_links',
      'ta': 'academy',
      'obs': 'stories',
    }
    
    return typeMap[id.toLowerCase()] || 'unknown'
  }
  
  /**
   * Build Door43 resource key from identifiers
   * Uses standard app format: owner/language/resourceId (forward slashes)
   */
  buildResourceKey(identifiers: Record<string, string>): string {
    const { owner, language, resourceId } = identifiers
    if (!owner || !language || !resourceId) {
      throw new Error('Missing required identifiers: owner, language, resourceId')
    }
    return `${owner}/${language}/${resourceId}`
  }
  
  /**
   * Parse Door43 resource key
   * Expects 3-part format: owner/language/resourceId
   */
  parseResourceKey(resourceKey: string): Record<string, string> {
    const parts = resourceKey.split('/')
    
    if (parts.length !== 3) {
      throw new Error(
        `Invalid Door43 resource key format: ${resourceKey}. ` +
        `Expected format: owner/language/resourceId (3 parts separated by /)`
      )
    }
    
    const [owner, language, resourceId] = parts
    
    if (!owner || !language || !resourceId) {
      throw new Error(
        `Invalid Door43 resource key: ${resourceKey}. ` +
        `All parts (owner, language, resourceId) must be non-empty.`
      )
    }
    
    return { owner, language, resourceId }
  }
}

