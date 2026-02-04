/**
 * Bible Brain Server Adapter (Example for future implementation)
 * 
 * Transforms Bible Brain API metadata into our unified ResourceMetadata format
 * This demonstrates how to support multiple content servers
 */

import type { ResourceMetadata } from '../types'
import { ResourceType, ResourceFormat, LocationType } from '../types'
import { BaseServerAdapter } from './types'

// Bible Brain-specific types (example)
interface BibleBrainResource {
  abbr: string
  name: string
  vname: string
  language: string
  iso: string
  date: string
  filesets: Array<{
    id: string
    type: string
    size: string
  }>
  [key: string]: any
}

/**
 * Example adapter for Bible Brain API
 * Demonstrates different metadata shape transformation
 */
export class BibleBrainServerAdapter extends BaseServerAdapter {
  readonly id = 'biblebrain'
  readonly name = 'Bible Brain'
  readonly baseUrl = 'https://api.biblebrain.com'
  
  /**
   * Transform Bible Brain metadata to ResourceMetadata
   * NOTE: Bible Brain has a completely different metadata structure
   */
  async transformMetadata(externalMetadata: unknown): Promise<ResourceMetadata> {
    const bbResource = externalMetadata as BibleBrainResource
    
    // Bible Brain uses different identifiers
    const resourceKey = this.buildResourceKey({
      owner: 'biblebrain', // Bible Brain doesn't have owners
      language: bbResource.iso,
      resourceId: bbResource.abbr,
    })
    
    // Bible Brain resources are always scripture
    const contentStructure = 'book'
    
    return {
      // Resource identity
      resourceKey,
      server: this.baseUrl,
      owner: 'biblebrain',
      language: bbResource.iso,
      resourceId: bbResource.abbr,
      
      // Basic info
      subject: 'Bible',
      version: bbResource.vname,
      title: bbResource.name,
      
      // Resource type & format
      type: ResourceType.SCRIPTURE,
      format: ResourceFormat.USFM, // Bible Brain typically provides USFM
      contentType: 'text/usfm',
      contentStructure, // ✅ Bible Brain resources are always book-organized
      
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
        path: `${this.baseUrl}/bibles/${bbResource.abbr}`,
        priority: 1,
      }],
      
      // Catalog tracking
      catalogedAt: new Date().toISOString(),
    }
  }
  
  /**
   * Bible Brain resources are always book-organized (scripture)
   */
  detectContentStructure(_externalMetadata: unknown): 'book' | 'entry' {
    return 'book'
  }
  
  /**
   * Bible Brain uses different resource key format
   */
  buildResourceKey(identifiers: Record<string, string>): string {
    const { language, resourceId } = identifiers
    if (!language || !resourceId) {
      throw new Error('Missing required identifiers: language, resourceId')
    }
    return `biblebrain/${language}_${resourceId}`
  }
  
  /**
   * Parse Bible Brain resource key
   */
  parseResourceKey(resourceKey: string): Record<string, string> {
    const match = resourceKey.match(/^biblebrain\/([^_]+)_(.+)$/)
    if (!match) {
      throw new Error(`Invalid Bible Brain resource key format: ${resourceKey}`)
    }
    
    return {
      owner: 'biblebrain',
      language: match[1],
      resourceId: match[2],
    }
  }
}
