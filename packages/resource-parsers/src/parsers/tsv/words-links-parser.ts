/**
 * Translation Words Links Processor Service
 * 
 * Processes TSV (Tab Separated Values) content from Door43 Translation Words Links
 * into structured data for display in the application.
 */

// Import and re-export types
import type { ProcessedWordsLinks, TranslationWordsLink } from '../../types';
export type { ProcessedWordsLinks, TranslationWordsLink } from '../../types';

export class WordsLinksProcessor {
  private readonly PROCESSING_VERSION = '1.0.0-bt-studio';

  /**
   * Process TSV content into structured words links data
   */
  async processWordsLinks(
    tsvContent: string,
    bookCode: string,
    bookName: string
  ): Promise<ProcessedWordsLinks> {
    const startTime = Date.now();
    
    // Parse all links from TSV
    const links = this.parseTSVLinksAllChapters(tsvContent);
    
    // Group links by chapter
    const linksByChapter = this.groupLinksByChapter(links);
    
    // Generate metadata
    const metadata = this.generateMetadata(bookCode, bookName, links, linksByChapter);
    
    const processingTime = Date.now() - startTime;
    
    return {
      bookCode,
      bookName,
      links,
      linksByChapter,
      metadata
    };
  }

  /**
   * Parse all links from TSV content
   */
  private parseTSVLinksAllChapters(tsvContent: string): TranslationWordsLink[] {
    const lines = tsvContent.split('\n');
    const links: TranslationWordsLink[] = [];
    
    // Skip header line
    for (let i = 1; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;
      
      const parts = line.split('\t');
      if (parts.length < 6) continue; // Need 6 columns: Reference, ID, Tags, OrigWords, Occurrence, TWLink
      
      // TSV format: Reference, ID, Tags, OrigWords, Occurrence, TWLink
      const [reference, id, tags, origWords, occurrence, twLink] = parts;
      
      // Extract article path from TWLink (RC link) if available
      // rc://*/tw/dict/bible/kt/god -> bible/kt/god
      let articlePath = '';
      if (twLink) {
        const articlePathMatch = twLink.match(/rc:\/\/\*\/tw\/dict\/(.+)$/);
        articlePath = articlePathMatch ? articlePathMatch[1] : '';
      } else if (id && id.startsWith('rc://')) {
        // Fallback: if id is an RC link (older format)
        const articlePathMatch = id.match(/rc:\/\/\*\/tw\/dict\/(.+)$/);
        articlePath = articlePathMatch ? articlePathMatch[1] : '';
      }
      
      const link = {
        reference,
        id,
        tags,
        origWords,
        occurrence,
        articlePath,
        twLink: twLink?.trim() || undefined // Include twLink if present (trim whitespace)
      }
      
      links.push(link);
    }
    
    return links;
  }

  /**
   * Group links by chapter
   */
  private groupLinksByChapter(links: TranslationWordsLink[]): Record<string, TranslationWordsLink[]> {
    const grouped: Record<string, TranslationWordsLink[]> = {};
    
    for (const link of links) {
      // Extract chapter from reference (e.g., "1:1" -> "1")
      const chapterMatch = link.reference.match(/^(\d+):/);
      if (!chapterMatch) continue;
      
      const chapter = chapterMatch[1];
      if (!grouped[chapter]) {
        grouped[chapter] = [];
      }
      grouped[chapter].push(link);
    }
    
    return grouped;
  }

  /**
   * Generate metadata
   */
  private generateMetadata(
    bookCode: string,
    bookName: string,
    links: TranslationWordsLink[],
    linksByChapter: Record<string, TranslationWordsLink[]>
  ) {
    // Calculate statistics
    const linksPerChapter: Record<string, number> = {};
    for (const [chapter, chapterLinks] of Object.entries(linksByChapter)) {
      linksPerChapter[chapter] = chapterLinks.length;
    }
    
    return {
      bookCode,
      bookName,
      processingDate: new Date().toISOString(),
      totalLinks: links.length,
      chaptersWithLinks: Object.keys(linksByChapter).map(c => parseInt(c, 10)),
      statistics: {
        totalLinks: links.length,
        linksPerChapter
      }
    };
  }
}

