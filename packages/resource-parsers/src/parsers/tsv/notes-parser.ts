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

/** Bump when TSV reference / row shape changes so loaders re-parse cached `tn:` blobs. */
export const NOTES_TSV_PARSER_VERSION = '2'

export function processedNotesParserIsCurrent(
  notes: { metadata?: { parserVersion?: string } } | null | undefined
): boolean {
  return notes?.metadata?.parserVersion === NOTES_TSV_PARSER_VERSION
}

export class NotesProcessor {
  private readonly PROCESSING_VERSION = NOTES_TSV_PARSER_VERSION;

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
   * Normalize reference format.
   * Keeps Door43 ranges (`5:2-3`) and comma lists (`5:1,3,8,12`).
   * Only collapses `front:*` / `*:intro` to a concrete first verse.
   */
  private normalizeReference(reference: string): { chapter: number; verse: number; normalized: string } | null {
    if (!reference || !reference.includes(':')) return null;

    const colon = reference.indexOf(':');
    const chapterStr = reference.slice(0, colon).trim();
    const verseStr = reference.slice(colon + 1).trim();

    if (chapterStr === 'front') {
      const verse = verseStr === 'intro' ? 1 : (parseInt(verseStr, 10) || 1);
      return { chapter: 1, verse, normalized: `1:${verse}` };
    }

    const chapter = parseInt(chapterStr, 10);
    if (isNaN(chapter) || chapter < 1) return null;

    if (!verseStr || verseStr === 'intro') {
      return { chapter, verse: 1, normalized: `${chapter}:1` };
    }

    const firstVerse = parseInt(verseStr, 10);
    if (isNaN(firstVerse) || firstVerse < 1) return null;

    return {
      chapter,
      verse: firstVerse,
      normalized: `${chapter}:${verseStr}`,
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
      parserVersion: NOTES_TSV_PARSER_VERSION,
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
