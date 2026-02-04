/**
 * Translation Questions Processor Service
 * 
 * Processes TSV (Tab Separated Values) content from Door43 Translation Questions
 * into structured data for display in the application.
 * 
 * Based on the Translation Notes processor but adapted for question-answer format.
 */

// Import and re-export types from processed-content for backward compatibility
import type { ProcessedQuestions, TranslationQuestion } from '../types/processed-content';
export type { ProcessedQuestions, TranslationQuestion } from '../types/processed-content';

export class QuestionsProcessor {
  private readonly PROCESSING_VERSION = '1.0.0-bt-studio';

  /**
   * Process TSV content into structured questions data
   */
  async processQuestions(
    tsvContent: string,
    bookCode: string,
    bookName: string
  ): Promise<ProcessedQuestions> {
    const startTime = Date.now();
    
    
    
    try {
      // Parse TSV content
      const questions = this.parseTsvContent(tsvContent);
      
      
      // Group questions by chapter
      const questionsByChapter = this.groupQuestionsByChapter(questions);
      const chaptersWithQuestions = Object.keys(questionsByChapter)
        .map(ch => parseInt(ch))
        .filter(ch => !isNaN(ch))
        .sort((a, b) => a - b);
      
      // Generate statistics
      const questionsPerChapter: Record<string, number> = {};
      Object.entries(questionsByChapter).forEach(([chapter, chapterQuestions]) => {
        questionsPerChapter[chapter] = chapterQuestions.length;
      });
      
      const processedQuestions: ProcessedQuestions = {
        bookCode,
        bookName,
        questions,
        questionsByChapter,
        metadata: {
          bookCode,
          bookName,
          processingDate: new Date().toISOString(),
          totalQuestions: questions.length,
          chaptersWithQuestions,
          statistics: {
            totalQuestions: questions.length,
            questionsPerChapter
          }
        }
      };
      
      const processingTime = Date.now() - startTime;
      
      
      
      return processedQuestions;
      
    } catch (error) {
      console.error(`❌ Error processing questions for ${bookCode}:`, error);
      throw new Error(`Failed to process Translation Questions: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Parse TSV content into TranslationQuestion objects
   */
  private parseTsvContent(tsvContent: string): TranslationQuestion[] {
    const lines = tsvContent.split('\n').filter(line => line.trim());
    
    if (lines.length === 0) {
      console.warn('⚠️ Empty TSV content');
      return [];
    }
    
    // Parse header to determine column indices
    const header = lines[0].split('\t');
    const columnIndices = this.getColumnIndices(header);
    
    
    
    
    const questions: TranslationQuestion[] = [];
    
    // Process data rows (skip header)
    for (let i = 1; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;
      
      try {
        const question = this.parseQuestionRow(line, columnIndices);
        if (question) {
          questions.push(question);
        }
      } catch (error) {
        console.warn(`⚠️ Failed to parse question row ${i + 1}:`, error);
        // Continue processing other rows
      }
    }
    
    return questions;
  }

  /**
   * Determine column indices from header row
   */
  private getColumnIndices(header: string[]): Record<string, number> {
    const indices: Record<string, number> = {};
    
    header.forEach((column, index) => {
      const normalizedColumn = column.toLowerCase().trim();
      
      // Map column names to standard keys
      switch (normalizedColumn) {
        case 'reference':
          indices.reference = index;
          break;
        case 'id':
          indices.id = index;
          break;
        case 'tags':
          indices.tags = index;
          break;
        case 'quote':
          indices.quote = index;
          break;
        case 'occurrence':
          indices.occurrence = index;
          break;
        case 'question':
          indices.question = index;
          break;
        case 'response':
          indices.response = index;
          break;
        default:
          
      }
    });
    
    // Validate required columns
    const requiredColumns = ['reference', 'id', 'question', 'response'];
    const missingColumns = requiredColumns.filter(col => indices[col] === undefined);
    
    if (missingColumns.length > 0) {
      throw new Error(`Missing required columns: ${missingColumns.join(', ')}`);
    }
    
    return indices;
  }

  /**
   * Parse a single TSV row into a TranslationQuestion
   */
  private parseQuestionRow(line: string, columnIndices: Record<string, number>): TranslationQuestion | null {
    const columns = line.split('\t');
    
    // Extract required fields
    const reference = this.getColumnValue(columns, columnIndices.reference);
    const id = this.getColumnValue(columns, columnIndices.id);
    const question = this.getColumnValue(columns, columnIndices.question);
    const response = this.getColumnValue(columns, columnIndices.response);
    
    // Skip rows without essential data
    if (!reference || !id || !question || !response) {
      console.warn(`⚠️ Skipping row with missing essential data:`, { reference, id, question: !!question, response: !!response });
      return null;
    }
    
    // Extract optional fields
    const tags = this.getColumnValue(columns, columnIndices.tags) || '';
    const quote = this.getColumnValue(columns, columnIndices.quote) || '';
    const occurrence = this.getColumnValue(columns, columnIndices.occurrence) || '';
    
    return {
      reference: reference.trim(),
      id: id.trim(),
      tags: tags.trim(),
      quote: quote.trim(),
      occurrence: occurrence.trim(),
      question: question.trim(),
      response: response.trim()
    };
  }

  /**
   * Safely get column value by index
   */
  private getColumnValue(columns: string[], index: number | undefined): string {
    if (index === undefined || index >= columns.length) {
      return '';
    }
    return columns[index] || '';
  }

  /**
   * Group questions by chapter number
   */
  private groupQuestionsByChapter(questions: TranslationQuestion[]): Record<string, TranslationQuestion[]> {
    const questionsByChapter: Record<string, TranslationQuestion[]> = {};
    
    questions.forEach(question => {
      const chapter = this.extractChapterFromReference(question.reference);
      
      if (!questionsByChapter[chapter]) {
        questionsByChapter[chapter] = [];
      }
      
      questionsByChapter[chapter].push(question);
    });
    
    return questionsByChapter;
  }

  /**
   * Extract chapter number from reference string
   */
  private extractChapterFromReference(reference: string): string {
    // Handle various reference formats:
    // "1:1" -> "1"
    // "1:1-5" -> "1" 
    // "1" -> "1"
    // "front:intro" -> "front"
    
    const colonIndex = reference.indexOf(':');
    if (colonIndex !== -1) {
      return reference.substring(0, colonIndex);
    }
    
    // If no colon, assume it's just a chapter number
    return reference;
  }

  /**
   * Filter questions by chapter and verse range
   */
  filterQuestionsByRange(
    questions: TranslationQuestion[],
    startChapter: number,
    startVerse: number,
    endChapter: number,
    endVerse: number
  ): TranslationQuestion[] {
    return questions.filter(question => {
      const { chapter, verse } = this.parseReference(question.reference);
      
      // Handle special cases like "front:intro"
      if (isNaN(chapter) || isNaN(verse)) {
        return false;
      }
      
      // Check if question falls within the range
      if (chapter < startChapter || chapter > endChapter) {
        return false;
      }
      
      if (chapter === startChapter && verse < startVerse) {
        return false;
      }
      
      if (chapter === endChapter && verse > endVerse) {
        return false;
      }
      
      return true;
    });
  }

  /**
   * Parse reference string into chapter and verse numbers
   */
  private parseReference(reference: string): { chapter: number; verse: number } {
    // Handle formats like "1:1", "1:1-5", "front:intro"
    const parts = reference.split(':');
    
    if (parts.length !== 2) {
      return { chapter: NaN, verse: NaN };
    }
    
    const chapter = parseInt(parts[0]);
    const versePart = parts[1];
    
    // Handle verse ranges like "1-5" - take the first verse
    const dashIndex = versePart.indexOf('-');
    const verse = dashIndex !== -1 
      ? parseInt(versePart.substring(0, dashIndex))
      : parseInt(versePart);
    
    return { chapter, verse };
  }
}

// Export singleton instance
export const questionsProcessor = new QuestionsProcessor();
