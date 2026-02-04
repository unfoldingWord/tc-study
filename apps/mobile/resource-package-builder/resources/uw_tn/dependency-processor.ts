/**
 * UW_TN Dependency Processor
 * 
 * Enhances Translation Notes with dependency data (original quotes, link titles, etc.)
 */

import { RawProcessedNote, RawProcessedResource } from './raw-processor';

export interface DependencyData {
  originalScripture?: {
    [bookCode: string]: {
      content: string;
      verses: { [verse: string]: string };
    };
  };
  linkTitles?: {
    [refId: string]: {
      title: string;
      type: 'tw' | 'ta';
      url?: string;
    };
  };
  crossReferences?: {
    [refId: string]: {
      title: string;
      relatedRefs: string[];
    };
  };
}

export interface EnhancedNote extends RawProcessedNote {
  // Enhanced fields
  originalQuotes?: Array<{
    text: string;
    reference: string;
    verse: string;
    context: string;
    found: boolean;
  }>;
  enhancedSupportRefs?: Array<{
    reference: string;
    title: string;
    type: 'tw' | 'ta';
    enhanced: boolean;
  }>;
  crossReferences?: Array<{
    reference: string;
    title: string;
    relatedRefs: string[];
  }>;
}

export interface EnhancedResource extends Omit<RawProcessedResource, 'notes'> {
  notes: EnhancedNote[];
  enhancements: {
    originalQuotesFound: number;
    linkTitlesEnhanced: number;
    crossReferencesAdded: number;
  };
}

export class UW_TN_DependencyProcessor {
  private version = '2.0.0';

  /**
   * Process resource with dependencies
   */
  async processWithDependencies(
    rawResource: RawProcessedResource,
    dependencyData: DependencyData
  ): Promise<EnhancedResource> {
    const startTime = Date.now();
    
    // Enhance each note with dependency data
    const enhancedNotes = rawResource.notes.map(note => 
      this.enhanceNote(note, dependencyData)
    );

    // Calculate enhancement statistics
    const enhancements = this.calculateEnhancements(enhancedNotes);

    return {
      ...rawResource,
      notes: enhancedNotes,
      enhancements,
      statistics: {
        ...rawResource.statistics,
        processingTime: Date.now() - startTime
      }
    };
  }

  /**
   * Enhance individual note with dependency data
   */
  private enhanceNote(note: RawProcessedNote, dependencyData: DependencyData): EnhancedNote {
    const enhancedNote: EnhancedNote = { ...note };

    // Enhance with original scripture quotes
    if (dependencyData.originalScripture) {
      enhancedNote.originalQuotes = this.enhanceOriginalQuotes(note, dependencyData.originalScripture);
    }

    // Enhance support references with link titles
    if (dependencyData.linkTitles) {
      enhancedNote.enhancedSupportRefs = this.enhanceSupportReferences(note, dependencyData.linkTitles);
    }

    // Add cross-references
    if (dependencyData.crossReferences) {
      enhancedNote.crossReferences = this.addCrossReferences(note, dependencyData.crossReferences);
    }

    return enhancedNote;
  }

  /**
   * Enhance original quotes from scripture
   */
  private enhanceOriginalQuotes(
    note: RawProcessedNote, 
    originalScripture: DependencyData['originalScripture']
  ): EnhancedNote['originalQuotes'] {
    if (!originalScripture || !note.quotes.length) return [];

    return note.quotes.map(quote => {
      // Try to find the quote in the original scripture
      const foundQuote = this.findQuoteInScripture(quote, originalScripture, note.bookCode);
      
      return {
        text: quote,
        reference: note.Reference,
        verse: `${note.chapter}:${note.verse}`,
        context: foundQuote?.context || quote,
        found: !!foundQuote
      };
    });
  }

  /**
   * Find quote in scripture content
   */
  private findQuoteInScripture(
    quote: string, 
    scripture: DependencyData['originalScripture'],
    bookCode: string
  ): { context: string } | null {
    if (!scripture || !scripture[bookCode]) return null;

    const bookContent = scripture[bookCode];
    const verseKey = `${bookCode}:1:1`; // Simplified - would need actual verse matching
    
    // Simple text matching (in reality, would need sophisticated algorithms)
    if (bookContent.content.includes(quote)) {
      return {
        context: bookContent.content.substring(
          Math.max(0, bookContent.content.indexOf(quote) - 50),
          bookContent.content.indexOf(quote) + quote.length + 50
        )
      };
    }

    return null;
  }

  /**
   * Enhance support references with link titles
   */
  private enhanceSupportReferences(
    note: RawProcessedNote,
    linkTitles: DependencyData['linkTitles']
  ): EnhancedNote['enhancedSupportRefs'] {
    if (!linkTitles || !note.supportRefs.length) return [];

    return note.supportRefs.map(ref => {
      const linkData = linkTitles[ref];
      
      return {
        reference: ref,
        title: linkData?.title || ref,
        type: linkData?.type || 'tw',
        enhanced: !!linkData
      };
    });
  }

  /**
   * Add cross-references
   */
  private addCrossReferences(
    note: RawProcessedNote,
    crossReferences: DependencyData['crossReferences']
  ): EnhancedNote['crossReferences'] {
    if (!crossReferences || !note.supportRefs.length) return [];

    return note.supportRefs
      .map(ref => crossReferences[ref])
      .filter(Boolean)
      .map(ref => ({
        reference: ref!.title,
        title: ref!.title,
        relatedRefs: ref!.relatedRefs
      }));
  }

  /**
   * Calculate enhancement statistics
   */
  private calculateEnhancements(notes: EnhancedNote[]): EnhancedResource['enhancements'] {
    let originalQuotesFound = 0;
    let linkTitlesEnhanced = 0;
    let crossReferencesAdded = 0;

    notes.forEach(note => {
      if (note.originalQuotes) {
        originalQuotesFound += note.originalQuotes.filter(q => q.found).length;
      }
      
      if (note.enhancedSupportRefs) {
        linkTitlesEnhanced += note.enhancedSupportRefs.filter(r => r.enhanced).length;
      }
      
      if (note.crossReferences) {
        crossReferencesAdded += note.crossReferences.length;
      }
    });

    return {
      originalQuotesFound,
      linkTitlesEnhanced,
      crossReferencesAdded
    };
  }

  /**
   * Get processor information
   */
  getProcessorInfo() {
    return {
      name: 'UW_TN_DependencyProcessor',
      version: this.version,
      description: 'Enhances Translation Notes with dependency data',
      dependencies: ['originalScripture', 'linkTitles', 'crossReferences'],
      supportedEnhancements: [
        'original_quotes',
        'link_titles', 
        'cross_references'
      ]
    };
  }
}
















