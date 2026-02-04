/**
 * UW_TN Raw Processor
 * 
 * Processes raw Translation Notes TSV files without dependencies
 */

export interface RawProcessedNote {
  // TSV Fields
  Reference: string;
  ID: string;
  Tags: string;
  SupportReference: string;
  Quote: string;
  Occurrence: string;
  Note: string;
  
  // Processed Fields
  bookCode: string;
  chapter: number;
  verse: number;
  noteId: string;
  tags: string[];
  supportRefs: string[];
  quotes: string[];
  
  // Metadata
  processedAt: string;
  processorVersion: string;
}

export interface RawProcessedResource {
  type: 'notes';
  format: 'tsv';
  version: string;
  language: string;
  book: string;
  notes: RawProcessedNote[];
  statistics: {
    totalNotes: number;
    totalQuotes: number;
    totalSupportRefs: number;
    processingTime: number;
  };
  metadata: {
    resourceId: string;
    bookCode: string;
    language: string;
    version: string;
    lastUpdated: string;
  };
}

export class UW_TN_RawProcessor {
  private version = '2.0.0';

  /**
   * Process raw TSV content
   */
  async processRawContent(
    content: string,
    metadata: {
      resourceId: string;
      bookCode: string;
      language: string;
      version: string;
    }
  ): Promise<RawProcessedResource> {
    const startTime = Date.now();
    
    // Parse TSV content
    const lines = content.split('\n').filter(line => line.trim());
    const headers = this.parseHeaders(lines[0]);
    const notes = this.parseNotes(lines.slice(1), headers);

    // Process each note
    const processedNotes = notes.map(note => this.processNote(note, metadata));

    const processingTime = Date.now() - startTime;

    return {
      type: 'notes',
      format: 'tsv',
      version: this.version,
      language: metadata.language,
      book: metadata.bookCode,
      notes: processedNotes,
      statistics: {
        totalNotes: processedNotes.length,
        totalQuotes: processedNotes.reduce((sum, note) => sum + note.quotes.length, 0),
        totalSupportRefs: processedNotes.reduce((sum, note) => sum + note.supportRefs.length, 0),
        processingTime
      },
      metadata: {
        resourceId: metadata.resourceId,
        bookCode: metadata.bookCode,
        language: metadata.language,
        version: metadata.version,
        lastUpdated: new Date().toISOString()
      }
    };
  }

  /**
   * Parse TSV headers
   */
  private parseHeaders(headerLine: string): string[] {
    return headerLine.split('\t').map(h => h.trim());
  }

  /**
   * Parse TSV notes
   */
  private parseNotes(lines: string[], headers: string[]): any[] {
    return lines.map(line => {
      const values = line.split('\t');
      const note: any = {};
      
      headers.forEach((header, index) => {
        note[header] = values[index] || '';
      });
      
      return note;
    });
  }

  /**
   * Process individual note
   */
  private processNote(note: any, metadata: any): RawProcessedNote {
    // Extract book, chapter, verse from Reference
    const { bookCode, chapter, verse } = this.parseReference(note.Reference || '');
    
    // Parse tags
    const tags = this.parseTags(note.Tags || '');
    
    // Parse support references
    const supportRefs = this.parseSupportReferences(note.SupportReference || '');
    
    // Parse quotes
    const quotes = this.parseQuotes(note.Quote || '');

    return {
      // Original TSV fields
      Reference: note.Reference || '',
      ID: note.ID || '',
      Tags: note.Tags || '',
      SupportReference: note.SupportReference || '',
      Quote: note.Quote || '',
      Occurrence: note.Occurrence || '',
      Note: note.Note || '',
      
      // Processed fields
      bookCode,
      chapter,
      verse,
      noteId: note.ID || `${bookCode}-${chapter}-${verse}`,
      tags,
      supportRefs,
      quotes,
      
      // Metadata
      processedAt: new Date().toISOString(),
      processorVersion: this.version
    };
  }

  /**
   * Parse reference (e.g., "1:1", "GEN 1:1")
   */
  private parseReference(reference: string): { bookCode: string; chapter: number; verse: number } {
    const match = reference.match(/([A-Z0-9]+)\s*(\d+):(\d+)/i);
    if (match) {
      return {
        bookCode: match[1].toLowerCase(),
        chapter: parseInt(match[2]),
        verse: parseInt(match[3])
      };
    }
    
    // Fallback for simple chapter:verse format
    const simpleMatch = reference.match(/(\d+):(\d+)/);
    if (simpleMatch) {
      return {
        bookCode: 'unknown',
        chapter: parseInt(simpleMatch[1]),
        verse: parseInt(simpleMatch[2])
      };
    }
    
    return { bookCode: 'unknown', chapter: 0, verse: 0 };
  }

  /**
   * Parse tags string
   */
  private parseTags(tagsString: string): string[] {
    if (!tagsString) return [];
    return tagsString.split(',').map(tag => tag.trim()).filter(tag => tag);
  }

  /**
   * Parse support references
   */
  private parseSupportReferences(supportRefString: string): string[] {
    if (!supportRefString) return [];
    
    // Look for [[reference]] patterns
    const refPattern = /\[\[([^\]]+)\]\]/g;
    const refs: string[] = [];
    let match;
    
    while ((match = refPattern.exec(supportRefString)) !== null) {
      refs.push(match[1]);
    }
    
    return refs;
  }

  /**
   * Parse quotes
   */
  private parseQuotes(quoteString: string): string[] {
    if (!quoteString) return [];
    
    // Look for \q1, \q2, etc. patterns
    const quotePattern = /\\q\d+\s+([^\\]+)/g;
    const quotes: string[] = [];
    let match;
    
    while ((match = quotePattern.exec(quoteString)) !== null) {
      quotes.push(match[1].trim());
    }
    
    return quotes;
  }

  /**
   * Get processor information
   */
  getProcessorInfo() {
    return {
      name: 'UW_TN_RawProcessor',
      version: this.version,
      description: 'Processes raw Translation Notes TSV files',
      supportedFormats: ['tsv'],
      dependencies: []
    };
  }
}
