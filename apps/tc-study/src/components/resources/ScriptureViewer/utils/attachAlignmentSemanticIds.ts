/**
 * Attach alignment semantic IDs to target language tokens
 * 
 * The USFM processor extracts alignments but doesn't populate alignedOriginalWordIds
 * on individual tokens. This utility bridges that gap by generating uniqueIds
 * for the original language words and attaching them to target language tokens.
 * 
 * Uses the same uniqueId format as the USFM processor to match original language tokens.
 */

import type { ProcessedScripture, ProcessedVerse } from '@bt-synergy/usfm-processor'

/**
 * Generate a semantic ID without sanitization
 * Format: verseRef:content:occurrence (preserves Unicode characters)
 * This matches the mobile app's approach
 */
function generateSemanticId(verseRef: string, content: string, occurrence: number): string {
  return `${verseRef}:${content}:${occurrence}`
}

/**
 * Attach alignment semantic IDs to verses in a target language resource
 * Mutates the verses in place for performance
 */
export function attachAlignmentSemanticIds(
  scripture: ProcessedScripture,
  verses: ProcessedVerse[]
): void {
  if (!scripture.alignments || scripture.alignments.length === 0) {
    return
  }

  // Build a map of alignments by verse
  // Key: verseRef
  // Value: array of alignment entries for that verse
  const alignmentsByVerse = new Map<string, typeof scripture.alignments>()
  
  for (const alignment of scripture.alignments) {
    const verseRef = alignment.verseRef
    if (!alignmentsByVerse.has(verseRef)) {
      alignmentsByVerse.set(verseRef, [])
    }
    alignmentsByVerse.get(verseRef)!.push(alignment)
  }

  // Now attach semantic IDs to tokens in verses
  // Process verse by verse, matching tokens to alignments by occurrence
  let attachedCount = 0
  for (const verse of verses) {
    if (!verse.wordTokens) continue

    const verseAlignments = alignmentsByVerse.get(verse.reference) || []
    if (verseAlignments.length === 0) continue

    // Track which alignment entries we've used for each target word
    // Key: lowercased target word
    // Value: array of (alignment, used) pairs
    const alignmentUsage = new Map<string, Array<{ alignment: typeof verseAlignments[0], used: boolean }>>()
    
    for (const alignment of verseAlignments) {
      for (const targetWord of alignment.targetWords) {
        const key = targetWord.toLowerCase()
        if (!alignmentUsage.has(key)) {
          alignmentUsage.set(key, [])
        }
        alignmentUsage.set(key, [...alignmentUsage.get(key)!, { alignment, used: false }])
      }
    }

    // Track occurrence of each word for debug logging
    const wordOccurrences = new Map<string, number>()

    for (const token of verse.wordTokens) {
      if (token.type !== 'word') continue

      const tokenContent = token.content.toLowerCase()
      const currentOcc = (wordOccurrences.get(tokenContent) || 0) + 1
      wordOccurrences.set(tokenContent, currentOcc)
      
      const availableAlignments = alignmentUsage.get(tokenContent) || []

      // Find the FIRST unused alignment for this token
      const matchingEntry = availableAlignments.find(entry => !entry.used)
      
      if (matchingEntry) {
        matchingEntry.used = true // Mark as used for this occurrence
        
        const alignment = matchingEntry.alignment
        const sourceWords = alignment.sourceWords || []
        
        // Generate semantic IDs for ALL source words in this alignment
        // CRITICAL: Use the actual inflected text (content) from zaln, NOT the lemma!
        // TWL origWords contain the inflected forms as they appear in the text
        // Example: TWL has "Θεοῦ" (genitive), zaln.content has "Θεοῦ", zaln.lemma has "θεός"
        const sourceSemanticIds = sourceWords.map((word, idx) => {
          // Use content field (the actual inflected text) not lemma
          const actualText = alignment.alignmentData[idx]?.content || word
          const occurrence = alignment.alignmentData[idx]?.occurrence 
            ? parseInt(alignment.alignmentData[idx].occurrence) 
            : idx + 1
          
          return generateSemanticId(alignment.verseRef, actualText, occurrence)
        })
        
        token.alignedOriginalWordIds = [...new Set(sourceSemanticIds)] // Deduplicate
        attachedCount++
      }
    }
  }
}
