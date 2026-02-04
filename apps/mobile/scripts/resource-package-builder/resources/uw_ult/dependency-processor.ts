/**
 * UW_ULT Dependency Processor
 * 
 * Enhances ULT scripture with dependency data (cross-references, etc.)
 */

import { ProcessedBook, RawProcessedScripture } from './raw-processor';

export interface DependencyData {
  // ULT typically doesn't have dependencies, but could be enhanced with:
  crossReferences?: {
    [bookChapterVerse: string]: {
      references: string[];
      relatedVerses: string[];
    };
  };
  translationNotes?: {
    [bookChapterVerse: string]: {
      notes: string[];
      supportReferences: string[];
    };
  };
}

export interface EnhancedScripture extends RawProcessedScripture {
  enhancements: {
    crossReferencesAdded: number;
    translationNotesLinked: number;
    supportReferencesAdded: number;
  };
}

export class UW_ULT_DependencyProcessor {
  private version = '2.0.0';

  /**
   * Process scripture with dependencies
   */
  async processWithDependencies(
    rawScripture: RawProcessedScripture,
    dependencyData: DependencyData
  ): Promise<EnhancedScripture> {
    const startTime = Date.now();
    
    // Enhance each book with dependency data
    const enhancedBooks = rawScripture.books.map(book => 
      this.enhanceBook(book, dependencyData)
    );

    // Calculate enhancement statistics
    const enhancements = this.calculateEnhancements(enhancedBooks, dependencyData);

    return {
      ...rawScripture,
      books: enhancedBooks,
      enhancements,
      statistics: {
        ...rawScripture.statistics,
        processingTime: Date.now() - startTime
      }
    };
  }

  /**
   * Enhance individual book with dependency data
   */
  private enhanceBook(book: ProcessedBook, dependencyData: DependencyData): ProcessedBook {
    const enhancedBook = { ...book };

    // Add cross-references to each verse
    enhancedBook.chapters = book.chapters.map(chapter => ({
      ...chapter,
      verses: chapter.verses.map(verse => {
        const verseKey = `${book.bookCode}:${chapter.chapterNumber}:${verse.verseNumber}`;
        
        return {
          ...verse,
          crossReferences: this.getCrossReferences(verseKey, dependencyData.crossReferences),
          translationNotes: this.getTranslationNotes(verseKey, dependencyData.translationNotes)
        };
      })
    }));

    return enhancedBook;
  }

  /**
   * Get cross-references for a verse
   */
  private getCrossReferences(
    verseKey: string, 
    crossReferences?: DependencyData['crossReferences']
  ): string[] {
    if (!crossReferences || !crossReferences[verseKey]) {
      return [];
    }
    return crossReferences[verseKey].references || [];
  }

  /**
   * Get translation notes for a verse
   */
  private getTranslationNotes(
    verseKey: string,
    translationNotes?: DependencyData['translationNotes']
  ): string[] {
    if (!translationNotes || !translationNotes[verseKey]) {
      return [];
    }
    return translationNotes[verseKey].notes || [];
  }

  /**
   * Calculate enhancement statistics
   */
  private calculateEnhancements(
    books: ProcessedBook[], 
    dependencyData: DependencyData
  ): EnhancedScripture['enhancements'] {
    let crossReferencesAdded = 0;
    let translationNotesLinked = 0;
    let supportReferencesAdded = 0;

    books.forEach(book => {
      book.chapters.forEach(chapter => {
        chapter.verses.forEach(verse => {
          if ((verse as any).crossReferences) {
            crossReferencesAdded += (verse as any).crossReferences.length;
          }
          if ((verse as any).translationNotes) {
            translationNotesLinked += (verse as any).translationNotes.length;
          }
        });
      });
    });

    return {
      crossReferencesAdded,
      translationNotesLinked,
      supportReferencesAdded
    };
  }

  /**
   * Get processor information
   */
  getProcessorInfo() {
    return {
      name: 'UW_ULT_DependencyProcessor',
      version: this.version,
      description: 'Enhances ULT scripture with cross-references and notes',
      dependencies: ['crossReferences', 'translationNotes'],
      supportedEnhancements: [
        'cross_references',
        'translation_notes'
      ]
    };
  }
}
