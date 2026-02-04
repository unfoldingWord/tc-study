/**
 * Mock ULT Adapter for Testing
 * 
 * Provides sample scripture data to test ResourceManager integration
 * without depending on external APIs.
 */

import {
    BookInfo,
    BookOrganizedAdapter,
    ProcessedChapter,
    ProcessedParagraph,
    ProcessedScripture,
    ProcessedVerse,
    ResourceMetadata,
    ResourceType,
    TableOfContents
} from '../../types/context';

export class MockULTAdapter implements BookOrganizedAdapter {
  resourceType = ResourceType.SCRIPTURE as const;
  organizationType = 'book' as const;
  serverId = 'mock.door43.org';
  resourceId = 'mock-ult';

  async getResourceMetadata(server: string, owner: string, language: string): Promise<ResourceMetadata> {
    
    
    // Simulate network delay
    await new Promise(resolve => setTimeout(resolve, 500));
    
    const books: BookInfo[] = [
      { code: 'gen', name: 'Genesis', chapters: 50 },
      { code: 'exo', name: 'Exodus', chapters: 40 },
      { code: 'mat', name: 'Matthew', chapters: 28 },
      { code: 'jhn', name: 'John', chapters: 21 }
    ];
    
    const toc: TableOfContents = { books };
    
    return {
      id: this.resourceId,
      server,
      owner,
      language,
      type: this.resourceType,
      title: 'Mock Unfoldingword Literal Text',
      description: 'A mock literal translation for testing purposes',
      name: 'mock-ult',
      version: '1.0.0',
      lastUpdated: new Date(),
      available: true,
      toc,
      isAnchor: true
    };
  }

  async getBookContent(server: string, owner: string, language: string, bookCode: string): Promise<ProcessedScripture> {
    
    
    // Simulate network delay
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    // Generate mock content based on book
    const bookName = this.getBookName(bookCode);
    const chapters = this.generateMockChapters(bookCode);
    
    const processedScripture: ProcessedScripture = {
      book: bookName,
      bookCode,
      metadata: {
        bookCode,
        bookName,
        processingDate: new Date().toISOString(),
        processingDuration: 100,
        version: '1.0.0',
        hasAlignments: false,
        hasSections: true,
        totalChapters: chapters.length,
        totalVerses: chapters.reduce((sum, ch) => sum + ch.verseCount, 0),
        totalParagraphs: chapters.reduce((sum, ch) => sum + ch.paragraphCount, 0),
        statistics: {
          totalChapters: chapters.length,
          totalVerses: chapters.reduce((sum, ch) => sum + ch.verseCount, 0),
          totalParagraphs: chapters.reduce((sum, ch) => sum + ch.paragraphCount, 0),
          totalSections: 0,
          totalAlignments: 0
        }
      },
      chapters
    };
    
    return processedScripture;
  }

  async getAvailableBooks(server: string, owner: string, language: string): Promise<BookInfo[]> {
    return [
      { code: 'gen', name: 'Genesis', chapters: 50 },
      { code: 'exo', name: 'Exodus', chapters: 40 },
      { code: 'mat', name: 'Matthew', chapters: 28 },
      { code: 'jhn', name: 'John', chapters: 21 }
    ];
  }

  async isBookAvailable(server: string, owner: string, language: string, bookCode: string): Promise<boolean> {
    const availableBooks = ['gen', 'exo', 'mat', 'jhn'];
    return availableBooks.includes(bookCode);
  }

  async isResourceAvailable(server: string, owner: string, language: string): Promise<boolean> {
    return true; // Mock is always available
  }

  getResourceInfo() {
    return {
      name: 'Mock ULT Adapter',
      description: 'Mock Unfoldingword Literal Text for testing',
      supportedServers: ['mock.door43.org'],
      fallbackOptions: [],
      processingCapabilities: ['mock', 'testing']
    };
  }

  configure(config: any): void {
    // Mock adapter doesn't need configuration
  }

  // Helper methods
  private getBookName(bookCode: string): string {
    const bookNames: Record<string, string> = {
      'gen': 'Genesis',
      'exo': 'Exodus',
      'mat': 'Matthew',
      'jhn': 'John'
    };
    return bookNames[bookCode] || bookCode.toUpperCase();
  }

  private generateMockChapters(bookCode: string): ProcessedChapter[] {
    const chapterCount = bookCode === 'gen' ? 3 : 2; // Generate fewer chapters for testing
    const chapters: ProcessedChapter[] = [];
    
    for (let chapterNum = 1; chapterNum <= chapterCount; chapterNum++) {
      const verses = this.generateMockVerses(bookCode, chapterNum);
      const paragraphs = this.generateMockParagraphs(verses);
      
      chapters.push({
        number: chapterNum,
        verseCount: verses.length,
        paragraphCount: paragraphs.length,
        verses,
        paragraphs
      });
    }
    
    return chapters;
  }

  private generateMockVerses(bookCode: string, chapterNum: number): ProcessedVerse[] {
    const verseCount = chapterNum === 1 ? 5 : 3; // Fewer verses for testing
    const verses: ProcessedVerse[] = [];
    
    for (let verseNum = 1; verseNum <= verseCount; verseNum++) {
      const text = this.generateMockVerseText(bookCode, chapterNum, verseNum);
      
      verses.push({
        number: verseNum,
        text,
        reference: `${bookCode.toUpperCase()} ${chapterNum}:${verseNum}`,
        paragraphId: `p${Math.ceil(verseNum / 2)}`, // Group verses into paragraphs
        hasSectionMarker: verseNum === 1,
        sectionMarkers: verseNum === 1 ? 1 : 0
      });
    }
    
    return verses;
  }

  private generateMockParagraphs(verses: ProcessedVerse[]): ProcessedParagraph[] {
    const paragraphs: ProcessedParagraph[] = [];
    let currentParagraph: ProcessedVerse[] = [];
    let paragraphId = 1;
    
    for (const verse of verses) {
      currentParagraph.push(verse);
      
      // Create a new paragraph every 2 verses or at the end
      if (currentParagraph.length === 2 || verse === verses[verses.length - 1]) {
        const startVerse = currentParagraph[0].number;
        const endVerse = currentParagraph[currentParagraph.length - 1].number;
        
        paragraphs.push({
          id: `p${paragraphId}`,
          type: 'paragraph',
          style: 'p',
          indentLevel: 0,
          startVerse,
          endVerse,
          verseCount: currentParagraph.length,
          verseNumbers: currentParagraph.map(v => v.number),
          combinedText: currentParagraph.map(v => v.text).join(' '),
          verses: [...currentParagraph]
        });
        
        currentParagraph = [];
        paragraphId++;
      }
    }
    
    return paragraphs;
  }

  private generateMockVerseText(bookCode: string, chapterNum: number, verseNum: number): string {
    const mockTexts: Record<string, Record<number, Record<number, string>>> = {
      'gen': {
        1: {
          1: 'In the beginning, God created the heavens and the earth.',
          2: 'The earth was without form and void, and darkness was over the face of the deep.',
          3: 'And God said, "Let there be light," and there was light.',
          4: 'And God saw that the light was good. And God separated the light from the darkness.',
          5: 'God called the light Day, and the darkness he called Night.'
        },
        2: {
          1: 'Thus the heavens and the earth were finished, and all the host of them.',
          2: 'And on the seventh day God finished his work that he had done.',
          3: 'So God blessed the seventh day and made it holy.'
        }
      },
      'mat': {
        1: {
          1: 'The book of the genealogy of Jesus Christ, the son of David, the son of Abraham.',
          2: 'Abraham was the father of Isaac, and Isaac the father of Jacob.',
          3: 'And Jacob the father of Judah and his brothers.'
        }
      }
    };
    
    return mockTexts[bookCode]?.[chapterNum]?.[verseNum] || 
           `Mock verse text for ${bookCode.toUpperCase()} ${chapterNum}:${verseNum}`;
  }
}

// Export factory function
export const mockULTAdapter = new MockULTAdapter();
