/**
 * USFM Processor
 * 
 * Parses USFM text into structured, queryable format
 * Compatible with @bt-toolkit and @bt-synergy ecosystems
 */

import * as usfm from 'usfm-js'
import type {
  ProcessedChapter,
  ProcessedParagraph,
  ProcessedScripture,
  ProcessedVerse,
  TranslatorSection,
  USFMAlignmentObject,
  USFMChapter,
  USFMDocument,
  USFMHeader,
  USFMProcessingOptions,
  USFMTextObject,
  USFMVerse,
  USFMVerseObject,
  USFMWordObject,
  WordAlignment,
  WordToken
} from './types'

export class USFMProcessor {
  private readonly PROCESSING_VERSION = '1.0.0-synergy'

  /**
   * Process USFM text into structured format (bt-toolkit compatible)
   */
  async processUSFM(
    usfmText: string,
    bookCode: string,
    bookName: string,
    options: USFMProcessingOptions = {}
  ): Promise<ProcessedScripture> {
    const startTime = Date.now()
    
    // Set defaults
    const opts: Required<USFMProcessingOptions> = {
      language: options.language || 'en',
      includeWordTokens: options.includeWordTokens !== false,
      includeAlignments: options.includeAlignments !== false,
      includeParagraphs: options.includeParagraphs !== false,
      generateTokenIds: options.generateTokenIds !== false
    }

    if (opts.includeWordTokens) {
      console.log(`🔄 Processing USFM for ${bookCode} with word tokenization...`)
    }

    // Parse USFM to JSON
    const usfmJson = usfm.toJSON(usfmText) as USFMDocument

    // Extract headers
    const headers = this.extractHeaders(usfmJson)

    // Process chapters
    const chapters = this.processChapters(usfmJson, bookCode, bookName, opts)

    // Extract translator sections (\ts\* markers)
    const translatorSections = this.extractTranslatorSections(usfmJson, bookCode)

    // Extract global alignments (if requested)
    const alignments = opts.includeAlignments
      ? this.extractWordAlignments(usfmJson, bookCode)
      : []

    // Calculate totals
    const totalVerses = chapters.reduce((sum, ch) => sum + ch.verseCount, 0)
    const totalParagraphs = chapters.reduce((sum, ch) => sum + ch.paragraphCount, 0)
    const totalWordTokens = opts.includeWordTokens
      ? chapters.reduce((sum, ch) => 
          sum + ch.verses.reduce((vSum, v) => vSum + (v.wordTokens?.length || 0), 0), 0)
      : 0

    // Generate chapter-verse map for quick lookups
    // Object with chapter numbers as keys, verse counts as values
    // e.g., { 1: 31, 2: 25, ... } means chapter 1 has 31 verses, chapter 2 has 25, etc.
    const chapterVerseMap: Record<number, number> = {}
    chapters.forEach(ch => {
      chapterVerseMap[ch.number] = ch.verseCount
    })

    // Generate metadata
    const processingDuration = Date.now() - startTime
    const metadata = {
      bookCode,
      bookName,
      processingDate: new Date().toISOString(),
      processingDuration,
      version: this.PROCESSING_VERSION,
      hasAlignments: alignments.length > 0,
      hasSections: translatorSections.length > 0,
      hasWordTokens: opts.includeWordTokens && totalWordTokens > 0,
      totalChapters: chapters.length,
      totalVerses,
      totalParagraphs,
      chapterVerseMap,  // ✅ Quick chapter → verse count lookup
      statistics: {
        totalChapters: chapters.length,
        totalVerses,
        totalParagraphs,
        totalSections: translatorSections.length,
        totalAlignments: alignments.length,
        totalWordTokens: opts.includeWordTokens ? totalWordTokens : undefined
      }
    }



    const mapPreview = Object.entries(chapterVerseMap).slice(0, 5).map(([ch, v]) => `${ch}:${v}`).join(', ')


    return {
      book: bookName,
      bookCode,
      metadata,
      chapters,
      translatorSections: translatorSections.length > 0 ? translatorSections : undefined,
      alignments: alignments.length > 0 ? alignments : undefined
    }
  }

  /**
   * Extract headers from USFM document
   */
  private extractHeaders(usfmJson: USFMDocument): USFMHeader[] {
    return usfmJson.headers || []
  }

  /**
   * Process all chapters
   */
  private processChapters(
    usfmJson: USFMDocument,
    bookCode: string,
    bookName: string,
    options: Required<USFMProcessingOptions>
  ): ProcessedChapter[] {
    const chapters: ProcessedChapter[] = []
    const chapterData = usfmJson.chapters || {}

    for (const chapterNum in chapterData) {
      const chapter = this.processChapter(
        parseInt(chapterNum),
        chapterData[chapterNum],
        bookCode,
        bookName,
        options
      )
      chapters.push(chapter)
    }

    return chapters.sort((a, b) => a.number - b.number)
  }

  /**
   * Process a single chapter
   */
  private processChapter(
    chapterNumber: number,
    chapterData: USFMChapter,
    bookCode: string,
    bookName: string,
    options: Required<USFMProcessingOptions>
  ): ProcessedChapter {
    const verses: ProcessedVerse[] = []
    const paragraphs: ProcessedParagraph[] = []

    // Process verses
    for (const verseNum in chapterData) {
      if (verseNum === 'front') continue // Skip front matter

      const verse = this.processVerse(
        parseInt(verseNum),
        chapterData[verseNum],
        chapterNumber,
        bookCode,
        bookName,
        options
      )
      verses.push(verse)
    }

    // Extract paragraphs if requested
    if (options.includeParagraphs) {
      // TODO: Implement paragraph extraction
      // This requires analyzing verse objects for paragraph markers
    }

    return {
      number: chapterNumber,
      verseCount: verses.length,
      paragraphCount: paragraphs.length,
      verses: verses.sort((a, b) => a.number - b.number),
      paragraphs
    }
  }

  /**
   * Process a single verse
   */
  private processVerse(
    verseNumber: number,
    verseData: USFMVerse,
    chapterNumber: number,
    bookCode: string,
    bookName: string,
    options: Required<USFMProcessingOptions>
  ): ProcessedVerse {
    const reference = `${bookCode} ${chapterNumber}:${verseNumber}`
    const verseObjects = verseData.verseObjects || []

    // Extract plain text
    const text = this.extractPlainText(verseObjects)

    // Extract alignments
    const alignments = options.includeAlignments
      ? this.extractAlignments(verseObjects, reference)
      : undefined

    // Generate word tokens
    const wordTokens = options.includeWordTokens
      ? this.generateWordTokens(verseObjects, reference, options.generateTokenIds)
      : undefined

    return {
      number: verseNumber,
      text,
      reference,
      alignments,
      wordTokens
    }
  }

  /**
   * Extract plain text from verse objects
   */
  private extractPlainText(verseObjects: USFMVerseObject[]): string {
    let text = ''

    for (const obj of verseObjects) {
      if (obj.type === 'text') {
        text += (obj as USFMTextObject).text
      } else if (obj.type === 'word') {
        text += (obj as USFMWordObject).text
      } else if (obj.type === 'milestone' && obj.tag === 'zaln') {
        const zaln = obj as USFMAlignmentObject
        if (zaln.children) {
          for (const child of zaln.children) {
            const childObj = child as any
            if (childObj.type === 'word') {
              text += childObj.text
            } else if (childObj.type === 'text') {
              text += childObj.text
            } else if (childObj.type === 'milestone' && childObj.tag === 'zaln') {
              // ✅ Recursively handle nested alignment objects
              text += this.extractTextFromAlignmentHelper(childObj as USFMAlignmentObject)
            }
          }
        }
      } else if (obj.type === 'paragraph' || obj.type === 'quote') {
        // Paragraph markers don't add to text
        text += ' '
      }
    }

    return text.trim()
  }

  /**
   * Helper method to recursively extract text from alignment objects (handles nested alignments)
   */
  private extractTextFromAlignmentHelper(alignmentObj: USFMAlignmentObject): string {
    let text = ''
    if (alignmentObj.children) {
      for (const child of alignmentObj.children) {
        const childObj = child as any
        if (childObj.type === 'text') {
          text += childObj.text
        } else if (childObj.type === 'word') {
          text += childObj.text
        } else if (childObj.type === 'milestone' && childObj.tag === 'zaln') {
          // Recursively handle nested alignments
          text += this.extractTextFromAlignmentHelper(childObj as USFMAlignmentObject)
        }
      }
    }
    return text
  }

  /**
   * Extract word alignments from verse objects
   */
  private extractAlignments(
    verseObjects: USFMVerseObject[],
    verseRef: string
  ): WordAlignment[] {
    const alignments: WordAlignment[] = []

    for (const obj of verseObjects) {
      if (obj.type === 'milestone' && obj.tag === 'zaln') {
        const zaln = obj as USFMAlignmentObject
        
        const targetWords: string[] = []
        if (zaln.children) {
          for (const child of zaln.children) {
            if (child.type === 'word') {
              targetWords.push(child.text)
            }
          }
        }

        alignments.push({
          verseRef,
          sourceWords: [zaln.content || ''],
          targetWords,
          alignmentData: [{
            strong: zaln.strong || '',
            lemma: zaln.lemma || '',
            morph: zaln.morph || '',
            occurrence: zaln.occurrence || '1',
            occurrences: zaln.occurrences || '1'
          }]
        })
      }
    }

    return alignments
  }

  /**
   * Generate word tokens for highlighting
   */
  private generateWordTokens(
    verseObjects: USFMVerseObject[],
    verseRef: string,
    generateIds: boolean
  ): WordToken[] {
    const tokens: WordToken[] = []
    let position = 0
    const wordCounts = new Map<string, number>()
    const wordOccurrences = new Map<string, number>()

    // Helper function to recursively count words in nested alignments
    const countWordsRecursive = (objects: any[]) => {
      for (const obj of objects) {
        if (obj.type === 'milestone' && obj.tag === 'zaln') {
          const zaln = obj as USFMAlignmentObject
          if (zaln.children) {
            countWordsRecursive(zaln.children)
          }
        } else if (obj.type === 'word') {
          const word = obj.text.toLowerCase()
          wordCounts.set(word, (wordCounts.get(word) || 0) + 1)
        }
      }
    }

    // First pass: count occurrences (including nested alignments)
    countWordsRecursive(verseObjects)

    // Helper function to recursively process alignment children (including nested alignments)
    const processAlignmentChildren = (
      children: any[], 
      zaln: USFMAlignmentObject,
      alignmentId: string | undefined
    ) => {
      for (const child of children) {
        if (child.type === 'word') {
          const word = child.text
          const wordLower = word.toLowerCase()
          const occurrence = (wordOccurrences.get(wordLower) || 0) + 1
          wordOccurrences.set(wordLower, occurrence)

          tokens.push({
            uniqueId: generateIds ? this.generateId(verseRef, word, occurrence) : '',
            content: word,
            occurrence,
            totalOccurrences: wordCounts.get(wordLower) || 1,
            verseRef,
            position: {
              start: position,
              end: position + word.length
            },
            type: 'word',
            isHighlightable: true,
            alignmentId,
            alignment: {
              strong: zaln.strong || '',
              lemma: zaln.lemma || '',
              morph: zaln.morph || '',
              occurrence: zaln.occurrence || '1',
              occurrences: zaln.occurrences || '1',
              content: zaln.content || ''
            }
          })

          position += word.length
        } else if (child.type === 'text') {
          const text = child.text
          tokens.push({
            uniqueId: generateIds ? this.generateId(verseRef, 'text', position) : '',
            content: text,
            occurrence: 0,
            totalOccurrences: 0,
            verseRef,
            position: {
              start: position,
              end: position + text.length
            },
            type: 'text',
            isHighlightable: false
          })
          position += text.length
        } else if (child.type === 'milestone' && child.tag === 'zaln') {
          // ✅ Recursively handle nested alignment objects
          const nestedZaln = child as USFMAlignmentObject
          const nestedAlignmentId = generateIds ? this.generateId(verseRef, nestedZaln.content) : undefined
          if (nestedZaln.children) {
            processAlignmentChildren(nestedZaln.children, nestedZaln, nestedAlignmentId)
          }
        }
      }
    }

    // Second pass: generate tokens
    for (const obj of verseObjects) {
      if (obj.type === 'milestone' && obj.tag === 'zaln') {
        const zaln = obj as USFMAlignmentObject
        const alignmentId = generateIds ? this.generateId(verseRef, zaln.content) : undefined

        if (zaln.children) {
          processAlignmentChildren(zaln.children, zaln, alignmentId)
        }
      } else if (obj.type === 'text') {
        const text = (obj as USFMTextObject).text
        tokens.push({
          uniqueId: generateIds ? this.generateId(verseRef, 'text', position) : '',
          content: text,
          occurrence: 0,
          totalOccurrences: 0,
          verseRef,
          position: {
            start: position,
            end: position + text.length
          },
          type: 'text',
          isHighlightable: false
        })
        position += text.length
      } else if (obj.type === 'word') {
        const word = (obj as USFMWordObject).text
        const wordLower = word.toLowerCase()
        const occurrence = (wordOccurrences.get(wordLower) || 0) + 1
        wordOccurrences.set(wordLower, occurrence)

        tokens.push({
          uniqueId: generateIds ? this.generateId(verseRef, word, occurrence) : '',
          content: word,
          occurrence,
          totalOccurrences: wordCounts.get(wordLower) || 1,
          verseRef,
          position: {
            start: position,
            end: position + word.length
          },
          type: 'word',
          isHighlightable: true
        })
        position += word.length
      }
    }

    return tokens
  }

  /**
   * Generate a unique ID for a token
   */
  private generateId(verseRef: string, content: string, occurrence?: number): string {
    const base = `${verseRef}-${content.toLowerCase().replace(/[^a-z0-9]/g, '_')}`
    return occurrence !== undefined ? `${base}-${occurrence}` : base
  }

  /**
   * Extract translator sections (marked with \ts\* in USFM)
   * Used for section-based navigation
   */
  private extractTranslatorSections(usfmJson: USFMDocument, bookCode: string): TranslatorSection[] {
    const sections: TranslatorSection[] = []
    let currentSection: {
      startChapter: number
      startVerse: number
      startVerseString: string
    } | null = null

    // Check for pre-chapter \ts\* markers in headers
    if (usfmJson.headers) {
      const headersJson = JSON.stringify(usfmJson.headers)
      if (headersJson.includes('"tag":"ts"') || headersJson.includes('"tag":"ts\\\\*"')) {

        currentSection = {
          startChapter: 1,
          startVerse: 1,
          startVerseString: '1'
        }
      }
    }

    // Find the last chapter and verse for final section handling
    let lastChapter = 0
    let lastVerse = 0
    for (const [chapterNumStr, chapterData] of Object.entries(usfmJson.chapters || {})) {
      const chapterNum = parseInt(chapterNumStr)
      if (isNaN(chapterNum)) continue

      lastChapter = Math.max(lastChapter, chapterNum)

      for (const [verseNumStr] of Object.entries(chapterData)) {
        const parsedVerse = this.parseVerseNumber(verseNumStr)
        if (parsedVerse.number < 1) continue

        if (chapterNum === lastChapter) {
          lastVerse = Math.max(lastVerse, parsedVerse.number)
        }
      }
    }

    console.log(`   Book ends at ${lastChapter}:${lastVerse}`)

    // Process chapters and verses to find \ts\* markers
    for (const [chapterNumStr, chapterData] of Object.entries(usfmJson.chapters || {})) {
      const chapterNum = parseInt(chapterNumStr)
      if (isNaN(chapterNum)) continue

      for (const [verseNumStr, verseData] of Object.entries(chapterData)) {
        const parsedVerse = this.parseVerseNumber(verseNumStr)
        if (parsedVerse.number < 1) continue

        const rawContent = JSON.stringify(verseData)

        // Check for translation section markers in the parsed JSON
        // \ts\* markers get parsed as {"tag": "ts\\*"}
        const hasTranslationSection = rawContent.includes('"tag":"ts\\\\*"') || 
                                      rawContent.includes('"tag":"ts"')

        if (hasTranslationSection) {

          // Close the previous section
          if (currentSection) {
            const endChapter = chapterNum
            const endVerse = parsedVerse.number > 1 ? parsedVerse.number - 1 : parsedVerse.number

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
                verse: endVerse,
                reference: {
                  chapter: endChapter.toString(),
                  verse: endVerse.toString()
                }
              }
            })
          }

          // Start new section
          currentSection = {
            startChapter: chapterNum,
            startVerse: parsedVerse.number,
            startVerseString: verseNumStr
          }
        }
      }
    }

    // Handle the final section (ends at the last verse of the book)
    if (currentSection) {
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
            verse: lastVerse.toString()
          }
        }
      })
    }

    sections.forEach((section, index) => {
      const startRef = `${bookCode} ${section.start.reference.chapter}:${section.start.reference.verse}`
      const endRef = `${bookCode} ${section.end.reference.chapter}:${section.end.reference.verse}`
    })

    return sections
  }

  /**
   * Extract word alignments at book level
   */
  private extractWordAlignments(usfmJson: USFMDocument, bookCode: string): WordAlignment[] {
    const alignments: WordAlignment[] = []

    for (const [chapterNumStr, chapterData] of Object.entries(usfmJson.chapters || {})) {
      const chapterNum = parseInt(chapterNumStr)
      if (isNaN(chapterNum)) continue

      for (const [verseNumStr, verseData] of Object.entries(chapterData)) {
        const parsedVerse = this.parseVerseNumber(verseNumStr)
        if (parsedVerse.number < 1) continue

        const verseAlignments = this.extractVerseAlignments(
          verseData,
          chapterNum,
          parsedVerse.number,
          bookCode
        )
        alignments.push(...verseAlignments)
      }
    }

    return alignments
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
    const alignments: WordAlignment[] = []
    const verseRef = `${bookCode} ${chapterNum}:${verseNum}`

    if (!verseData.verseObjects) return alignments

    for (const verseObj of verseData.verseObjects) {
      if (verseObj.type === 'milestone' && (verseObj as any).tag === 'zaln') {
        const alignment = this.extractAlignmentFromObject(verseObj as USFMAlignmentObject, verseRef)
        if (alignment) {
          alignments.push(alignment)
        }
      }
    }

    return alignments
  }

  /**
   * Extract alignment data from a single alignment object
   */
  private extractAlignmentFromObject(
    alignmentObj: USFMAlignmentObject,
    verseRef: string
  ): WordAlignment | null {
    const targetWords: string[] = []
    const sourceWords: string[] = []
    const alignmentData: Array<{
      strong: string
      lemma: string
      morph: string
      occurrence: string
      occurrences: string
    }> = []

    // Add this level's alignment data
    if (alignmentObj.content || alignmentObj.strong) {
      sourceWords.push(alignmentObj.content || '')
      alignmentData.push({
        strong: alignmentObj.strong || '',
        lemma: alignmentObj.lemma || '',
        morph: alignmentObj.morph || '',
        occurrence: alignmentObj.occurrence || '',
        occurrences: alignmentObj.occurrences || ''
      })
    }

    if (alignmentObj.children) {
      for (const child of alignmentObj.children) {
        const childObj = child as any
        if (childObj.type === 'word') {
          targetWords.push(childObj.text)
        } else if (childObj.type === 'text') {
          const text = childObj.text.trim()
          if (text) {
            targetWords.push(text)
          }
        } else if (childObj.type === 'milestone' && childObj.tag === 'zaln') {
          // Handle nested alignments
          const nested = this.extractAlignmentFromObject(childObj as USFMAlignmentObject, verseRef)
          if (nested) {
            targetWords.push(...nested.targetWords)
            sourceWords.push(...nested.sourceWords)
            alignmentData.push(...nested.alignmentData)
          }
        }
      }
    }

    // Create alignment if we have target words
    if (targetWords.length > 0) {
      return {
        verseRef,
        sourceWords,
        targetWords,
        alignmentData
      }
    }

    return null
  }

  /**
   * Parse verse number that may be a span (e.g., "1-2") or single number (e.g., "3")
   */
  private parseVerseNumber(verseString: string): {
    number: number
    originalVerseString?: string
  } {
    const trimmed = verseString.trim()

    // Check if it's a span (contains a dash)
    if (trimmed.includes('-')) {
      const parts = trimmed.split('-')
      if (parts.length === 2) {
        const start = parseInt(parts[0].trim())
        if (!isNaN(start)) {
          return {
            number: start, // Use the start number as the primary number
            originalVerseString: trimmed
          }
        }
      }
    }

    // Single verse number
    const singleNumber = parseInt(trimmed)
    if (!isNaN(singleNumber)) {
      return {
        number: singleNumber,
        originalVerseString: trimmed
      }
    }

    // Fallback for invalid verse numbers
    return {
      number: 1,
      originalVerseString: trimmed
    }
  }
}
