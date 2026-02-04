/**
 * Utility to attach alignment data to tokens
 * 
 * The USFM processor extracts alignments into a global array,
 * but doesn't populate alignedOriginalWordIds on individual tokens.
 * This utility bridges that gap.
 */

import type { ProcessedScripture, ProcessedVerse } from '@bt-synergy/usfm-processor'

/**
 * Attach alignment data to tokens in verses
 * Mutates the tokens in place for performance
 * 
 * Uses Strong's numbers from token.alignment.strong to map tokens reliably
 */
export function attachAlignmentsToVerses(
  scripture: ProcessedScripture,
  verses: ProcessedVerse[]
): void {
  // First pass: collect all original language token IDs by Strong's number
  // This builds a reverse index from Strong's -> Token IDs
  const strongToTokenIds = new Map<string, string[]>()
  
  for (const verse of verses) {
    if (!verse.wordTokens) continue

    for (const token of verse.wordTokens) {
      if (token.type !== 'word') continue
      
      // If this token has alignment data with Strong's number
      if (token.alignment?.strong) {
        const strong = token.alignment.strong
        if (!strongToTokenIds.has(strong)) {
          strongToTokenIds.set(strong, [])
        }
        strongToTokenIds.get(strong)!.push(token.uniqueId)
      }
    }
  }

  // Second pass: for each target language token, look up its Strong's number
  // and find all original language token IDs that match
  let attachedCount = 0
  for (const verse of verses) {
    if (!verse.wordTokens) continue

    for (const token of verse.wordTokens) {
      if (token.type !== 'word') continue
      
      // Skip if already has alignment data
      if (token.alignedOriginalWordIds && token.alignedOriginalWordIds.length > 0) {
        continue
      }
      
      // If this token has alignment data with Strong's number
      if (token.alignment?.strong) {
        const strong = token.alignment.strong
        const alignedIds = strongToTokenIds.get(strong)
        
        if (alignedIds && alignedIds.length > 0) {
          token.alignedOriginalWordIds = [...alignedIds] // Clone array
          attachedCount++
        }
      }
    }
  }
}

/**
 * For original language resources, populate alignedOriginalWordIds
 * with self-referencing IDs so they can be highlighted
 */
export function attachSelfAlignments(verses: ProcessedVerse[]): void {
  let attachedCount = 0
  for (const verse of verses) {
    if (!verse.wordTokens) continue

    for (const token of verse.wordTokens) {
      if (token.type !== 'word') continue
      
      // Use the token's uniqueId as its own alignment
      token.alignedOriginalWordIds = [token.uniqueId]
      attachedCount++
    }
  }
}
