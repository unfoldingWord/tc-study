/**
 * useAlignedTokens Hook - STEP 3 of TSV Alignment Algorithm
 * 
 * Gets aligned tokens from target language scripture for displaying quotes.
 * This is the universal algorithm documented in apps/tc-study/TWL_ALIGNMENT_SYSTEM.md
 * 
 * Algorithm Flow (Complete):
 * STEP 1: TWL origWords → Original Language tokens (via QuoteMatcher in useQuoteTokens)
 * STEP 2: Extract semantic IDs from original tokens (e.g., "TIT 1:1:Παῦλος:1")
 * STEP 3: Find target tokens where alignedOriginalWordIds contains our semantic IDs
 * 
 * Semantic ID Matching:
 * - Original token has: id = "TIT 1:1:Παῦλος:1"
 * - Target token has: alignedOriginalWordIds = ["TIT 1:1:Παῦλος:1"]
 * - When they match → target token is part of the aligned quote
 * 
 * This same algorithm works for:
 * - Translation Words Links (TWL) - uses origWords field
 * - Translation Notes (TN) - uses quote field  
 * - Any TSV resource with quote/origWords + occurrence + reference
 */

import type { OptimizedToken } from '@bt-synergy/resource-parsers'
import { useMemo } from 'react'
import { useCurrentReference } from '../../../../contexts'
import { generateSemanticIdsForQuoteTokens } from '../utils/generateSemanticIds'
import { useScriptureTokens } from './useScriptureTokens'

interface UseAlignedTokensOptions {
  resourceKey: string // TWL resource key (e.g., "unfoldingWord/en/twl")
  resourceId: string // TWL viewer resource ID
  links: Array<{
    id: string
    reference: string
    origWords?: string
    quoteTokens?: OptimizedToken[] // Original language tokens
  }>
}

interface AlignedToken {
  content: string
  semanticId: string
  verseRef: string
  position: number
  type?: 'word' | 'punctuation' | 'whitespace' | 'text' | 'gap' // Type to distinguish between words, punctuation, whitespace, text, and gaps
}

/**
 * Find aligned tokens in target language tokens from broadcast
 * Includes punctuation between contiguous matches and ellipsis for gaps
 */
function findAlignedTokens(
  targetTokens: OptimizedToken[],
  originalSemanticIds: string[],
  bookCode: string,
  chapter: number,
  verse: number
): AlignedToken[] {
  // CRITICAL: Use lowercase to match scripture viewer's semantic ID format!
  const verseRef = `${bookCode.toLowerCase()} ${chapter}:${verse}`
  
  // First, find all matched word token positions
  const matchedPositions: number[] = []
  targetTokens.forEach((token, index) => {
    // Get aligned semantic IDs from this token
    const alignedIds = token.alignedOriginalWordIds || []
    
    // Check if any of the original semantic IDs match
    const hasMatch = originalSemanticIds.some(originalId => {
      return alignedIds.some(alignedId => {
        // Compare semantic IDs (both should be in verseRef:content:occurrence format)
        const alignedIdStr = String(alignedId)
        return alignedIdStr === originalId
      })
    })
    
    if (hasMatch && token.type === 'word') {
      matchedPositions.push(index)
    }
  })
  
  if (matchedPositions.length === 0) {
    return []
  }
  
  // Now build the result array including words, punctuation, and gaps
  const result: AlignedToken[] = []
  
  matchedPositions.forEach((position, matchIndex) => {
    const token = targetTokens[position]
    const tokenOccurrence = token.occurrence || 1
    const semanticId = `${verseRef}:${token.text}:${tokenOccurrence}`
    
    // Add the matched word
    result.push({
      content: token.text,
      semanticId,
      verseRef,
      position,
      type: 'word',
    })
    
    // Check if there's a next matched word
    if (matchIndex < matchedPositions.length - 1) {
      const nextPosition = matchedPositions[matchIndex + 1]
      const gap = nextPosition - position
      
      console.log(`🔍 [findAlignedTokens] Gap check: position ${position} to ${nextPosition}, gap=${gap}`)
      
      if (gap > 1) {
        // There are tokens between (gap >= 2)
        const betweenTokens = []
        let hasWordsBetween = false
        
        for (let i = position + 1; i < nextPosition; i++) {
          const token = targetTokens[i]
          if (token.type === 'word') {
            hasWordsBetween = true
            // Don't break - we still need to collect punctuation
          } else if (token.type === 'punctuation' || token.type === 'whitespace' || token.type === 'text') {
            // Collect all non-word tokens (punctuation, whitespace, and text tokens)
            // Text tokens can contain hyphens, commas, and other inline punctuation
            betweenTokens.push({
              content: token.text,
              semanticId: `${verseRef}:${token.type}:${i}`,
              verseRef,
              position: i,
              type: token.type as 'punctuation' | 'whitespace',
            })
          }
        }
        
        if (hasWordsBetween) {
          // There are words between - add gap ellipsis
          result.push({
            content: '…',
            semanticId: `${verseRef}:gap:${position + 1}`,
            verseRef,
            position: position + 1,
            type: 'gap',
          })
        } else {
          // No words between (contiguous matches) - include all punctuation and whitespace
          result.push(...betweenTokens)
        }
      }
    }
  })
  
  return result
}

export function useAlignedTokens({ resourceKey, resourceId, links }: UseAlignedTokensOptions) {
  const currentRef = useCurrentReference()
  
  // Listen for scripture token broadcasts (simple state listener!)
  const { tokens: targetTokens, reference: tokenReference, hasTokens } = useScriptureTokens({ resourceId })
  
  // Build aligned tokens for each link
  const linksWithAlignedTokens = useMemo(() => {
    if (!hasTokens || !links || links.length === 0) {
      return links ? links.map(link => ({ ...link, alignedTokens: undefined })) : []
    }
    
    const bookCode = currentRef.book?.toLowerCase() || ''
    const currentChapter = currentRef.chapter || 1
    
    const linksWithAlignedTokens = links.map(link => {
      // Only process links with quote tokens (original language tokens)
      if (!link.quoteTokens || link.quoteTokens.length === 0) {
        return { ...link, alignedTokens: undefined }
      }
      
      // Parse link reference
      const refParts = link.reference.split(':')
      const linkChapter = parseInt(refParts[0] || '1', 10)
      const linkVerse = parseInt(refParts[1] || '1', 10)
      
      // Only process links in current chapter
      if (linkChapter !== currentChapter) {
        return { ...link, alignedTokens: undefined }
      }
      
      // Check if we have broadcast tokens for this chapter
      // We now broadcast full chapter, so just verify book and chapter match
      if (
        !tokenReference ||
        tokenReference.book !== bookCode ||
        tokenReference.chapter !== linkChapter
      ) {
        return { ...link, alignedTokens: undefined }
      }
      
      // Check if this link's verse is within the broadcast range
      const broadcastStartVerse = tokenReference.verse || 1
      const broadcastEndVerse = tokenReference.endVerse || broadcastStartVerse
      
      if (linkVerse < broadcastStartVerse || linkVerse > broadcastEndVerse) {
        // Verse not in broadcast range - skip this link
        return { ...link, alignedTokens: undefined }
      }
      
      // Generate semantic IDs for original language tokens
      const originalSemanticIds = generateSemanticIdsForQuoteTokens(
        link.quoteTokens,
        bookCode,
        linkChapter,
        linkVerse
      )
      
      // Find aligned tokens in target language
      const alignedTokens = findAlignedTokens(
        targetTokens,
        originalSemanticIds,
        bookCode,
        linkChapter,
        linkVerse
      )
      
      return {
        ...link,
        alignedTokens: alignedTokens.length > 0 ? alignedTokens : undefined,
      }
    })
    
    return linksWithAlignedTokens
  }, [
    links, 
    targetTokens, 
    tokenReference, 
    hasTokens, 
    currentRef.book, 
    currentRef.chapter,
    currentRef.verse,
    currentRef.endChapter,
    currentRef.endVerse
  ])
  
  return {
    linksWithAlignedTokens,
    loading: false, // No loading state needed with broadcast!
    error: null,
    hasTargetContent: hasTokens,
  }
}
