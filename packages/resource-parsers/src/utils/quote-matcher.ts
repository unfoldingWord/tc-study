/**
 * Quote Matching System for Original Language Texts
 * 
 * This system enables precise matching of quotes in original language texts
 * and finding corresponding aligned tokens in target language translations.
 * 
 * Universal TSV Resources Algorithm:
 * Works for all TSV resources (TWL, Translation Notes, etc.) that have:
 * - origWords/quote field (original language text)
 * - occurrence field (which instance of the text)
 * - reference field (chapter:verse)
 * 
 * See apps/tc-study/TWL_ALIGNMENT_SYSTEM.md for complete documentation.
 * 
 * Algorithm Flow:
 * STEP 1: TSV Quote → Original Language Tokens
 *   - Parse quote text and occurrence number
 *   - Normalize text (Hebrew vowel points, Greek diacritics)
 *   - Handle multi-part quotes with & separator
 *   - Match to original language tokens via text and occurrence
 * 
 * STEP 2: Original → Target Language Tokens
 *   - Extract semantic IDs from original tokens
 *   - Find target tokens with matching alignedOriginalWordIds
 *   - Return aligned target tokens for display
 */

import type { OptimizedChapter, OptimizedToken, OptimizedVerse } from '../parsers/usfm/usfm-processor';

export interface QuoteReference {
  book: string;
  startChapter: number;
  startVerse: number;
  endChapter?: number;
  endVerse?: number;
}

export interface QuoteMatch {
  quote: string;
  occurrence: number;
  tokens: OptimizedToken[];
  verseRef: string;
  startPosition: number;
  endPosition: number;
}

export interface QuoteMatchResult {
  success: boolean;
  matches: QuoteMatch[];
  totalTokens: OptimizedToken[];
  error?: string;
}

export interface AlignedTokenMatch {
  originalToken: OptimizedToken;
  alignedTokens: OptimizedToken[];
  verseRef: string;
}

export interface AlignmentMatchResult {
  success: boolean;
  alignedMatches: AlignedTokenMatch[];
  totalAlignedTokens: OptimizedToken[];
  error?: string;
}

export class QuoteMatcher {
  
  /**
   * STEP 1: Find original language tokens matching a TSV quote
   * 
   * Universal algorithm for TWL, Translation Notes, and other TSV resources.
   * 
   * Multi-part Quote Handling:
   * - Quotes can contain & separator: "Παῦλος & ἀπόστολος"
   * - First part uses specified occurrence (e.g., 2)
   * - Subsequent parts use occurrence 1, searching after previous match
   * - This allows precise matching of phrases across the verse
   * 
   * @param chapters - Optimized chapters from original language text (Hebrew Bible/Greek NT)
   * @param quote - Quote string (can contain & for multiple quotes)
   * @param occurrence - Which occurrence to find (parsed from TSV string field)
   * @param reference - Reference range to search in
   * @returns QuoteMatchResult with matched tokens including semantic IDs
   */
  findOriginalTokens(
    chapters: OptimizedChapter[],
    quote: string,
    occurrence: number,
    reference: QuoteReference
  ): QuoteMatchResult {
    try {
      // Validate quote is not empty
      if (!quote || quote.trim().length === 0) {
        return {
          success: false,
          matches: [],
          totalTokens: [],
          error: 'Quote cannot be empty'
        };
      }
      
      // Parse multiple quotes separated by &
      const quotes = quote.split('&').map(q => q.trim()).filter(q => q.length > 0);
      
      if (quotes.length === 0) {
        return {
          success: false,
          matches: [],
          totalTokens: [],
          error: 'No valid quotes found after parsing'
        };
      }
      
      // Get verses in the reference range
      const verses = this.getVersesInRange(chapters, reference);
      
      if (verses.length === 0) {
        return {
          success: false,
          matches: [],
          totalTokens: [],
          error: `No verses found in range ${this.formatReference(reference)}`
        };
      }
      
      // Find matches for each quote
      const matches: QuoteMatch[] = [];
      let searchStartVerse = 0; // Start searching from beginning for first quote
      let searchStartPosition = 0; // Position within verse to start searching from
      
      for (let i = 0; i < quotes.length; i++) {
        const currentQuote = quotes[i];
        const isFirstQuote = i === 0;
        const targetOccurrence = isFirstQuote ? occurrence : 1; // First quote uses specified occurrence, others use 1st
        
        const match = this.findSingleQuoteMatch(
          verses,
          currentQuote,
          targetOccurrence,
          searchStartVerse,
          searchStartPosition,
          reference
        );
        
        if (!match) {
          return {
            success: false,
            matches: [],
            totalTokens: [],
            error: `Quote "${currentQuote}" (occurrence ${targetOccurrence}) not found in ${this.formatReference(reference)}`
          };
        }
        
        matches.push(match);
        
        // Next quote should search after this match
        const matchVerseIndex = this.getVerseIndex(verses, match.verseRef);
        if (matchVerseIndex === searchStartVerse) {
          // Same verse - search after this match position
          searchStartPosition = match.endPosition;
        } else {
          // Different verse - search from beginning of next verse
          searchStartVerse = matchVerseIndex + 1;
          searchStartPosition = 0;
        }
      }
      
      // Combine all tokens
      const totalTokens = matches.flatMap(m => m.tokens);
      
      return {
        success: true,
        matches,
        totalTokens,
      };
      
    } catch (error) {
      return {
        success: false,
        matches: [],
        totalTokens: [],
        error: `Error processing quote: ${error instanceof Error ? error.message : String(error)}`
      };
    }
  }
  
  /**
   * Find aligned tokens in target language that correspond to original language tokens
   * 
   * @param originalTokens - Tokens from original language
   * @param targetChapters - Optimized chapters from aligned target language
   * @param reference - Reference range to search in
   * @returns AlignmentMatchResult with aligned tokens
   */
  findAlignedTokens(
    originalTokens: OptimizedToken[],
    targetChapters: OptimizedChapter[],
    reference: QuoteReference
  ): AlignmentMatchResult {
    try {
      const alignedMatches: AlignedTokenMatch[] = [];
      const targetVerses = this.getVersesInRange(targetChapters, reference);
      
      for (const originalToken of originalTokens) {
        // Find target verse that corresponds to original token's verse
        // For OptimizedToken, we need to construct the verse reference
        const originalVerseRef = this.constructVerseRef(originalToken, reference);
        const targetVerse = this.findCorrespondingVerse(targetVerses, originalVerseRef);
        
        if (!targetVerse || !targetVerse.tokens) {
          continue;
        }
        
        // Find aligned tokens based on Strong's numbers, lemmas, or content
        const alignedTokens = this.findAlignedTokensInVerse(originalToken, targetVerse);
        
        if (alignedTokens.length > 0) {
          alignedMatches.push({
            originalToken,
            alignedTokens,
            verseRef: originalVerseRef
          });
        }
      }
      
      const totalAlignedTokens = alignedMatches.flatMap(m => m.alignedTokens);
      
      return {
        success: true,
        alignedMatches,
        totalAlignedTokens
      };
      
    } catch (error) {
      return {
        success: false,
        alignedMatches: [],
        totalAlignedTokens: [],
        error: `Error finding aligned tokens: ${error instanceof Error ? error.message : String(error)}`
      };
    }
  }
  
  /**
   * Find a single quote match in verses
   */
  private findSingleQuoteMatch(
    verses: OptimizedVerse[],
    quote: string,
    occurrence: number,
    startVerseIndex = 0,
    startPosition = 0,
    reference: QuoteReference
  ): QuoteMatch | null {
    const normalizedQuote = this.normalizeText(quote);
    let foundOccurrences = 0;
    
    // Search through verses starting from startVerseIndex
    for (let i = startVerseIndex; i < verses.length; i++) {
      const verse = verses[i];
      
      if (!verse.tokens || verse.tokens.length === 0) {
        continue;
      }
      
      // Create searchable text from tokens
      const wordTokens = verse.tokens.filter(token => token.type === 'word');
      const verseText = wordTokens
        .map(token => this.normalizeText(token.text))
        .join(' ');
      
      // Find all occurrences of the quote in this verse
      const matches = this.findQuoteOccurrencesInText(verseText, normalizedQuote);
      
      for (const match of matches) {
        // Skip matches that are before our start position (for sequential quote matching)
        if (i === startVerseIndex && match.start < startPosition) {
          continue;
        }
        
        foundOccurrences++;
        
        if (foundOccurrences === occurrence) {
          // Found the target occurrence, extract tokens
          const tokens = this.extractTokensForMatch(verse, match.start, match.end);
          
          return {
            quote,
            occurrence,
            tokens,
            verseRef: `${reference.book} ${reference.startChapter}:${verse.number}`, // Construct reference from book and verse info
            startPosition: match.start,
            endPosition: match.end
          };
        }
      }
    }
    
    return null;
  }
  
  /**
   * Find all occurrences of a quote in text
   * Uses both exact matching and flexible token-based matching for Hebrew
   */
  private findQuoteOccurrencesInText(text: string, quote: string): {start: number, end: number}[] {
    const matches: {start: number, end: number}[] = [];
    
    // Safety check: empty quote would cause infinite loop
    if (!quote || quote.length === 0) {
      return matches;
    }
    
    // Try exact substring matching first
    let startIndex = 0;
    while (true) {
      const index = text.indexOf(quote, startIndex);
      if (index === -1) break;
      
      matches.push({
        start: index,
        end: index + quote.length
      });
      
      startIndex = index + 1;
    }
    
    // If no exact matches found and this is Hebrew text, try flexible matching
    if (matches.length === 0 && this.isHebrewText(quote)) {
      const flexibleMatches = this.findFlexibleHebrewMatches(text, quote);
      matches.push(...flexibleMatches);
    }
    
    return matches;
  }

  /**
   * Find flexible matches for Hebrew text where words might be in different order
   * or separated by other words
   */
  private findFlexibleHebrewMatches(text: string, quote: string): {start: number, end: number}[] {
    const matches: {start: number, end: number}[] = [];
    
    // Split quote into individual words
    const quoteWords = quote.split(/\s+/).filter(word => word.trim().length > 0);
    if (quoteWords.length === 0) return matches;
    
    // Split text into words with positions
    const textWords: {word: string, start: number, end: number}[] = [];
    const words = text.split(/\s+/);
    let currentPos = 0;
    
    for (const word of words) {
      const wordStart = text.indexOf(word, currentPos);
      if (wordStart !== -1) {
        textWords.push({
          word: word,
          start: wordStart,
          end: wordStart + word.length
        });
        currentPos = wordStart + word.length;
      }
    }
    
    // Try to find all quote words in the text (allowing for different order)
    const foundWords: {word: string, start: number, end: number}[] = [];
    
    for (const quoteWord of quoteWords) {
      const matchingTextWord = textWords.find(textWord => 
        this.normalizeText(textWord.word) === this.normalizeText(quoteWord)
      );
      
      if (matchingTextWord) {
        foundWords.push(matchingTextWord);
      }
    }
    
    // If we found all words, create a match spanning from first to last word
    if (foundWords.length === quoteWords.length && foundWords.length > 0) {
      foundWords.sort((a, b) => a.start - b.start);
      matches.push({
        start: foundWords[0].start,
        end: foundWords[foundWords.length - 1].end
      });
    }
    
    return matches;
  }
  
  /**
   * Extract tokens that correspond to a text match
   * 
   * Maps string positions from normalized text back to original tokens.
   * CRITICAL: Position calculation must match how verseText is constructed (join(' '))
   */
  private extractTokensForMatch(
    verse: OptimizedVerse,
    startPos: number,
    endPos: number
  ): OptimizedToken[] {
    if (!verse.tokens) return [];
    
    const wordTokens = verse.tokens.filter(token => token.type === 'word');
    const tokens: OptimizedToken[] = [];
    let currentPos = 0;
    
    // Track occurrence counts for each word in the verse (up to current position)
    const occurrenceCounts = new Map<string, number>();
    
    for (let i = 0; i < wordTokens.length; i++) {
      const token = wordTokens[i];
      const tokenText = this.normalizeText(token.text);
      const tokenStart = currentPos;
      const tokenEnd = currentPos + tokenText.length;
      
      // Count occurrence for this word (using actual text, not normalized)
      const wordKey = token.text;
      const currentCount = occurrenceCounts.get(wordKey) || 0;
      const occurrence = currentCount + 1;
      occurrenceCounts.set(wordKey, occurrence);
      
      // Check if this token overlaps with the match range
      if (tokenEnd > startPos && tokenStart < endPos) {
        // Add token with calculated occurrence number
        tokens.push({
          ...token,
          occurrence, // Add the verse-wide occurrence number
        });
      }
      
      // Move to next token position
      // Add token length + 1 for space (except after last token)
      currentPos = tokenEnd + (i < wordTokens.length - 1 ? 1 : 0);
    }
    
    return tokens;
  }
  
  /**
   * Construct verse reference from token and reference context
   */
  private constructVerseRef(token: OptimizedToken, reference: QuoteReference): string {
    // For now, we'll need to track this information differently
    // This is a limitation of the current approach - we need verse context
    return `${reference.book} ${reference.startChapter}:${reference.startVerse}`;
  }

  /**
   * Find aligned tokens in a target verse based on original token
   */
  private findAlignedTokensInVerse(
    originalToken: OptimizedToken,
    targetVerse: OptimizedVerse
  ): OptimizedToken[] {
    if (!targetVerse.tokens) return [];
    
    const alignedTokens: OptimizedToken[] = [];
    
    for (const targetToken of targetVerse.tokens) {
      if (!targetToken.align) continue;
      
      // Check if target token is aligned to the original token using semantic IDs
      const isAligned = this.isTokenAlignedBySemantic(originalToken, targetToken);
      
      if (isAligned) {
        alignedTokens.push(targetToken);
      }
    }
    
    return alignedTokens;
  }
  
  /**
   * Check if a target token is aligned to an original token using semantic IDs
   * Uses semantic IDs for precise cross-panel communication
   */
  private isTokenAlignedBySemantic(originalToken: OptimizedToken, targetToken: OptimizedToken): boolean {
    if (!targetToken.align) return false;
    
    // Primary method: Check if target token's align array contains the original token's semantic ID
    return targetToken.align.includes(originalToken.id);
  }
  
  /**
   * Get verses within a reference range
   */
  private getVersesInRange(chapters: OptimizedChapter[], reference: QuoteReference): OptimizedVerse[] {
    const verses: OptimizedVerse[] = [];
    
    for (const chapter of chapters) {
      // Check if chapter is in range
      const isInChapterRange = 
        chapter.number >= reference.startChapter &&
        chapter.number <= (reference.endChapter || reference.startChapter);
      
      if (!isInChapterRange) continue;
      
      for (const verse of chapter.verses) {
        let isInVerseRange = false;
        
        if (reference.startChapter === (reference.endChapter || reference.startChapter)) {
          // Same chapter range
          isInVerseRange = 
            verse.number >= reference.startVerse &&
            verse.number <= (reference.endVerse || reference.startVerse);
        } else {
          // Multi-chapter range
          if (chapter.number === reference.startChapter) {
            isInVerseRange = verse.number >= reference.startVerse;
          } else if (chapter.number === reference.endChapter) {
            isInVerseRange = verse.number <= (reference.endVerse || 999);
          } else {
            isInVerseRange = true; // Middle chapters, all verses
          }
        }
        
        if (isInVerseRange) {
          verses.push(verse);
        }
      }
    }
    
    return verses;
  }
  
  /**
   * Find corresponding verse in target language
   */
  private findCorrespondingVerse(verses: OptimizedVerse[], originalVerseRef: string): OptimizedVerse | null {
    // Parse original verse reference (e.g., "3JN 1:1")
    const refParts = originalVerseRef.split(' ');
    if (refParts.length !== 2) return null;
    
    const [, chapterVerse] = refParts;
    const [, verse] = chapterVerse.split(':').map(Number);
    
    // Find matching verse in target by verse number
    return verses.find(v => v.number === verse) || null;
  }
  
  /**
   * Get verse index in array
   */
  private getVerseIndex(verses: OptimizedVerse[], verseRef: string): number {
    // Parse verse reference to get verse number
    const refParts = verseRef.split(' ');
    if (refParts.length !== 2) return -1;
    
    const [, chapterVerse] = refParts;
    const [, verse] = chapterVerse.split(':').map(Number);
    
    return verses.findIndex(v => v.number === verse);
  }
  
  /**
   * Normalize text for comparison (handles Hebrew, Greek and other Unicode text)
   * 
   * Critical for matching TSV quotes to scripture tokens because:
   * - Hebrew: Removes vowel points, cantillation marks, maqaf
   * - Greek: Removes diacritics, normalizes case
   * - All: Normalizes whitespace and punctuation
   * 
   * Example: "Παῦλος" → "παῦλος" (lowercase)
   * Example: Hebrew with nikkud → consonants only
   */
  private normalizeText(text: string): string {
    // Handle Hebrew text with special normalization
    if (this.isHebrewText(text)) {
      return this.normalizeHebrewText(text);
    }
    
    // Handle Greek and other texts
    return text
      .toLowerCase()
      .replace(/[^\p{L}\p{N}\s]/gu, '') // Remove punctuation but keep Unicode letters and numbers
      .replace(/\s+/g, ' ')             // Normalize whitespace
      .trim();
  }

  /**
   * Check if text contains Hebrew characters
   */
  private isHebrewText(text: string): boolean {
    // Hebrew Unicode range: U+0590-U+05FF
    return /[\u0590-\u05FF]/.test(text);
  }

  /**
   * Normalize Hebrew text by removing diacritics and punctuation
   */
  private normalizeHebrewText(text: string): string {
    return text
      // Replace maqaf (־) with space to separate words properly
      .replace(/־/g, ' ') // Convert maqaf to space
      // Remove other Hebrew punctuation marks
      .replace(/[׃׀]/g, '') // Remove sof pasuq (׃), paseq (׀)
      // Remove cantillation marks (trope/teamim) - these cause most matching issues
      .replace(/[\u0591-\u05AF\u05BD\u05BF\u05C1-\u05C2\u05C4-\u05C5\u05C7]/g, '')
      // Remove some vowel points that cause issues, but keep others for accuracy
      .replace(/[\u05B0\u05B1\u05B4\u05B5\u05B8\u05B9\u05BB\u05BC]/g, '')
      // Remove USFM word separators
      .replace(/⁠/g, '') // Remove word joiner characters (U+2060)
      // Normalize whitespace
      .replace(/\s+/g, ' ')
      .trim()
      .toLowerCase();
  }
  
  /**
   * Format reference for display
   */
  private formatReference(reference: QuoteReference): string {
    const { book, startChapter, startVerse, endChapter, endVerse } = reference;
    
    if (endChapter && endChapter !== startChapter) {
      return `${book} ${startChapter}:${startVerse}-${endChapter}:${endVerse || ''}`;
    } else if (endVerse && endVerse !== startVerse) {
      return `${book} ${startChapter}:${startVerse}-${endVerse}`;
    } else {
      return `${book} ${startChapter}:${startVerse}`;
    }
  }
}
