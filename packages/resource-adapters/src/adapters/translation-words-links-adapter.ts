/**
 * Door43 Translation Words Links Adapter
 * 
 * Fetches and parses TSV translation words links
 */

import type { Door43Resource } from '@bt-synergy/door43-api'
import { getWordsLinksUrl } from '@bt-synergy/door43-api'
import type { ProcessedWordsLinks } from '@bt-synergy/resource-parsers'
import { BaseResourceAdapter } from './base-adapter'
import type { ResourceContent, DownloadOptions, HttpClient } from '../types'

export class TranslationWordsLinksAdapter extends BaseResourceAdapter<ProcessedWordsLinks> {
  constructor(httpClient: HttpClient) {
    super(httpClient)
  }
  
  getSupportedTypes(): string[] {
    return ['Translation Words Links', 'TSV Translation Words Links', 'translation-words-links']
  }
  
  async fetchAndParse(
    resource: Door43Resource,
    options: DownloadOptions = {}
  ): Promise<ResourceContent<ProcessedWordsLinks>> {
    console.log('[TWL Adapter] 🔄 fetchAndParse() called', { bookCode: options.bookCode, bookName: options.bookName, resourceId: resource?.resourceId })
    
    const { bookCode, bookName } = options
    
    if (!bookCode) {
      throw new Error('bookCode is required for translation words links')
    }
    
    // Get translation words links URL using door43-api helper
    const tsvUrl = getWordsLinksUrl(resource, bookCode)
    console.log('[TWL Adapter] 📥 Downloading TSV from:', tsvUrl)
    
    // Download TSV content
    const tsvContent = await this.downloadContent(tsvUrl)
    console.log('[TWL Adapter] ✅ Downloaded TSV, length:', tsvContent.length, 'chars')
    
    // Parse TSV (similar to notes/questions)
    const links = this.parseTSV(tsvContent, bookCode, bookName || bookCode)
    console.log('[TWL Adapter] ✅ Parsed', links.links.length, 'links')
    
    return this.createResult(
      links,
      resource,
      bookCode,
      bookName
    )
  }
  
  /**
   * Parse TSV content (simplified for now)
   */
  private parseTSV(tsvContent: string, bookCode: string, bookName: string): ProcessedWordsLinks {
    const lines = tsvContent.split('\n').filter(line => line.trim())
    const links = lines.slice(1).map((line, index) => {
      // TSV format: Reference, ID, Tags, OrigWords, Occurrence, TWLink
      const parts = line.split('\t')
      
      // Log first few lines to debug parsing
      if (index < 3) {
        console.log(`[TWL Adapter] Parsing line ${index + 1}:`, {
          partsCount: parts.length,
          parts: parts,
          reference: parts[0],
          id: parts[1],
          twLink: parts[5],
        })
      }
      
      const [reference, id, tags, origWords, occurrence, twLink] = parts
      
      // Warn if twLink is missing or empty (should be in 6th column)
      if (!twLink || !twLink.trim()) {
        console.warn(`[TWL Adapter] ⚠️ Missing or empty twLink in line ${index + 1}:`, {
          reference,
          id,
          partsCount: parts.length,
          expectedColumns: 6,
          hasTwLink: !!twLink,
          twLinkValue: twLink,
        })
      }
      
      // Extract article path from TWLink (RC link) if available
      // rc://*/tw/dict/bible/kt/god -> bible/kt/god
      let articlePath = ''
      const twLinkValue = twLink?.trim()
      if (twLinkValue) {
        const articlePathMatch = twLinkValue.match(/rc:\/\/\*\/tw\/dict\/(.+)$/)
        articlePath = articlePathMatch ? articlePathMatch[1] : ''
      } else if (id && id.startsWith('rc://')) {
        // Fallback: if id is an RC link (older format)
        const articlePathMatch = id.match(/rc:\/\/\*\/tw\/dict\/(.+)$/)
        articlePath = articlePathMatch ? articlePathMatch[1] : ''
      }
      
      const link = {
        reference,
        id: id || `twl-${bookCode}-${index}`,
        tags,
        origWords,
        occurrence,
        twLink: twLinkValue || undefined, // Include twLink if present (trim whitespace)
        articlePath,
      }
      
      // Log first few parsed links
      if (index < 3) {
        console.log(`[TWL Adapter] Parsed link ${index + 1}:`, {
          reference: link.reference,
          id: link.id,
          twLink: link.twLink,
          articlePath: link.articlePath,
        })
      }
      
      return link
    })
    
    return {
      bookCode,
      bookName,
      links,
      linksByChapter: {},
      metadata: {
        bookCode,
        bookName,
        processingDate: new Date().toISOString(),
        totalLinks: links.length,
        chaptersWithLinks: [],
        statistics: {
          totalLinks: links.length,
          linksPerChapter: {},
          linksByCategory: {},
        },
      },
    }
  }
}
