/**
 * UW_ULT Raw Processor
 * 
 * Processes raw USFM files without dependencies
 */

export interface RawProcessedScripture {
  type: 'scripture';
  format: 'usfm';
  version: string;
  language: string;
  books: ProcessedBook[];
  statistics: {
    totalBooks: number;
    totalChapters: number;
    totalVerses: number;
    processingTime: number;
  };
  metadata: {
    resourceId: string;
    language: string;
    version: string;
    lastUpdated: string;
  };
}

export interface ProcessedBook {
  bookCode: string;
  bookName: string;
  chapters: ProcessedChapter[];
  metadata: {
    bookCode: string;
    bookName: string;
    totalChapters: number;
    totalVerses: number;
  };
}

export interface ProcessedChapter {
  chapterNumber: number;
  verses: ProcessedVerse[];
  metadata: {
    chapterNumber: number;
    totalVerses: number;
  };
}

export interface ProcessedVerse {
  verseNumber: number;
  text: string;
  metadata: {
    verseNumber: number;
    textLength: number;
  };
}

export class UW_ULT_RawProcessor {
  private version = '2.0.0';

  /**
   * Process raw USFM content
   */
  async processRawContent(
    files: Map<string, string>,
    metadata: {
      resourceId: string;
      language: string;
      version: string;
    }
  ): Promise<RawProcessedScripture> {
    const startTime = Date.now();
    
    const books: ProcessedBook[] = [];
    let totalChapters = 0;
    let totalVerses = 0;

    // Process each USFM file
    for (const [filePath, content] of files) {
      const book = this.processUSFMFile(filePath, content);
      if (book) {
        books.push(book);
        totalChapters += book.chapters.length;
        totalVerses += book.chapters.reduce((sum, ch) => sum + ch.verses.length, 0);
      }
    }

    const processingTime = Date.now() - startTime;

    return {
      type: 'scripture',
      format: 'usfm',
      version: this.version,
      language: metadata.language,
      books,
      statistics: {
        totalBooks: books.length,
        totalChapters,
        totalVerses,
        processingTime
      },
      metadata: {
        resourceId: metadata.resourceId,
        language: metadata.language,
        version: metadata.version,
        lastUpdated: new Date().toISOString()
      }
    };
  }

  /**
   * Process individual USFM file
   */
  private processUSFMFile(filePath: string, content: string): ProcessedBook | null {
    const lines = content.split('\n');
    const bookCode = this.extractBookCode(filePath);
    const bookName = this.extractBookName(lines);
    
    if (!bookCode) return null;

    const chapters: ProcessedChapter[] = [];
    let currentChapter: ProcessedChapter | null = null;
    let currentVerse: ProcessedVerse | null = null;

    for (const line of lines) {
      const trimmedLine = line.trim();
      
      // Chapter marker
      if (trimmedLine.startsWith('\\c ')) {
        // Save previous chapter
        if (currentChapter) {
          chapters.push(currentChapter);
        }
        
        const chapterNumber = parseInt(trimmedLine.substring(3).trim());
        currentChapter = {
          chapterNumber,
          verses: [],
          metadata: {
            chapterNumber,
            totalVerses: 0
          }
        };
        currentVerse = null;
      }
      
      // Verse marker
      else if (trimmedLine.startsWith('\\v ')) {
        if (!currentChapter) continue;
        
        // Save previous verse
        if (currentVerse) {
          currentChapter.verses.push(currentVerse);
        }
        
        const verseMatch = trimmedLine.match(/\\v (\d+)\s+(.*)/);
        if (verseMatch) {
          const verseNumber = parseInt(verseMatch[1]);
          const text = this.cleanVerseText(verseMatch[2]);
          
          currentVerse = {
            verseNumber,
            text,
            metadata: {
              verseNumber,
              textLength: text.length
            }
          };
        }
      }
      
      // Verse content continuation
      else if (currentVerse && trimmedLine && !trimmedLine.startsWith('\\')) {
        currentVerse.text += ' ' + this.cleanVerseText(trimmedLine);
        currentVerse.metadata.textLength = currentVerse.text.length;
      }
    }

    // Save last verse and chapter
    if (currentVerse && currentChapter) {
      currentChapter.verses.push(currentVerse);
    }
    if (currentChapter) {
      currentChapter.metadata.totalVerses = currentChapter.verses.length;
      chapters.push(currentChapter);
    }

    return {
      bookCode,
      bookName,
      chapters,
      metadata: {
        bookCode,
        bookName,
        totalChapters: chapters.length,
        totalVerses: chapters.reduce((sum, ch) => sum + ch.verses.length, 0)
      }
    };
  }

  /**
   * Extract book code from file path
   */
  private extractBookCode(filePath: string): string | null {
    const match = filePath.match(/([A-Z0-9]+)\.usfm$/i);
    return match ? match[1].toLowerCase() : null;
  }

  /**
   * Extract book name from USFM content
   */
  private extractBookName(lines: string[]): string {
    for (const line of lines) {
      if (line.startsWith('\\h ')) {
        return line.substring(3).trim();
      }
    }
    return 'Unknown Book';
  }

  /**
   * Clean verse text by removing USFM markers
   */
  private cleanVerseText(text: string): string {
    return text
      .replace(/\\[a-zA-Z]+\s*/g, '') // Remove USFM markers
      .replace(/\s+/g, ' ') // Normalize whitespace
      .trim();
  }

  /**
   * Get processor information
   */
  getProcessorInfo() {
    return {
      name: 'UW_ULT_RawProcessor',
      version: this.version,
      description: 'Processes raw USFM scripture files',
      supportedFormats: ['usfm'],
      dependencies: []
    };
  }
}
