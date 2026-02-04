/**
 * USFM Processor Service for Translation Studio Web
 * Integrates USFM processing with Door43 API data
 * Based on @bt-toolkit/usfm-processor
 */

import * as usfm from 'usfm-js';
import { generateSemanticId } from '../../utils/semantic-id-generator';
import { defaultSections } from './default-sections';

// USFM Types (simplified from @bt-toolkit/usfm-processor)
export interface USFMHeader {
  tag?: string;
  content?: string;
  type?: string;
  text?: string;
}

export interface USFMWordObject {
  text: string;
  tag: 'w';
  type: 'word';
  occurrence: string;
  occurrences: string;
}

export interface USFMTextObject {
  type: 'text';
  text: string;
}

export interface USFMAlignmentObject {
  tag: 'zaln';
  type: 'milestone';
  strong: string;
  lemma: string;
  morph: string;
  occurrence: string;
  occurrences: string;
  content: string;
  children: (USFMWordObject | USFMTextObject)[];
  endTag: string;
}

export interface USFMParagraphObject {
  tag: 'p' | 'q' | 'q1' | 'q2' | 'm' | 'mi' | 'pc' | 'pr' | 'cls';
  type: 'paragraph' | 'quote';
  nextChar?: string;
}

export type USFMVerseObject = USFMAlignmentObject | USFMTextObject | USFMWordObject | USFMParagraphObject;

export interface USFMVerse {
  verseObjects: USFMVerseObject[];
}

export interface USFMChapter {
  [verseNumber: string]: USFMVerse;
}

export interface USFMDocument {
  headers: USFMHeader[];
  chapters: { [chapterNumber: string]: USFMChapter };
}

// Processed Types
export interface ProcessedVerse {
  number: number;
  text: string;
  reference: string;
  paragraphId?: string;
  hasSectionMarker?: boolean;
  sectionMarkers?: number;
  alignments?: WordAlignment[];
  wordTokens?: WordToken[];      // Enhanced word-level data
  alignmentGroups?: AlignmentGroup[]; // Non-contiguous alignment groups
  // Verse span support
  isSpan?: boolean;
  spanStart?: number;
  spanEnd?: number;
  originalVerseString?: string; // e.g., "1-2", "3", "4-6"
}

export interface ProcessedParagraph {
  id: string;
  type: 'paragraph' | 'quote';
  style: 'p' | 'q' | 'q1' | 'q2' | 'm' | 'mi' | 'pc' | 'pr' | 'cls';
  indentLevel: number;
  startVerse: number;
  endVerse: number;
  verseCount: number;
  verseNumbers: number[];
  combinedText: string;
  verses: ProcessedVerse[];
}

export interface ProcessedChapter {
  number: number;
  verseCount: number;
  paragraphCount: number;
  verses: ProcessedVerse[];
  paragraphs: ProcessedParagraph[];
}

export interface TranslatorSection {
  start: {
    chapter: number;
    verse: number;
    reference: { chapter: string; verse: string };
  };
  end: {
    chapter: number;
    verse: number;
    reference: { chapter: string; verse: string };
  };
}

export interface WordAlignment {
  verseRef: string;
  sourceWords: string[];
  targetWords: string[];
  alignmentData: {
    strong: string;
    lemma: string;
    morph: string;
    occurrence: string;
    occurrences: string;
  }[];
}

// Enhanced word-level processing types
export interface WordToken {
  uniqueId: string;
  content: string;
  occurrence: number;
  totalOccurrences: number;
  verseRef: string;
  position: {
    start: number;
    end: number;
  };
  type: 'word' | 'text' | 'punctuation';
  isHighlightable: boolean;
  alignmentId?: string;
  alignmentGroupId?: string; // Reference to the alignment group this token belongs to
  // Direct alignment references - array of original language token IDs
  alignedOriginalWordIds?: string[];
  // Backward compatibility
  alignment?: {
    strong: string;
    lemma: string;
    morph: string;
    sourceContent: string;
    sourceWordId?: string;
    alignmentGroupId?: string;
  };
}

export interface AlignmentGroup {
  id: string;
  verseRef: string;
  sourceWords: string[];
  targetTokens: WordToken[];
  alignmentData: {
    strong: string;
    lemma: string;
    morph: string;
    occurrence: string;
    occurrences: string;
  }[];
  isContiguous: boolean;
}

// ============================================================================
// OPTIMIZED FORMAT INTERFACES
// ============================================================================

/**
 * Optimized token format for maximum efficiency
 * Used in the new optimized USFM processing pipeline
 */
export interface OptimizedToken {
  /** Numeric ID (semantic for original language, sequential for target language) */
  id: number;
  /** The actual text content */
  text: string;
  /** Token type for rendering logic */
  type: 'word' | 'punctuation' | 'number' | 'whitespace' | 'paragraph-marker';
  /** Array of semantic IDs this token aligns to (target language only) */
  align?: number[];
  /** Strong's number (original language only) */
  strong?: string;
  /** Lemma (original language only) */
  lemma?: string;
  /** Morphology (original language only) */
  morph?: string;
  /** Occurrence number within the verse (calculated by QuoteMatcher for alignment) */
  occurrence?: number;
  /** Paragraph segment information for intra-verse formatting */
  paragraphSegment?: {
    id: number;
    style: 'p' | 'q' | 'q1' | 'q2' | 'm' | 'mi' | 'pc' | 'pr' | 'cls';
    type: 'paragraph' | 'quote';
    indentLevel: number;
  };
  /** Paragraph marker properties (only for paragraph-marker tokens) */
  paragraphMarker?: {
    style: 'p' | 'q' | 'q1' | 'q2' | 'm' | 'mi' | 'pc' | 'pr' | 'cls';
    type: 'paragraph' | 'quote';
    indentLevel: number;
    /** Whether this marker starts a new paragraph or continues formatting within a verse */
    isNewParagraph: boolean;
  };
}

/**
 * Optimized verse format
 */
export interface OptimizedVerse {
  number: number;
  text: string;
  paragraphId?: number;
  tokens: OptimizedToken[];
  // Verse span support
  isSpan?: boolean;
  spanStart?: number;
  spanEnd?: number;
  originalVerseString?: string;
}

/**
 * Optimized paragraph format
 */
export interface OptimizedParagraph {
  id: number;
  type: 'paragraph' | 'quote';
  style: 'p' | 'q' | 'q1' | 'q2' | 'm' | 'mi' | 'pc' | 'pr' | 'cls';
  indentLevel: number;
  startVerse: number;
  endVerse: number;
  verseNumbers: number[];
}

/**
 * Optimized chapter format
 */
export interface OptimizedChapter {
  number: number;
  verseCount: number;
  paragraphCount: number;
  verses: OptimizedVerse[];
}

/**
 * Optimized scripture format
 */
export interface OptimizedScripture {
  meta: {
    book: string;
    bookCode: string;
    language?: string;
    type: 'untokenized' | 'original' | 'aligned';
    totalChapters: number;
    totalVerses: number;
    totalParagraphs: number;
    hasAlignments: boolean;
    processingDate: string;
    version: string;
  };
  chapters: OptimizedChapter[];
  translatorSections?: TranslatorSection[];
}

export interface ProcessedScripture {
  book: string;
  bookCode: string;
  metadata: {
    bookCode: string;
    bookName: string;
    processingDate: string;
    processingDuration: number;
    version: string;
    hasAlignments: boolean;
    hasSections: boolean;
    totalChapters: number;
    totalVerses: number;
    totalParagraphs: number;
    statistics: {
      totalChapters: number;
      totalVerses: number;
      totalParagraphs: number;
      totalSections: number;
      totalAlignments: number;
    };
  };
  chapters: ProcessedChapter[];
  translatorSections?: TranslatorSection[];
  alignments?: WordAlignment[];
}

export interface ProcessingResult {
  structuredText: ProcessedScripture;
  translatorSections: TranslatorSection[];
  alignments: WordAlignment[];
  metadata: ProcessedScripture['metadata'];
}

/**
 * USFM Processor Class
 */
export class USFMProcessor {
  private readonly PROCESSING_VERSION = '1.0.0-web';

  /**
   * Process USFM content into structured data
   */
  async processUSFM(
    usfmContent: string,
    bookCode: string,
    bookName: string
  ): Promise<ProcessingResult> {
    const startTime = Date.now();
    
    try {
      
      
      // Debug: Check raw USFM content for \ts\* markers
      const tsMarkerCount = (usfmContent.match(/\\ts\\\*/g) || []).length;
      
      
      if (tsMarkerCount > 0) {
        
        const tsMatches = usfmContent.match(/(.{0,50}\\ts\\\*.{0,50})/g);
      }
      
      // Step 1: Convert USFM to JSON
      const usfmJson: USFMDocument = usfm.toJSON(usfmContent);
      
      // Step 2: Extract structured text
      const structuredText = this.extractStructuredText(usfmJson, bookCode, bookName);
      
      // Step 3: Extract translator sections
      let translatorSections = this.extractTranslatorSections(usfmJson, bookCode);
      
      
      // Use default sections if none found in USFM
      if (translatorSections.length === 0) {
        
        try {
          const defaultSectionsList = defaultSections[bookCode as keyof typeof defaultSections] || [];
          
          if (defaultSectionsList.length > 0) {
            translatorSections = defaultSectionsList as any;
            
          }
        } catch (error) {
          console.warn(`⚠️ Failed to load default sections for ${bookCode}:`, error);
        }
      } else {
        
      }
      
      // Step 4: Extract alignments
      const alignments = this.extractWordAlignments(usfmJson, bookCode);
      
      // Step 5: Generate metadata
      const processingDuration = Date.now() - startTime;
      const metadata = this.generateMetadata(
        bookCode, 
        bookName, 
        structuredText, 
        translatorSections, 
        alignments, 
        processingDuration
      );

      
      
      
      
      
      

      return {
        structuredText,
        translatorSections,
        alignments,
        metadata
      };

    } catch (error) {
      console.error('❌ USFM processing failed:', error);
      throw new Error(`Failed to process USFM content: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Extract structured text with paragraph processing
   */
  private extractStructuredText(
    usfmJson: USFMDocument, 
    bookCode: string, 
    bookName: string
  ): ProcessedScripture {
    const chapters: ProcessedChapter[] = [];
    
    if (!usfmJson.chapters) {
      throw new Error('No chapters found in USFM JSON');
    }

    for (const [chapterNumStr, chapterData] of Object.entries(usfmJson.chapters)) {
      const chapterNum = parseInt(chapterNumStr);
      if (isNaN(chapterNum)) continue;

      const chapter = this.processChapter(chapterData, chapterNum, bookCode);
      if (chapter.verses.length > 0) {
        chapters.push(chapter);
      }
    }

    const totalVerses = chapters.reduce((sum, ch) => sum + ch.verseCount, 0);
    const totalParagraphs = chapters.reduce((sum, ch) => sum + ch.paragraphCount, 0);

    return {
      book: bookName,
      bookCode,
      metadata: {
        bookCode,
        bookName,
        processingDate: new Date().toISOString(),
        processingDuration: 0,
        version: this.PROCESSING_VERSION,
        hasAlignments: false,
        hasSections: false,
        totalChapters: chapters.length,
        totalVerses,
        totalParagraphs,
        statistics: {
          totalChapters: chapters.length,
          totalVerses,
          totalParagraphs,
          totalSections: 0,
          totalAlignments: 0
        }
      },
      chapters
    };
  }

  /**
   * Process a single chapter
   */
  private processChapter(
    chapterData: Record<string, USFMVerse>, 
    chapterNum: number, 
    bookCode: string
  ): ProcessedChapter {
    const verses: ProcessedVerse[] = [];
    const paragraphs: ProcessedParagraph[] = [];
    
    let currentParagraph: ProcessedParagraph | null = null;
    let paragraphCounter = 1;
    let nextParagraphStyle: string | null = null;

    // First pass: collect verses and identify paragraph breaks
    const verseEntries = Object.entries(chapterData)
      .filter(([verseNumStr]) => {
        const parsedVerse = this.parseVerseNumber(verseNumStr);
        return parsedVerse.number >= 1; // Skip non-numeric entries
      })
      .sort(([a], [b]) => {
        const aNum = this.parseVerseNumber(a).number;
        const bNum = this.parseVerseNumber(b).number;
        return aNum - bNum;
      });

    // Check for initial paragraph marker in "front" verse
    if (chapterData.front?.verseObjects) {
      const frontParagraphObj = chapterData.front.verseObjects.find((obj: any) => 
        this.isParagraphObject(obj)
      );
      if (frontParagraphObj) {
        nextParagraphStyle = frontParagraphObj.tag || 'p';
        
      }
    }

    for (let i = 0; i < verseEntries.length; i++) {
      const [verseNumStr, verseData] = verseEntries[i];
      const parsedVerse = this.parseVerseNumber(verseNumStr);

      const { verse, hasParagraphMarker, paragraphStyle } = this.processVerse(
        verseData, 
        verseNumStr, 
        chapterNum, 
        bookCode
      );

      // Skip empty verses (they often appear at chapter boundaries)
      if (!verse.text.trim()) {
        
        continue;
      }

      // Start a new paragraph if:
      // 1. This is the first verse and we have no current paragraph
      // 2. The previous verse had a paragraph marker (indicating this verse starts a new paragraph)
      const shouldStartNewParagraph = currentParagraph === null || nextParagraphStyle !== null;

      if (shouldStartNewParagraph) {
        // Close the current paragraph
        if (currentParagraph) {
          paragraphs.push(currentParagraph);
        }

        // Determine the style for this new paragraph
        const styleForThisParagraph = nextParagraphStyle || 'p';
        nextParagraphStyle = null; // Reset for next iteration

        currentParagraph = {
          id: `chapter-${chapterNum}-paragraph-${paragraphCounter++}`,
          type: styleForThisParagraph?.startsWith('q') ? 'quote' : 'paragraph',
          style: styleForThisParagraph as ProcessedParagraph['style'],
          indentLevel: this.getIndentLevel(styleForThisParagraph),
          startVerse: parsedVerse.number,
          endVerse: parsedVerse.number,
          verseCount: 1,
          verseNumbers: [parsedVerse.number],
          combinedText: verse.text,
          verses: [verse]
        };

        
      } else if (currentParagraph) {
        // Add verse to current paragraph
        currentParagraph.endVerse = parsedVerse.number;
        currentParagraph.verseCount++;
        currentParagraph.verseNumbers.push(parsedVerse.number);
        currentParagraph.combinedText += ' ' + verse.text;
        currentParagraph.verses.push(verse);

        
      }

      // If this verse has a paragraph marker, it indicates the NEXT paragraph's style
      if (hasParagraphMarker && paragraphStyle) {
        nextParagraphStyle = paragraphStyle;
        
      }

      verse.paragraphId = currentParagraph?.id;
      verses.push(verse);
    }

    if (currentParagraph) {
      paragraphs.push(currentParagraph);
    }

    return {
      number: chapterNum,
      verseCount: verses.length,
      paragraphCount: paragraphs.length,
      verses,
      paragraphs
    };
  }

  /**
   * Process a single verse
   */
  private processVerse(
    verseData: USFMVerse, 
    verseNumStr: string, 
    chapterNum: number, 
    bookCode: string
  ): { verse: ProcessedVerse; hasParagraphMarker: boolean; paragraphStyle?: string } {
    // Parse the verse number (handles spans like "1-2")
    const parsedVerse = this.parseVerseNumber(verseNumStr);
    
    
    let cleanText = '';
    let hasParagraphMarker = false;
    let paragraphStyle: string | undefined;
    let hasSectionMarker = false;
    let sectionMarkerCount = 0;
    const alignments: WordAlignment[] = [];

    if (!verseData.verseObjects) {
      return {
        verse: {
          number: parsedVerse.number,
          text: '',
          reference: `${bookCode} ${chapterNum}:${parsedVerse.originalVerseString}`,
          hasSectionMarker: false,
          sectionMarkers: 0,
          alignments: [],
          isSpan: parsedVerse.isSpan,
          spanStart: parsedVerse.spanStart,
          spanEnd: parsedVerse.spanEnd,
          originalVerseString: parsedVerse.originalVerseString
        },
        hasParagraphMarker: false
      };
    }

    // Process verse objects
    for (const verseObj of verseData.verseObjects) {
      if (this.isTextObject(verseObj)) {
        cleanText += verseObj.text;
      } else if (this.isWordObject(verseObj)) {
        cleanText += verseObj.text;
      } else if (this.isAlignmentObject(verseObj)) {
        cleanText += this.extractTextFromAlignment(verseObj);
        // Extract alignment data (now returns array)
        const verseAlignments = this.extractAlignmentData(verseObj, `${bookCode} ${chapterNum}:${parsedVerse.originalVerseString}`);
        alignments.push(...verseAlignments);
      } else if (this.isParagraphObject(verseObj)) {
        hasParagraphMarker = true;
        paragraphStyle = verseObj.tag;
      }
    }

    // Check for section markers
    const rawContent = JSON.stringify(verseData);
    if (rawContent.includes('\\ts\\*') || rawContent.includes('ts\\*')) {
      hasSectionMarker = true;
      sectionMarkerCount = (rawContent.match(/\\ts\\*/g) || []).length;
    }

    cleanText = this.cleanText(cleanText);

    const verse: ProcessedVerse = {
      number: parsedVerse.number,
      text: cleanText,
      reference: `${bookCode} ${chapterNum}:${parsedVerse.originalVerseString}`,
      hasSectionMarker,
      sectionMarkers: sectionMarkerCount,
      alignments: alignments.length > 0 ? alignments : undefined,
      // Verse span information
      isSpan: parsedVerse.isSpan,
      spanStart: parsedVerse.spanStart,
      spanEnd: parsedVerse.spanEnd,
      originalVerseString: parsedVerse.originalVerseString
    };

    // Add enhanced word tokenization based on USFM structure
    const hasAlignmentMarkup = verseData.verseObjects?.some(obj => 
      this.isAlignmentObject(obj)
    );
    
    const hasWordObjects = verseData.verseObjects?.some(obj => 
      obj.type === 'word'
    );
    
    if (hasAlignmentMarkup) {
      // Target language with alignment markup - use enhanced tokenization
      const enhancedData = this.extractWordTokensAndAlignments(verseData.verseObjects, verse.reference);
      verse.wordTokens = enhancedData.tokens;
      verse.alignmentGroups = enhancedData.alignmentGroups;
    } else if (hasWordObjects) {
      // Original language with word objects - use word object tokenization
      const wordTokens = this.extractWordObjectTokens(verseData.verseObjects, verse.reference);
      verse.wordTokens = wordTokens;
    } else {
      // Plain text fallback - use simple tokenization
      const simpleTokens = this.createSimpleWordTokens(verse.text, verse.reference);
      verse.wordTokens = simpleTokens;
    }

    return { verse, hasParagraphMarker, paragraphStyle };
  }

  /**
   * Extract translator sections (translation sections marked with \ts\*)
   */
  private extractTranslatorSections(usfmJson: USFMDocument, bookCode: string): TranslatorSection[] {
    const sections: TranslatorSection[] = [];
    let currentSection: {
      startChapter: number;
      startVerse: number;
      startVerseString: string;
    } | null = null;

    
    
    // First, let's search the entire JSON for any \ts\* markers
    const fullJsonString = JSON.stringify(usfmJson);
    const tsMarkerCount = (fullJsonString.match(/\\ts\\\*/g) || []).length;
    const tsMarkerCountAlt = (fullJsonString.match(/ts\\\*/g) || []).length;
    
    
    // Also check for other possible variations
    const tsVariations = [
      { name: 'raw \\ts\\*', pattern: /\\ts\\\*/g },
      { name: 'tag:ts\\*', pattern: /"tag":"ts\\\\\*"/g },
      { name: 'tag:ts', pattern: /"tag":"ts"/g },
      { name: 'ts marker', pattern: /"ts"/g }
    ];
    
    tsVariations.forEach((variation, index) => {
      const matches = (fullJsonString.match(variation.pattern) || []).length;
      
    });

    // Check for pre-chapter \ts\* markers in headers
    if (usfmJson.headers) {
      const headersJson = JSON.stringify(usfmJson.headers);
      if (headersJson.includes('"tag":"ts"') || headersJson.includes('"tag":"ts\\\\*"')) {
        
        currentSection = {
          startChapter: 1,
          startVerse: 1,
          startVerseString: "1"
        };
      }
    }

    // Find the last chapter and verse for final section handling
    let lastChapter = 0;
    let lastVerse = 0;
    for (const [chapterNumStr, chapterData] of Object.entries(usfmJson.chapters)) {
      const chapterNum = parseInt(chapterNumStr);
      if (isNaN(chapterNum)) continue;
      
      lastChapter = Math.max(lastChapter, chapterNum);
      
      for (const [verseNumStr] of Object.entries(chapterData)) {
        const parsedVerse = this.parseVerseNumber(verseNumStr);
        if (parsedVerse.number < 1) continue;
        
        if (chapterNum === lastChapter) {
          // For spans, use the end of the span as the last verse
          const effectiveLastVerse = parsedVerse.isSpan ? parsedVerse.spanEnd! : parsedVerse.number;
          lastVerse = Math.max(lastVerse, effectiveLastVerse);
        }
      }
    }

    

    // Process chapters and verses
    for (const [chapterNumStr, chapterData] of Object.entries(usfmJson.chapters)) {
      const chapterNum = parseInt(chapterNumStr);
      if (isNaN(chapterNum)) continue;

      for (const [verseNumStr, verseData] of Object.entries(chapterData)) {
        const parsedVerse = this.parseVerseNumber(verseNumStr);
        if (parsedVerse.number < 1) continue;

        const rawContent = JSON.stringify(verseData);
        
        // Check for translation section markers in the parsed JSON
        // \ts\* markers get parsed as {"tag": "ts\\*"}
        const hasTranslationSection = rawContent.includes('"tag":"ts\\\\*"');
        
        if (hasTranslationSection) {
          
          
          
          // Close the previous section
          if (currentSection) {
            // For sections that end before a new section starts
            const endChapter = chapterNum;
            // If the previous verse was a span, use the end of the span as the end verse
            const endVerse = parsedVerse.number > 1 ? parsedVerse.number - 1 : parsedVerse.number;
            
            // Find the previous verse to check if it was a span
            let prevVerseString = "1";
            let prevVerse = endVerse;
            for (const [prevVerseNumStr] of Object.entries(chapterData)) {
              const prevParsedVerse = this.parseVerseNumber(prevVerseNumStr);
              if (prevParsedVerse.number === endVerse) {
                prevVerseString = prevParsedVerse.originalVerseString;
                // If it's a span, use the end of the span
                if (prevParsedVerse.isSpan && prevParsedVerse.spanEnd) {
                  prevVerse = prevParsedVerse.spanEnd;
                }
                break;
              }
            }
            
            sections.push({
              start: {
                chapter: currentSection.startChapter,
                verse: currentSection.startVerse,
                reference: { 
                  chapter: currentSection.startChapter.toString(), 
                  verse: currentSection.startVerseString 
                }
              },
              end: {
                chapter: endChapter,
                verse: prevVerse,
                reference: { 
                  chapter: endChapter.toString(), 
                  verse: prevVerseString 
                }
              }
            });
          }

          // Start new section
          // If this verse is a span, use the start of the span as the start verse
          const startVerse = parsedVerse.isSpan && parsedVerse.spanStart ? parsedVerse.spanStart : parsedVerse.number;
          currentSection = {
            startChapter: chapterNum,
            startVerse: startVerse,
            startVerseString: parsedVerse.originalVerseString
          };
        }
      }
    }

    // Handle the final section (ends at the last verse of the book)
    if (currentSection) {
      // Find the last verse string to handle spans correctly
      let lastVerseString = lastVerse.toString();
      for (const [chapterNumStr, chapterData] of Object.entries(usfmJson.chapters)) {
        const chapterNum = parseInt(chapterNumStr);
        if (chapterNum === lastChapter) {
          for (const [verseNumStr] of Object.entries(chapterData)) {
            const parsedVerse = this.parseVerseNumber(verseNumStr);
            if (parsedVerse.isSpan && parsedVerse.spanEnd === lastVerse) {
              lastVerseString = parsedVerse.originalVerseString;
              break;
            } else if (parsedVerse.number === lastVerse) {
              lastVerseString = parsedVerse.originalVerseString;
            }
          }
          break;
        }
      }
      
      sections.push({
        start: {
          chapter: currentSection.startChapter,
          verse: currentSection.startVerse,
          reference: { 
            chapter: currentSection.startChapter.toString(), 
            verse: currentSection.startVerseString 
          }
        },
        end: {
          chapter: lastChapter,
          verse: lastVerse,
          reference: { 
            chapter: lastChapter.toString(), 
            verse: lastVerseString 
          }
        }
      });
    }

    
    sections.forEach((section, index) => {
      const startRef = `${bookCode} ${section.start.reference.chapter}:${section.start.reference.verse}`;
      const endRef = `${bookCode} ${section.end.reference.chapter}:${section.end.reference.verse}`;
      
    });
    
    return sections;
  }

  /**
   * Extract word alignments
   */
  private extractWordAlignments(usfmJson: USFMDocument, bookCode: string): WordAlignment[] {
    const alignments: WordAlignment[] = [];

    for (const [chapterNumStr, chapterData] of Object.entries(usfmJson.chapters)) {
      const chapterNum = parseInt(chapterNumStr);
      if (isNaN(chapterNum)) continue;

      for (const [verseNumStr, verseData] of Object.entries(chapterData)) {
        const parsedVerse = this.parseVerseNumber(verseNumStr);
        if (parsedVerse.number < 1) continue;

        const verseAlignments = this.extractVerseAlignments(verseData, chapterNum, parsedVerse.number, bookCode);
        alignments.push(...verseAlignments);
      }
    }

    return alignments;
  }

  /**
   * Extract alignments from a verse
   */
  private extractVerseAlignments(
    verseData: USFMVerse, 
    chapterNum: number, 
    verseNum: number, 
    bookCode: string
  ): WordAlignment[] {
    const alignments: WordAlignment[] = [];
    const verseRef = `${bookCode} ${chapterNum}:${verseNum}`;

    if (!verseData.verseObjects) return alignments;

    for (const verseObj of verseData.verseObjects) {
      if (this.isAlignmentObject(verseObj)) {
        const verseAlignments = this.extractAlignmentData(verseObj, verseRef);
        alignments.push(...verseAlignments);
      }
    }

    return alignments;
  }

  /**
   * Extract alignment data from alignment object
   */
  private extractAlignmentData(alignmentObj: USFMAlignmentObject, verseRef: string): WordAlignment[] {
    const alignments: WordAlignment[] = [];
    
    // Extract compound alignment data (for nested structures)
    const compoundAlignment = this.extractCompoundAlignment(alignmentObj, verseRef);
    if (compoundAlignment) {
      alignments.push(compoundAlignment);
    }
    
    return alignments;
  }

  /**
   * Extract compound alignment data including nested alignments
   */
  private extractCompoundAlignment(alignmentObj: USFMAlignmentObject, verseRef: string): WordAlignment | null {
    const targetWords: string[] = [];
    const sourceWords: string[] = [];
    const alignmentData: {
      strong: string;
      lemma: string;
      morph: string;
      occurrence: string;
      occurrences: string;
    }[] = [];
    
    // Add this level's alignment data
    if (alignmentObj.content || alignmentObj.strong) {
      sourceWords.push(alignmentObj.content || '');
      alignmentData.push({
        strong: alignmentObj.strong || '',
        lemma: alignmentObj.lemma || '',
        morph: alignmentObj.morph || '',
        occurrence: alignmentObj.occurrence || '',
        occurrences: alignmentObj.occurrences || ''
      });
    }
    
    if (alignmentObj.children) {
      for (const child of alignmentObj.children) {
        if (this.isWordObject(child)) {
          targetWords.push(child.text);
        } else if (this.isTextObject(child)) {
          // Only add non-whitespace text
          const text = child.text.trim();
          if (text) {
            targetWords.push(text);
          }
        } else if (this.isAlignmentObject(child)) {
          // For nested alignments, merge their data into this compound alignment
          const nestedAlignment = this.extractCompoundAlignment(child, verseRef);
          if (nestedAlignment) {
            // Merge target words
            targetWords.push(...nestedAlignment.targetWords);
            // Merge source words
            sourceWords.push(...nestedAlignment.sourceWords);
            // Merge alignment data
            alignmentData.push(...nestedAlignment.alignmentData);
          }
        }
      }
    }

    // Create compound alignment if we have target words
    if (targetWords.length > 0) {
      return {
        verseRef,
        sourceWords,
        targetWords,
        alignmentData
      };
    }

    return null;
  }

  /**
   * Generate processing metadata
   */
  private generateMetadata(
    bookCode: string,
    bookName: string,
    structuredText: ProcessedScripture,
    translatorSections: TranslatorSection[],
    alignments: WordAlignment[],
    processingDuration: number
  ): ProcessedScripture['metadata'] {
    return {
      bookCode,
      bookName,
      processingDate: new Date().toISOString(),
      processingDuration,
      version: this.PROCESSING_VERSION,
      hasAlignments: alignments.length > 0,
      hasSections: translatorSections.length > 0,
      totalChapters: structuredText.metadata.totalChapters,
      totalVerses: structuredText.metadata.totalVerses,
      totalParagraphs: structuredText.metadata.totalParagraphs,
      statistics: {
        totalChapters: structuredText.metadata.totalChapters,
        totalVerses: structuredText.metadata.totalVerses,
        totalParagraphs: structuredText.metadata.totalParagraphs,
        totalSections: translatorSections.length,
        totalAlignments: alignments.length
      }
    };
  }

  /**
   * Parse verse number that may be a span (e.g., "1-2") or single number (e.g., "3")
   */
  private parseVerseNumber(verseString: string): {
    number: number;
    isSpan: boolean;
    spanStart?: number;
    spanEnd?: number;
    originalVerseString: string;
  } {
    const trimmed = verseString.trim();
    
    // Check if it's a span (contains a dash)
    if (trimmed.includes('-')) {
      const parts = trimmed.split('-');
      if (parts.length === 2) {
        const start = parseInt(parts[0].trim());
        const end = parseInt(parts[1].trim());
        
        if (!isNaN(start) && !isNaN(end) && start <= end) {
          return {
            number: start, // Use the start number as the primary number
            isSpan: true,
            spanStart: start,
            spanEnd: end,
            originalVerseString: trimmed
          };
        }
      }
    }
    
    // Single verse number
    const singleNumber = parseInt(trimmed);
    if (!isNaN(singleNumber)) {
      return {
        number: singleNumber,
        isSpan: false,
        originalVerseString: trimmed
      };
    }
    
    // Fallback for invalid verse numbers
    // console.debug(`⚠️ Invalid verse number: "${trimmed}"`);
    return {
      number: 1,
      isSpan: false,
      originalVerseString: trimmed
    };
  }

  // Type guards
  private isTextObject(obj: USFMVerseObject): obj is USFMTextObject {
    return obj.type === 'text';
  }

  private isWordObject(obj: USFMVerseObject): obj is USFMWordObject {
    return obj.type === 'word' && 'tag' in obj && obj.tag === 'w';
  }

  private isParagraphObject(obj: USFMVerseObject): obj is USFMParagraphObject {
    return obj.type === 'paragraph' || obj.type === 'quote';
  }

  private isAlignmentObject(obj: USFMVerseObject): obj is USFMAlignmentObject {
    return obj.type === 'milestone' && 'tag' in obj && obj.tag === 'zaln';
  }

  /**
   * Classify token type based on content
   */
  private classifyTokenType(text: string): 'word' | 'punctuation' | 'number' | 'whitespace' | 'paragraph-marker' {
    if (!text.trim()) {
      return 'whitespace';
    }
    
    // Check if it's purely numeric
    if (/^\d+$/.test(text)) {
      return 'number';
    }
    
    // Special case: Hebrew maqaf (־) should always be treated as punctuation
    if (text === '־') {
      return 'punctuation';
    }
    
    // Check if it's purely punctuation (including quotes, dashes, spaces, etc.)
    // Use a simpler approach: if it contains NO actual letters or digits, it's punctuation
    // Include Unicode ranges for: Latin, Greek, Hebrew, Arabic, Syriac, Latin Extended
    if (!/[a-zA-Z\u0370-\u03FF\u1F00-\u1FFF\u0590-\u05FF\u0600-\u06FF\u0700-\u074F\u00C0-\u017F\u1E00-\u1EFF\d]/.test(text)) {
      return 'punctuation';
    }
    
    // Check if it contains word characters (including Unicode for Greek, Hebrew, Arabic, etc.)
    // Use more specific ranges that exclude punctuation
    if (/[a-zA-Z\u0370-\u03FF\u1F00-\u1FFF\u0590-\u05FF\u0600-\u06FF\u0700-\u074F\u00C0-\u017F\u1E00-\u1EFF]/.test(text)) {
      return 'word';
    }
    
    // Default to punctuation for other symbols
    return 'punctuation';
  }

  /**
   * Extract text from alignment object (handles nested alignments)
   */
  private extractTextFromAlignment(alignmentObj: USFMAlignmentObject): string {
    let text = '';
    if (alignmentObj.children) {
      for (const child of alignmentObj.children) {
        if (this.isTextObject(child)) {
          text += child.text;
        } else if (this.isWordObject(child)) {
          text += child.text;
        } else if (this.isAlignmentObject(child)) {
          // Recursively handle nested alignment objects
          text += this.extractTextFromAlignment(child);
        }
      }
    }
    return text;
  }

  /**
   * Get indentation level for paragraph styles
   */
  private getIndentLevel(style: string): number {
    if (style === 'q1') return 1;
    if (style === 'q2') return 2;
    if (style === 'q3') return 3;
    if (style === 'q4') return 4;
    if (style.startsWith('q')) return 1;
    return 0;
  }

  /**
   * Clean text by removing artifacts
   */
  private cleanText(text: string): string {
    return text
      .replace(/\\[a-z-]+\*?/g, '')  // Remove USFM markers
      .replace(/\|[^\\|]*\\?/g, '')   // Remove metadata
      .replace(/\\\*/g, '')           // Remove backslash-asterisk
      .replace(/\s+/g, ' ')           // Normalize whitespace
      .trim();
  }

  /**
   * Extract word tokens and alignment groups from verse objects
   */
  private extractWordTokensAndAlignments(
    verseObjects: USFMVerseObject[], 
    verseRef: string
  ): { text: string; tokens: WordToken[]; verseAlignments: WordAlignment[]; alignmentGroups: AlignmentGroup[] } {
    let text = '';
    const tokens: WordToken[] = [];
    const verseAlignments: WordAlignment[] = [];
    const alignmentGroups: AlignmentGroup[] = [];
    
    // Track word occurrences for proper ID generation
    const wordOccurrences = new Map<string, number>();
    const wordTotalCounts = new Map<string, number>();
    
    // First pass: count total occurrences of each word
    this.countWordOccurrences(verseObjects, wordTotalCounts);
    
    // Track alignment groups for non-contiguous words
    const alignmentGroupMap = new Map<string, AlignmentGroup>();

    // Helper function to collect all original language token IDs from alignment context
    const collectOriginalWordIds = (alignmentObj: USFMAlignmentObject, nestedAlignments: USFMAlignmentObject[] = []): string[] => {
      const originalWordIds: string[] = [];
      
      // Add the current alignment's original word ID
      if (alignmentObj.content) {
        const originalWordId = `${verseRef}:${this.normalizeTextContent(alignmentObj.content)}:${alignmentObj.occurrence || '1'}`;
        originalWordIds.push(originalWordId);
      }
      
      // Add nested alignment original word IDs
      for (const nested of nestedAlignments) {
        if (nested.content) {
          const nestedOriginalWordId = `${verseRef}:${this.normalizeTextContent(nested.content)}:${nested.occurrence || '1'}`;
          originalWordIds.push(nestedOriginalWordId);
        }
      }
      
      return originalWordIds;
    };

    const processObject = (obj: USFMVerseObject, alignmentContext?: USFMAlignmentObject): void => {
      if (this.isTextObject(obj)) {
        const startPos = text.length;
        text += obj.text;
        const endPos = text.length;

        // Only create tokens for non-whitespace text objects
        if (obj.text.trim()) {
          const content = obj.text;
          const normalizedContent = this.normalizeTextContent(content);
          const occurrence = 1; // Text objects don't have meaningful occurrences
          const uniqueId = `${verseRef}:${normalizedContent}:${occurrence}`;
          
          // Determine token type
          let tokenType: 'word' | 'text' | 'punctuation';
          if (/^[a-zA-Z\u0590-\u05FF\u0600-\u06FF\u0700-\u074F]+$/.test(normalizedContent)) {
            tokenType = 'word'; // Pure letters (including Hebrew, Arabic, Syriac)
          } else {
            tokenType = 'punctuation'; // Everything else (punctuation, mixed content)
          }
          
          const token: WordToken = {
            uniqueId,
            content,
            occurrence,
            totalOccurrences: 1,
            verseRef,
            position: {
              start: startPos,
              end: endPos
            },
            type: tokenType,
            isHighlightable: tokenType === 'word',
            alignmentId: alignmentContext?.strong
          };
          
          // For original language tokens, create alignment data if we have context
          if (alignmentContext) {
            token.alignment = {
              strong: alignmentContext.strong || '',
              lemma: alignmentContext.lemma || '',
              morph: alignmentContext.morph || '',
              sourceContent: content, // For original language, the content IS the source
              sourceWordId: `${verseRef}:${this.normalizeTextContent(alignmentContext.content || content)}:${alignmentContext.occurrence || '1'}`
            };
          }
          
          tokens.push(token);
        }
      } else if (this.isAlignmentObject(obj)) {
        const alignmentTokens: WordToken[] = [];
        const nestedAlignments: USFMAlignmentObject[] = [];
        
        // Process alignment children
        if (obj.children) {
          for (const child of obj.children) {
            if (this.isWordObject(child)) {
              const startPos = text.length;
              text += child.text;
              const endPos = text.length;
              
              const normalizedContent = this.normalizeTextContent(child.text);
              const currentCount = (wordOccurrences.get(normalizedContent) || 0) + 1;
              wordOccurrences.set(normalizedContent, currentCount);
              const totalCount = wordTotalCounts.get(normalizedContent) || 1;
              
              const uniqueId = `${verseRef}:${normalizedContent}:${currentCount}`;
              
              const token: WordToken = {
                uniqueId,
                content: child.text,
                occurrence: currentCount,
                totalOccurrences: totalCount,
                verseRef,
                position: {
                  start: startPos,
                  end: endPos
                },
                type: 'word',
                isHighlightable: true,
                alignmentId: obj.content,
                // Direct alignment references - collect all original word IDs this token is aligned to
                alignedOriginalWordIds: collectOriginalWordIds(obj, nestedAlignments),
                // Backward compatibility
                alignment: {
                  strong: obj.strong || '',
                  lemma: obj.lemma || '',
                  morph: obj.morph || '',
                  sourceContent: obj.content || '',
                  sourceWordId: `${verseRef}:${this.normalizeTextContent(obj.content || '')}:${obj.occurrence || '1'}`
                }
              };
              
              tokens.push(token);
              alignmentTokens.push(token);
            } else if (this.isTextObject(child)) {
              // Handle text within alignments (usually spaces)
              text += child.text;
            } else if (this.isAlignmentObject(child)) {
              // Handle nested alignments
              nestedAlignments.push(child);
              processObject(child, obj); // Recursively process nested alignment
            }
          }
        }
        
        // Create alignment group (including nested alignments)
        if (alignmentTokens.length > 0 || nestedAlignments.length > 0) {
          const groupId = `${verseRef}:alignment:${obj.content || 'group'}:${alignmentGroups.length}`;
          
          
          // Collect all source words from this alignment and nested alignments
          const allSourceWords: string[] = [];
          const allAlignmentData: {
            strong: string;
            lemma: string;
            morph: string;
            occurrence: string;
            occurrences: string;
          }[] = [];
          
          // Add this alignment's source word
          if (obj.content) {
            allSourceWords.push(obj.content);
          }
          allAlignmentData.push({
            strong: obj.strong || '',
            lemma: obj.lemma || '',
            morph: obj.morph || '',
            occurrence: obj.occurrence || '',
            occurrences: obj.occurrences || ''
          });
          
          // Add nested alignments' source words
          for (const nested of nestedAlignments) {
            if (nested.content) {
              allSourceWords.push(nested.content);
            }
            allAlignmentData.push({
              strong: nested.strong || '',
              lemma: nested.lemma || '',
              morph: nested.morph || '',
              occurrence: nested.occurrence || '',
              occurrences: nested.occurrences || ''
            });
          }
          
          // Collect all target tokens from nested alignments
          const allTargetTokens = [...alignmentTokens];
          for (const nested of nestedAlignments) {
            // Find tokens that belong to this nested alignment
            const nestedTokens = tokens.filter(token => token.alignmentId === nested.content);
            allTargetTokens.push(...nestedTokens);
          }
          
          const alignmentGroup: AlignmentGroup = {
            id: groupId,
            verseRef,
            sourceWords: allSourceWords,
            targetTokens: allTargetTokens,
            alignmentData: allAlignmentData,
            isContiguous: allTargetTokens.length === 1 || this.areTokensContiguous(allTargetTokens)
          };
          
          alignmentGroups.push(alignmentGroup);
          alignmentGroupMap.set(obj.content || '', alignmentGroup);
          
          // Also create entries for nested alignments to point to the same group
          for (const nested of nestedAlignments) {
            alignmentGroupMap.set(nested.content || '', alignmentGroup);
          }
          
          // Update all target tokens to reference this alignment group
          for (const token of allTargetTokens) {
            token.alignmentGroupId = groupId;
          }
        }
        
        // Create word alignment for backward compatibility
        if (obj.children) {
          const targetWords = obj.children
            .filter(child => this.isWordObject(child))
            .map(child => (child as USFMWordObject).text);
          
          if (targetWords.length > 0) {
            verseAlignments.push({
              verseRef,
              sourceWords: obj.content ? [obj.content] : [],
              targetWords,
              alignmentData: [{
                strong: obj.strong || '',
                lemma: obj.lemma || '',
                morph: obj.morph || '',
                occurrence: obj.occurrence || '',
                occurrences: obj.occurrences || ''
              }]
            });
          }
        }
      }
    };

    // Process all verse objects
    for (const obj of verseObjects) {
      processObject(obj);
    }

    return {
      text: this.cleanText(text),
      tokens,
      verseAlignments,
      alignmentGroups
    };
  }

  /**
   * Count word occurrences in verse objects
   */
  private countWordOccurrences(verseObjects: USFMVerseObject[], wordCounts: Map<string, number>): void {
    const processObject = (obj: USFMVerseObject): void => {
      if (this.isWordObject(obj)) {
        const normalized = this.normalizeTextContent(obj.text);
        wordCounts.set(normalized, (wordCounts.get(normalized) || 0) + 1);
      } else if (this.isAlignmentObject(obj) && obj.children) {
        for (const child of obj.children) {
          processObject(child);
        }
      }
    };

    for (const obj of verseObjects) {
      processObject(obj);
    }
  }

  /**
   * Normalize text content for consistent comparison
   */
  private normalizeTextContent(text: string): string {
    return text.toLowerCase().trim();
  }

  /**
   * Check if tokens are contiguous (adjacent positions)
   */
  private areTokensContiguous(tokens: WordToken[]): boolean {
    if (tokens.length <= 1) return true;
    
    const sortedTokens = [...tokens].sort((a, b) => a.position.start - b.position.start);
    
    for (let i = 1; i < sortedTokens.length; i++) {
      const prevEnd = sortedTokens[i - 1].position.end;
      const currentStart = sortedTokens[i].position.start;
      
      // Allow for whitespace between tokens (up to 3 characters)
      if (currentStart - prevEnd > 3) {
        return false;
      }
    }
    
    return true;
  }

  /**
   * Extract word tokens from original language word objects (\\w tags)
   */
  private extractWordObjectTokens(verseObjects: any[], verseRef: string): WordToken[] {
    const tokens: WordToken[] = [];
    const wordOccurrences = new Map<string, number>();
    
    // First pass: count word occurrences
    const wordCounts = new Map<string, number>();
    const processObjectsForCounting = (objects: any[]) => {
      objects.forEach((obj: any) => {
        if (obj.type === 'word' && obj.text) {
          const normalized = this.normalizeTextContent(obj.text);
          wordCounts.set(normalized, (wordCounts.get(normalized) || 0) + 1);
        } else if (obj.children) {
          processObjectsForCounting(obj.children);
        }
      });
    };
    processObjectsForCounting(verseObjects);
    
    let position = 0;
    
    const processObjects = (objects: any[]) => {
      objects.forEach((obj: any) => {
        if (obj.type === 'word' && obj.text) {
          const word = obj.text;
          const normalizedContent = this.normalizeTextContent(word);
          const currentCount = (wordOccurrences.get(normalizedContent) || 0) + 1;
          wordOccurrences.set(normalizedContent, currentCount);
          const totalCount = wordCounts.get(normalizedContent) || 1;
          
          const uniqueId = `${verseRef}:${normalizedContent}:${currentCount}`;
          
          // Extract Strong's number, lemma, and morphology from word object
          const strong = obj.strong || '';
          const lemma = obj.lemma || word;
          const morph = obj.morph || obj['x-morph'] || '';
          
          tokens.push({
            uniqueId,
            content: word,
            occurrence: currentCount,
            totalOccurrences: totalCount,
            verseRef,
            position: {
              start: position,
              end: position + word.length
            },
            type: 'word',
            isHighlightable: true,
            alignment: {
              strong: strong,
              lemma: lemma,
              morph: morph,
              sourceContent: word, // For original language, content IS the source
              sourceWordId: uniqueId
            }
          });
          
          position += word.length;
        } else if (obj.type === 'text' && obj.text) {
          // Handle punctuation and spaces
          const text = obj.text;
          if (text.trim()) {
            // Non-whitespace text (punctuation)
            const uniqueId = `${verseRef}:${text}:${position}`;
            
            tokens.push({
              uniqueId,
              content: text,
              occurrence: 1,
              totalOccurrences: 1,
              verseRef,
              position: {
                start: position,
                end: position + text.length
              },
              type: 'punctuation',
              isHighlightable: false
            });
          }
          position += text.length;
        } else if (obj.children) {
          // Recursively process nested objects
          processObjects(obj.children);
        }
      });
    };
    
    processObjects(verseObjects);
    return tokens;
  }

  /**
   * Create simple word tokens for original language texts (no alignment markup)
   */
  private createSimpleWordTokens(text: string, verseRef: string): WordToken[] {
    const tokens: WordToken[] = [];
    const words = text.split(/(\s+|[^\w\u0590-\u05FF\u0600-\u06FF\u0700-\u074F]+)/);
    let position = 0;
    const wordOccurrences = new Map<string, number>();
    
    // First pass: count occurrences
    const wordCounts = new Map<string, number>();
    words.forEach(word => {
      const normalized = this.normalizeTextContent(word);
      if (normalized && /[\w\u0590-\u05FF\u0600-\u06FF\u0700-\u074F]/.test(word)) {
        wordCounts.set(normalized, (wordCounts.get(normalized) || 0) + 1);
      }
    });
    
    words.forEach(word => {
      const startPos = position;
      const endPos = position + word.length;
      position = endPos;
      
      if (!word.trim()) {
        // Skip whitespace
        return;
      }
      
      const normalizedContent = this.normalizeTextContent(word);
      const isWord = /[\w\u0590-\u05FF\u0600-\u06FF\u0700-\u074F]/.test(word);
      
      if (isWord) {
        const currentCount = (wordOccurrences.get(normalizedContent) || 0) + 1;
        wordOccurrences.set(normalizedContent, currentCount);
        const totalCount = wordCounts.get(normalizedContent) || 1;
        
        const uniqueId = `${verseRef}:${normalizedContent}:${currentCount}`;
        
        tokens.push({
          uniqueId,
          content: word,
          occurrence: currentCount,
          totalOccurrences: totalCount,
          verseRef,
          position: {
            start: startPos,
            end: endPos
          },
          type: 'word',
          isHighlightable: true,
          // For original language, create basic alignment data for cross-panel communication
          alignment: {
            strong: `${verseRef}:${normalizedContent}:${currentCount}`, // Fallback strong
            lemma: word,
            morph: '',
            sourceContent: word, // For original language, content IS the source
            sourceWordId: `${verseRef}:${normalizedContent}:${currentCount}`
          }
        });
      } else {
        // Punctuation
        const uniqueId = `${verseRef}:${word}:${position}`;
        
        tokens.push({
          uniqueId,
          content: word,
          occurrence: 1,
          totalOccurrences: 1,
          verseRef,
          position: {
            start: startPos,
            end: endPos
          },
          type: 'punctuation',
          isHighlightable: false
        });
      }
    });
    
    return tokens;
  }

  // ============================================================================
  // OPTIMIZED PROCESSING METHODS
  // ============================================================================

  /**
   * Process USFM content into optimized format
   * Detects document type and applies appropriate optimization strategy
   */
  async processUSFMOptimized(
    usfmContent: string,
    bookCode: string,
    bookName: string,
    language?: string
  ): Promise<OptimizedScripture> {
    const startTime = Date.now();
    
    try {
      // Step 1: Convert USFM to JSON
      const usfmJson: USFMDocument = usfm.toJSON(usfmContent);
      
      // Step 2: Detect document type
      const documentType = this.detectDocumentType(usfmJson);
      
      // Step 3: Extract translator sections (same as regular processing)
      let translatorSections = this.extractTranslatorSections(usfmJson, bookCode);      
      // Use default sections if none found in USFM
      if (translatorSections.length === 0) {
        
        try {
          const defaultSectionsList = defaultSections[bookCode as keyof typeof defaultSections] || [];
          
          if (defaultSectionsList.length > 0) {
            translatorSections = defaultSectionsList as any;
            
          }
        } catch (error) {
          console.warn(`⚠️ Failed to load default sections for ${bookCode}:`, error);
        }
      } else {
        
      }
      
      // Step 4: Process based on document type
      const optimizedScripture = this.processOptimizedByType(
        usfmJson, 
        bookCode, 
        bookName, 
        documentType,
        language
      );
      
      // Step 5: Add translator sections to optimized scripture
      optimizedScripture.translatorSections = translatorSections;
      
      // Step 6: Add metadata
      optimizedScripture.meta.processingDate = new Date().toISOString();
      optimizedScripture.meta.version = '2.0-optimized';
      
      return optimizedScripture;
      
    } catch (error) {
      console.error('Error processing USFM (optimized):', error);
      throw error;
    }
  }

  /**
   * Detect the type of USFM document
   */
  private detectDocumentType(usfmJson: USFMDocument): 'untokenized' | 'original' | 'aligned' {
    // Check for alignment markers (\zaln)
    const hasAlignmentMarkers = this.checkForAlignmentMarkup(usfmJson);
    if (hasAlignmentMarkers) {
      return 'aligned';
    }
    
    // Check for word objects (\w markers)
    const hasWordObjects = this.checkForWordObjects(usfmJson);
    if (hasWordObjects) {
      return 'original';
    }
    
    // Default to untokenized
    return 'untokenized';
  }

  /**
   * Check if USFM document contains alignment markup
   */
  private checkForAlignmentMarkup(usfmJson: USFMDocument): boolean {
    for (const [, chapterData] of Object.entries(usfmJson.chapters)) {
      for (const [, verseData] of Object.entries(chapterData)) {
        for (const obj of verseData.verseObjects) {
          if (this.isAlignmentObject(obj)) {
            return true;
          }
        }
      }
    }
    return false;
  }

  /**
   * Check if USFM document contains word objects
   */
  private checkForWordObjects(usfmJson: USFMDocument): boolean {
    let checkedVerses = 0
    let foundWordObjects = 0
    const sampleWordObjects: any[] = []
    
    for (const [chapterNum, chapterData] of Object.entries(usfmJson.chapters)) {
      for (const [verseNum, verseData] of Object.entries(chapterData)) {
        checkedVerses++
        
        for (const obj of verseData.verseObjects) {
          const isWord = this.isWordObject(obj);
          if (isWord) {
            foundWordObjects++
            if (sampleWordObjects.length < 3) {
              sampleWordObjects.push({
                chapter: chapterNum,
                verse: verseNum,
                wordObj: {
                  type: obj.type,
                  tag: 'tag' in obj ? obj.tag : undefined,
                  text: 'text' in obj ? obj.text : undefined,
                  strong: 'strong' in obj ? obj.strong : undefined,
                  lemma: 'lemma' in obj ? obj.lemma : undefined,
                }
              })
            }
            if (foundWordObjects === 1) {
              return true;
            }
          }
        }
      }
    }
    
    return false;
  }

  /**
   * Extract text content from verse objects
   */
  private extractTextFromVerseObjects(verseObjects: USFMVerseObject[]): string {
    let text = '';
    
    const processObject = (obj: USFMVerseObject): void => {
      if (this.isTextObject(obj)) {
        text += obj.text;
      } else if (this.isWordObject(obj)) {
        text += obj.text;
      } else if (this.isAlignmentObject(obj)) {
        text += this.extractTextFromAlignment(obj);
      }
    };
    
    verseObjects.forEach(processObject);
    return text;
  }

  /**
   * Process optimized format based on document type
   */
  private processOptimizedByType(
    usfmJson: USFMDocument,
    bookCode: string,
    bookName: string,
    documentType: 'untokenized' | 'original' | 'aligned',
    language?: string
  ): OptimizedScripture {
    const chapters: OptimizedChapter[] = [];
    let totalVerses = 0;
    let totalParagraphs = 0;
    
    // Process each chapter
    for (const [chapterNum, chapterData] of Object.entries(usfmJson.chapters)) {
      const chapterNumber = parseInt(chapterNum);
      const optimizedChapter = this.processOptimizedChapter(
        chapterData, 
        chapterNumber, 
        bookCode, 
        documentType
      );
      
      chapters.push(optimizedChapter);
      totalVerses += optimizedChapter.verseCount;
      totalParagraphs += optimizedChapter.paragraphCount;
    }
    
    return {
      meta: {
        book: bookName,
        bookCode,
        language,
        type: documentType,
        totalChapters: chapters.length,
        totalVerses,
        totalParagraphs,
        hasAlignments: documentType === 'aligned',
        processingDate: '', // Will be set by caller
        version: '' // Will be set by caller
      },
      chapters
    };
  }

  /**
   * Process a single chapter in optimized format
   */
  private processOptimizedChapter(
    chapterData: USFMChapter,
    chapterNumber: number,
    bookCode: string,
    documentType: 'untokenized' | 'original' | 'aligned'
  ): OptimizedChapter {
    const verses: OptimizedVerse[] = [];
    const paragraphs: OptimizedParagraph[] = [];
    
    let currentParagraph: OptimizedParagraph | null = null;
    let paragraphCounter = 1;
    let nextParagraphStyle: string | null = null;

    // Check for initial paragraph marker in "front" verse
    if (chapterData.front?.verseObjects) {
      const frontParagraphObj = chapterData.front.verseObjects.find((obj: any) => 
        this.isParagraphObject(obj)
      );
      if (frontParagraphObj) {
        nextParagraphStyle = frontParagraphObj.tag || 'p';
      }
    }

    // Sort verses by number
    const verseEntries = Object.entries(chapterData)
      .filter(([verseNumStr]) => {
        const verseNumber = parseInt(verseNumStr);
        return !isNaN(verseNumber) && verseNumber >= 1;
      })
      .sort(([a], [b]) => parseInt(a) - parseInt(b));

    // Process each verse
    for (const [verseNum, verseData] of verseEntries) {
      const verseNumber = parseInt(verseNum);
      const verseRef = `${bookCode} ${chapterNumber}:${verseNumber}`;
      
      // Check for paragraph markers in this verse
      let hasParagraphMarker = false;
      let paragraphStyle: string | undefined;
      
      if (verseData.verseObjects) {
        for (const verseObj of verseData.verseObjects) {
          if (this.isParagraphObject(verseObj)) {
            hasParagraphMarker = true;
            paragraphStyle = verseObj.tag;
            break;
          }
        }
      }
      
      const optimizedVerse = this.processOptimizedVerse(
        verseData,
        verseNumber,
        verseRef,
        documentType
      );

      // Skip empty verses
      if (!optimizedVerse.text.trim()) {
        continue;
      }

      // Start a new paragraph if:
      // 1. This is the first verse and we have no current paragraph
      // 2. The previous verse had a paragraph marker (indicating this verse starts a new paragraph)
      const shouldStartNewParagraph = currentParagraph === null || nextParagraphStyle !== null;

      if (shouldStartNewParagraph) {
        // Close the current paragraph
        if (currentParagraph) {
          paragraphs.push(currentParagraph);
        }

        // Determine the style for this new paragraph
        const styleForThisParagraph = nextParagraphStyle || 'p';
        nextParagraphStyle = null; // Reset for next iteration

        currentParagraph = {
          id: paragraphCounter++,
          type: styleForThisParagraph?.startsWith('q') ? 'quote' : 'paragraph',
          style: styleForThisParagraph as OptimizedParagraph['style'],
          indentLevel: this.getIndentLevel(styleForThisParagraph),
          startVerse: verseNumber,
          endVerse: verseNumber,
          verseNumbers: [verseNumber]
        };
      } else if (currentParagraph) {
        // Add verse to current paragraph
        currentParagraph.endVerse = verseNumber;
        currentParagraph.verseNumbers.push(verseNumber);
      }

      // If this verse has a paragraph marker, it indicates the NEXT paragraph's style
      if (hasParagraphMarker && paragraphStyle) {
        nextParagraphStyle = paragraphStyle;
      }

      // Assign paragraph ID to verse
      optimizedVerse.paragraphId = currentParagraph?.id || 1;
      verses.push(optimizedVerse);
    }

    // Close the final paragraph
    if (currentParagraph) {
      paragraphs.push(currentParagraph);
    }

    // If no paragraphs were created, create a default one
    if (paragraphs.length === 0 && verses.length > 0) {
      paragraphs.push({
        id: 1,
        type: 'paragraph',
        style: 'p',
        indentLevel: 0,
        startVerse: verses[0].number,
        endVerse: verses[verses.length - 1].number,
        verseNumbers: verses.map(v => v.number)
      });
      // Update all verses to use this paragraph
      verses.forEach(v => v.paragraphId = 1);
    }
    
    // Add default paragraph marker token at the start of the first verse if it doesn't have one
    if (verses.length > 0) {
      const firstVerse = verses[0];
      const firstNonWhitespaceToken = firstVerse.tokens.find(token => token.type !== 'whitespace');
      
      if (firstNonWhitespaceToken?.type !== 'paragraph-marker') {
        // Determine the default paragraph style from the first paragraph in the chapter
        let defaultStyle = 'p';
        if (chapterData.front?.verseObjects) {
          const frontParagraphObj = chapterData.front.verseObjects.find((obj: any) => 
            this.isParagraphObject(obj)
          );
          if (frontParagraphObj) {
            defaultStyle = frontParagraphObj.tag || 'p';
          }
        }
        
        // Insert default paragraph marker at the beginning
        const paragraphId = Math.abs(defaultStyle.charCodeAt(0)) + firstVerse.tokens.length + 10000;
        firstVerse.tokens.unshift({
          id: paragraphId, // Use unique ID, don't renumber existing tokens
          text: '',
          type: 'paragraph-marker',
          paragraphMarker: {
            style: defaultStyle as 'p' | 'q' | 'q1' | 'q2' | 'm' | 'mi' | 'pc' | 'pr' | 'cls',
            type: defaultStyle.startsWith('q') ? 'quote' : 'paragraph',
            indentLevel: this.getIndentLevel(defaultStyle),
            isNewParagraph: true
          }
        });
        
        // Don't renumber existing tokens - preserve semantic IDs!
      }
    }

    return {
      number: chapterNumber,
      verseCount: verses.length,
      paragraphCount: 0, // Paragraph information is now embedded in tokens
      verses
    };
  }

  /**
   * Process a single verse in optimized format
   */
  private processOptimizedVerse(
    verseData: USFMVerse,
    verseNumber: number,
    verseRef: string,
    documentType: 'untokenized' | 'original' | 'aligned'
  ): OptimizedVerse {
    let text = '';
    const tokens: OptimizedToken[] = [];
    
    // Extract text content
    text = this.extractTextFromVerseObjects(verseData.verseObjects);
    
    // Process tokens based on document type
    
    switch (documentType) {
      case 'untokenized':
        this.processUntokenizedOptimized(verseData.verseObjects, tokens, verseRef);
        break;
      case 'original':
        this.processOriginalLanguageOptimized(verseData.verseObjects, tokens, verseRef);
        break;
      case 'aligned':
        this.processAlignedLanguageOptimized(verseData.verseObjects, tokens, verseRef);
        break;
    }
    
    // Apply paragraph segments to tokens based on intra-verse paragraph markers
    this.applyParagraphSegments(verseData.verseObjects, tokens);
    
    
    return {
      number: verseNumber,
      text: text.trim(),
      tokens
    };
  }

  /**
   * Apply paragraph segments to tokens based on intra-verse paragraph markers
   */
  private applyParagraphSegments(verseObjects: USFMVerseObject[], tokens: OptimizedToken[]): void {
    if (!verseObjects || tokens.length === 0) return;
    
    // Find all paragraph markers in the verse
    const paragraphMarkers: {
      index: number;
      style: string;
      type: 'paragraph' | 'quote';
      indentLevel: number;
    }[] = [];
    
    verseObjects.forEach((obj, index) => {
      if (this.isParagraphObject(obj)) {
        paragraphMarkers.push({
          index,
          style: obj.tag,
          type: obj.tag.startsWith('q') ? 'quote' : 'paragraph',
          indentLevel: this.getIndentLevel(obj.tag)
        });
      }
    });
    
    if (paragraphMarkers.length === 0) return;
    
    // Create a more accurate mapping by analyzing text content positions
    const textContentPositions: number[] = [];
    let accumulatedTextLength = 0;
    
    verseObjects.forEach((obj, index) => {
      textContentPositions.push(accumulatedTextLength);
      
      if (obj.type === 'text') {
        accumulatedTextLength += (obj.text || '').length;
      } else if (obj.type === 'word') {
        accumulatedTextLength += (obj.text || '').length;
      } else if ('children' in obj && obj.children) {
        // Handle nested objects (like alignment markers with word children)
        obj.children.forEach((child: any) => {
          if (child.type === 'text' || child.type === 'word') {
            accumulatedTextLength += (child.text || '').length;
          }
        });
      }
    });
    
    // Apply paragraph segments to tokens based on text position
    let currentSegmentId = 1;
    let currentSegment = paragraphMarkers[0];
    let nextMarkerIndex = 1;
    let tokenTextPosition = 0;
    
    tokens.forEach((token, tokenIndex) => {
      // Calculate approximate text position for this token
      tokenTextPosition += token.text.length;
      
      // Find the verse object index that corresponds to this text position
      let correspondingVerseObjectIndex = 0;
      for (let i = 0; i < textContentPositions.length; i++) {
        if (tokenTextPosition >= textContentPositions[i]) {
          correspondingVerseObjectIndex = i;
        } else {
          break;
        }
      }
      
      // Check if we should switch to the next paragraph segment
      // Switch when we encounter a paragraph marker, but be more conservative
      if (nextMarkerIndex < paragraphMarkers.length) {
        const nextMarker = paragraphMarkers[nextMarkerIndex];
        const isAtMarkerPosition = correspondingVerseObjectIndex >= nextMarker.index;
        const isNotLastFewTokens = tokenIndex < tokens.length - 3; // Keep last 3 tokens with current segment
        const isSignificantProgress = tokenIndex > currentSegmentId * 3; // Ensure some progress before switching
        
        if (isAtMarkerPosition && isNotLastFewTokens && isSignificantProgress) {
          currentSegment = nextMarker;
          currentSegmentId++;
          nextMarkerIndex++;
        }
      }
      
      // Apply the current paragraph segment to this token
      token.paragraphSegment = {
        id: currentSegmentId,
        style: currentSegment.style as 'p' | 'q' | 'q1' | 'q2' | 'm' | 'mi' | 'pc' | 'pr' | 'cls',
        type: currentSegment.type,
        indentLevel: currentSegment.indentLevel
      };
    });
  }

  /**
   * Process untokenized content (Type 1)
   */
  private processUntokenizedOptimized(
    verseObjects: USFMVerseObject[],
    tokens: OptimizedToken[],
    verseRef: string
  ): void {
    // Process each verse object to handle paragraph markers and text content
    for (const obj of verseObjects) {
      if (this.isParagraphObject(obj)) {
        // Create paragraph marker token
        const paragraphId = Math.abs(obj.tag.charCodeAt(0)) + tokens.length + 10000; // Ensure unique ID
        tokens.push({
          id: paragraphId,
          text: '', // Paragraph markers don't have visible text
          type: 'paragraph-marker',
          paragraphMarker: {
            style: obj.tag as 'p' | 'q' | 'q1' | 'q2' | 'm' | 'mi' | 'pc' | 'pr' | 'cls',
            type: obj.tag.startsWith('q') ? 'quote' : 'paragraph',
            indentLevel: this.getIndentLevel(obj.tag),
            isNewParagraph: true
          }
        });
      } else if (this.isTextObject(obj)) {
        // Simple word splitting for text content
        const words = obj.text.split(/(\s+|[^\w\s])/);
        
        
        for (const word of words) {
          if (word.trim()) {
            // For untokenized content, calculate occurrence of this word in the verse so far
            const occurrence = tokens.filter(t => t.text === word && t.type === 'word').length + 1;
            
            const semanticId = generateSemanticId(
              word,
              verseRef,
              occurrence
            );
            
            
            tokens.push({
              id: semanticId,
              text: word,
              type: this.classifyTokenType(word)
            });
          }
        }
      }
    }
  }

  /**
   * Process original language content (Type 2)
   */
  private processOriginalLanguageOptimized(
    verseObjects: USFMVerseObject[],
    tokens: OptimizedToken[],
    verseRef: string
  ): void {
    const processObject = (obj: USFMVerseObject): void => {
      if (this.isParagraphObject(obj)) {
        // Create paragraph marker token
        const paragraphId = Math.abs(obj.tag.charCodeAt(0)) + tokens.length + 10000; // Ensure unique ID
        
        tokens.push({
          id: paragraphId,
          text: '', // Paragraph markers don't have visible text
          type: 'paragraph-marker',
          paragraphMarker: {
            style: obj.tag as 'p' | 'q' | 'q1' | 'q2' | 'm' | 'mi' | 'pc' | 'pr' | 'cls',
            type: obj.tag.startsWith('q') ? 'quote' : 'paragraph',
            indentLevel: this.getIndentLevel(obj.tag),
            isNewParagraph: true
          }
        });
      } else if (this.isWordObject(obj)) {
        const wordObj = obj as any; // Cast to access word properties
        
        // For original language, calculate occurrence since word objects don't have x-occurrence
        const wordText = wordObj.text || '';
        
        // Calculate occurrence by counting how many times this word has appeared in this verse
        const occurrence = tokens.filter(t => t.text === wordText && t.type === 'word').length + 1;
        
        const semanticId = generateSemanticId(
          wordText,
          verseRef,
          occurrence
        );
        
        
        tokens.push({
          id: semanticId,
          text: wordText,
          type: this.classifyTokenType(wordText),
          strong: wordObj.strong || '',
          lemma: wordObj.lemma || '',
          morph: wordObj.morph || wordObj['x-morph'] || ''
        });
      } else if (this.isTextObject(obj)) {
        // Handle punctuation and spaces
        const text = obj.text.trim();
        if (text) {
          // Generate a simple ID for text content
          const textId = Math.abs(text.charCodeAt(0)) + tokens.length;
          tokens.push({
            id: textId,
            text: text,
            type: this.classifyTokenType(text)
          });
        }
      }
    };
    
    verseObjects.forEach(processObject);
  }

  /**
   * Process aligned language content (Type 3)
   */
  private processAlignedLanguageOptimized(
    verseObjects: USFMVerseObject[],
    tokens: OptimizedToken[],
    verseRef: string
  ): void {
    let tokenId = 1;
    
    const processObject = (obj: USFMVerseObject, parentAlignmentIds?: number[]): void => {
      if (this.isParagraphObject(obj)) {
        // Create paragraph marker token
        tokens.push({
          id: tokenId++,
          text: '', // Paragraph markers don't have visible text
          type: 'paragraph-marker',
          paragraphMarker: {
            style: obj.tag as 'p' | 'q' | 'q1' | 'q2' | 'm' | 'mi' | 'pc' | 'pr' | 'cls',
            type: obj.tag.startsWith('q') ? 'quote' : 'paragraph',
            indentLevel: this.getIndentLevel(obj.tag),
            isNewParagraph: true
          }
        });
      } else if (this.isAlignmentObject(obj)) {
        const alignmentObj = obj as any; // Cast to access alignment properties
        
        // Collect alignment IDs (preserve parent alignments)
        const alignmentIds: number[] = [...(parentAlignmentIds || [])];
        
        // Add current alignment
        if (alignmentObj.content) {
          // For alignment objects, use the x-occurrence value from USFM markup
          const alignmentContent = alignmentObj.content;
          const occurrence = parseInt(alignmentObj.occurrence || '1');
          
          const semanticId = generateSemanticId(
            alignmentContent,
            verseRef,
            occurrence
          );
          alignmentIds.push(semanticId);
        }
        
        // Process children (word objects within alignment)
        if (alignmentObj.children) {
          for (const child of alignmentObj.children) {
            if (this.isParagraphObject(child)) {
              // Handle paragraph markers within alignments
              tokens.push({
                id: tokenId++,
                text: '', // Paragraph markers don't have visible text
                type: 'paragraph-marker',
                paragraphMarker: {
                  style: child.tag as 'p' | 'q' | 'q1' | 'q2' | 'm' | 'mi' | 'pc' | 'pr' | 'cls',
                  type: child.tag.startsWith('q') ? 'quote' : 'paragraph',
                  indentLevel: this.getIndentLevel(child.tag),
                  isNewParagraph: true
                }
              });
            } else if (this.isWordObject(child)) {
              tokens.push({
                id: tokenId++,
                text: child.text || '',
                type: this.classifyTokenType(child.text || ''),
                align: alignmentIds.length > 0 ? alignmentIds : undefined
              });
            } else if (this.isTextObject(child)) {
              const text = child.text.trim();
              if (text) {
                tokens.push({
                  id: tokenId++,
                  text: text,
                  type: this.classifyTokenType(text),
                  align: text.match(/[^\w\s]/) ? undefined : (alignmentIds.length > 0 ? alignmentIds : undefined)
                });
              }
            } else if (this.isAlignmentObject(child)) {
              // Handle nested alignments - pass current alignment IDs as parent context
              processObject(child, alignmentIds);
            }
          }
        }
      } else if (this.isTextObject(obj)) {
        const text = obj.text.trim();
        if (text) {
          tokens.push({
            id: tokenId++,
            text: text,
            type: this.classifyTokenType(text)
          });
        }
      }
    };
    
    verseObjects.forEach(obj => processObject(obj));
  }
}

// Create a default processor instance
export const usfmProcessor = new USFMProcessor();
