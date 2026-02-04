/**
 * Translation Words Links Processor
 * 
 * Extracted from Door43TranslationWordsLinksAdapter to match the exact processing logic
 * used in the real app.
 */

export interface TranslationWordsLink {
  reference: string;
  id: string;
  tags: string;
  origWords: string;
  occurrence: string;
  twLink: string;
}

export interface ProcessedWordsLinks {
  bookCode: string;
  bookName: string;
  links: TranslationWordsLink[];
  linksByChapter: Record<string, TranslationWordsLink[]>;
  metadata: {
    bookCode: string;
    bookName: string;
    processingDate: string;
    totalLinks: number;
    chaptersWithLinks: number[];
    statistics: {
      totalLinks: number;
      linksPerChapter: Record<string, number>;
      linksByCategory: Record<string, number>;
    };
  };
}

export class TranslationWordsLinksProcessor {
  /**
   * Process TSV content into structured word links data
   * This is the exact same logic from Door43TranslationWordsLinksAdapter.processTSVContent
   */
  async processWordsLinks(tsvContent: string, bookCode: string, bookName: string): Promise<ProcessedWordsLinks> {
    console.log(`📋 Processing TSV content for ${bookCode}...`);
    
    const lines = tsvContent.split('\n').filter(line => line.trim());
    
    if (lines.length === 0) {
      throw new Error('Empty TSV content');
    }

    // Parse header row
    const headerLine = lines[0];
    const headers = headerLine.split('\t').map(h => h.trim());
    
    // Validate expected headers
    const expectedHeaders = ['Reference', 'ID', 'Tags', 'OrigWords', 'Occurrence', 'TWLink'];
    const missingHeaders = expectedHeaders.filter(h => !headers.includes(h));
    if (missingHeaders.length > 0) {
      console.warn(`Missing expected headers: ${missingHeaders.join(', ')}`);
    }

    // Parse data rows
    const links: TranslationWordsLink[] = [];
    const linksByChapter: Record<string, TranslationWordsLink[]> = {};
    const linksByCategory: Record<string, number> = {};

    for (let i = 1; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;

      const columns = line.split('\t');
      if (columns.length < expectedHeaders.length) {
        console.warn(`Skipping malformed line ${i + 1}: insufficient columns`);
        continue;
      }

      const link: TranslationWordsLink = {
        reference: columns[headers.indexOf('Reference')] || '',
        id: columns[headers.indexOf('ID')] || '',
        tags: columns[headers.indexOf('Tags')] || '',
        origWords: columns[headers.indexOf('OrigWords')] || '',
        occurrence: columns[headers.indexOf('Occurrence')] || '1',
        twLink: columns[headers.indexOf('TWLink')] || ''
      };

      links.push(link);

      // Group by chapter
      const chapterMatch = link.reference.match(/^(\d+):/);
      if (chapterMatch) {
        const chapter = chapterMatch[1];
        if (!linksByChapter[chapter]) {
          linksByChapter[chapter] = [];
        }
        linksByChapter[chapter].push(link);
      }

      // Count by category
      if (link.tags) {
        linksByCategory[link.tags] = (linksByCategory[link.tags] || 0) + 1;
      }
    }

    const chaptersWithLinks = Object.keys(linksByChapter).map(Number).sort((a, b) => a - b);
    const linksPerChapter: Record<string, number> = {};
    Object.keys(linksByChapter).forEach(chapter => {
      linksPerChapter[chapter] = linksByChapter[chapter].length;
    });

    const processedLinks: ProcessedWordsLinks = {
      bookCode,
      bookName,
      links,
      linksByChapter,
      metadata: {
        bookCode,
        bookName,
        processingDate: new Date().toISOString(),
        totalLinks: links.length,
        chaptersWithLinks,
        statistics: {
          totalLinks: links.length,
          linksPerChapter,
          linksByCategory
        }
      }
    };

    console.log(`✅ TSV processing complete: ${links.length} word links`);
    return processedLinks;
  }
}

export const twlProcessor = new TranslationWordsLinksProcessor();
