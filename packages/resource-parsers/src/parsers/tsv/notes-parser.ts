/**
 * Translation Notes Processor Service
 * 
 * Processes TSV (Tab Separated Values) content from Door43 Translation Notes
 * into structured data for display in the application.
 * 
 * Based on the web app's door43-api.ts TSV parsing logic.
 */

// Import and re-export types
import type { ProcessedNotes, TranslationNote } from '../../types';
export type { ProcessedNotes, TranslationNote } from '../../types';

export class NotesProcessor {
  private readonly PROCESSING_VERSION = '1.0.0-bt-studio';

  /**
   * Process TSV content into structured notes data
   */
  async processNotes(
    tsvContent: string,
    bookCode: string,
    bookName: string
  ): Promise<ProcessedNotes> {
    const startTime = Date.now();
    
    
    
    // Parse all notes from TSV
    const notes = this.parseTSVNotesAllChapters(tsvContent);
    
    // Group notes by chapter
    const notesByChapter = this.groupNotesByChapter(notes);
    
    // Generate metadata
    const metadata = this.generateMetadata(bookCode, bookName, notes, notesByChapter);
    
    const processingTime = Date.now() - startTime;
    
    
    return {
      bookCode,
      bookName,
      notes,
      notesByChapter,
      metadata
    };
  }

  /**
   * Parse TSV content to extract translation notes for all chapters
   * Based on web app's parseTSVNotesAllChapters function
   */
  private parseTSVNotesAllChapters(tsvContent: string): TranslationNote[] {
    const notes: TranslationNote[] = [];
    const lines = tsvContent.split('\n');
    
    
    
    // Skip header line (first line)
    for (let i = 1; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;
      
      const columns = line.split('\t');
      if (columns.length < 6) continue; // Need at least 6 columns
      
      // TSV format: Reference, ID, Tags, SupportReference, Quote, Occurrence, Note
      const [reference, id, tags, supportReference, quote, occurrence, note] = columns;
      
      // Normalize reference (converts front:intro -> 1:1, 1:intro -> 1:1, etc.)
      const normalizedRef = this.normalizeReference(reference);
      if (!normalizedRef) continue;
      
      const { chapter, verse, normalized } = normalizedRef;
      
      notes.push({
        reference: normalized,
        id: id || `${chapter}-${verse}-${i}`,
        tags: tags || '',
        supportReference: supportReference || '',
        quote: quote || '',
        occurrence: occurrence || '1',
        note: note || ''
      });
    }
    
    
    return notes;
  }

  /**
   * Parse TSV content to extract translation notes for a specific chapter
   * Based on web app's parseTSVNotes function
   */
  parseTSVNotesForChapter(tsvContent: string, targetChapter: number): TranslationNote[] {
    const notes: TranslationNote[] = [];
    const lines = tsvContent.split('\n');
    
    // Skip header line
    for (let i = 1; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;
      
      const columns = line.split('\t');
      if (columns.length < 6) continue; // Need at least 6 columns
      
      // TSV format: Reference, ID, Tags, SupportReference, Quote, Occurrence, Note
      const [reference, id, tags, supportReference, quote, occurrence, note] = columns;
      
      // Normalize reference (converts front:intro -> 1:1, 1:intro -> 1:1, etc.)
      const normalizedRef = this.normalizeReference(reference);
      if (!normalizedRef) continue;
      
      const { chapter, verse, normalized } = normalizedRef;
      
      // Filter by target chapter
      if (chapter !== targetChapter) continue;
      
      notes.push({
        reference: normalized,
        id: id || `${chapter}-${verse}-${i}`,
        tags: tags || '',
        supportReference: supportReference || '',
        quote: quote || '',
        occurrence: occurrence || '1',
        note: note || ''
      });
    }
    
    return notes;
  }

  /**
   * Normalize reference format
   * Based on web app's normalizeReference function
   */
  private normalizeReference(reference: string): { chapter: number; verse: number; normalized: string } | null {
    if (!reference || !reference.includes(':')) return null;
    
    const [chapterStr, verseStr] = reference.split(':');
    
    let chapter: number;
    let verse: number;
    
    // Handle front matter
    if (chapterStr === 'front') {
      chapter = 1;
      // front:intro -> 1:1, front:1 -> 1:1, etc.
      verse = verseStr === 'intro' ? 1 : (parseInt(verseStr) || 1);
    } else {
      // Handle regular chapter references
      chapter = parseInt(chapterStr);
      if (isNaN(chapter)) return null;
      
      // Handle intro verses: 1:intro -> 1:1, 2:intro -> 2:1
      if (verseStr === 'intro') {
        verse = 1;
      } else {
        verse = parseInt(verseStr);
        if (isNaN(verse)) return null;
      }
    }
    
    return {
      chapter,
      verse,
      normalized: `${chapter}:${verse}`
    };
  }

  /**
   * Group notes by chapter for efficient lookup
   */
  private groupNotesByChapter(notes: TranslationNote[]): Record<string, TranslationNote[]> {
    const notesByChapter: Record<string, TranslationNote[]> = {};
    
    for (const note of notes) {
      const [chapterStr] = note.reference.split(':');
      const chapter = chapterStr;
      
      if (!notesByChapter[chapter]) {
        notesByChapter[chapter] = [];
      }
      
      notesByChapter[chapter].push(note);
    }
    
    return notesByChapter;
  }

  /**
   * Generate metadata for the processed notes
   */
  private generateMetadata(
    bookCode: string,
    bookName: string,
    notes: TranslationNote[],
    notesByChapter: Record<string, TranslationNote[]>
  ): ProcessedNotes['metadata'] {
    const chaptersWithNotes = Object.keys(notesByChapter)
      .map(ch => parseInt(ch))
      .filter(ch => !isNaN(ch))
      .sort((a, b) => a - b);
    
    const notesPerChapter: Record<string, number> = {};
    for (const [chapter, chapterNotes] of Object.entries(notesByChapter)) {
      notesPerChapter[chapter] = chapterNotes.length;
    }
    
    return {
      bookCode,
      bookName,
      processingDate: new Date().toISOString(),
      totalNotes: notes.length,
      chaptersWithNotes,
      statistics: {
        totalNotes: notes.length,
        notesPerChapter
      }
    };
  }

  /**
   * Filter notes by chapter and verse range
   */
  filterNotesByRange(
    notes: TranslationNote[],
    startChapter: number,
    startVerse: number,
    endChapter?: number,
    endVerse?: number
  ): TranslationNote[] {
    return notes.filter(note => {
      const [chapterStr, verseStr] = note.reference.split(':');
      const noteChapter = parseInt(chapterStr);
      const noteVerse = parseInt(verseStr);
      
      // Check if note is within the range
      if (noteChapter < startChapter) return false;
      if (endChapter && noteChapter > endChapter) return false;
      
      if (noteChapter === startChapter && noteVerse < startVerse) return false;
      if (endChapter && noteChapter === endChapter && endVerse && noteVerse > endVerse) return false;
      
      return true;
    });
  }

  /**
   * Get notes for a specific chapter
   */
  getNotesForChapter(notesByChapter: Record<string, TranslationNote[]>, chapter: number): TranslationNote[] {
    return notesByChapter[chapter.toString()] || [];
  }

  /**
   * Get notes for a specific verse
   */
  getNotesForVerse(notes: TranslationNote[], chapter: number, verse: number): TranslationNote[] {
    const targetRef = `${chapter}:${verse}`;
    return notes.filter(note => note.reference === targetRef);
  }
}

// Export singleton instance
export const notesProcessor = new NotesProcessor();
