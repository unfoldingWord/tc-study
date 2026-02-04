/**
 * Base Server Adapter
 * 
 * Base class for server adapters that transform external API metadata
 * into our unified ResourceMetadata format
 */

export abstract class BaseServerAdapter {
  abstract readonly id: string
  abstract readonly name: string
  abstract readonly baseUrl: string
  
  /**
   * Transform external metadata to ResourceMetadata
   */
  abstract transformMetadata(externalMetadata: unknown): Promise<import('../types').ResourceMetadata>
  
  /**
   * Build resource key from identifiers
   */
  abstract buildResourceKey(identifiers: Record<string, string>): string
}
