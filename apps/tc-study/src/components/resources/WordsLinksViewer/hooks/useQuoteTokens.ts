/**
 * useQuoteTokens Hook - STEP 2 of TSV Alignment Algorithm
 * 
 * Builds quoteTokens for TWL links by matching origWords to original language tokens.
 * This is the universal algorithm documented in apps/tc-study/TWL_ALIGNMENT_SYSTEM.md
 * 
 * Flow:
 * 1. Get original language content (Hebrew Bible or Greek NT)
 * 2. For each TWL link, use QuoteMatcher to find matching tokens:
 *    - Parse occurrence number (from string to int)
 *    - Normalize text (Hebrew/Greek handling)
 *    - Handle multi-part quotes with & separator
 *    - Match based on text + occurrence + position
 * 3. Return links enhanced with quoteTokens (original language tokens)
 * 
 * Next Step: useAlignedTokens will use these quoteTokens' semantic IDs
 * to find aligned target language tokens for display.
 */

import { useMemo } from 'react'
import { useCurrentReference } from '../../../../contexts'
import type { TranslationWordsLink } from '../types'
import { buildQuoteTokens } from '../utils'
import { useOriginalLanguageContent } from './useOriginalLanguageContent'

interface UseQuoteTokensOptions {
  resourceKey: string
  resourceId: string
  links: TranslationWordsLink[]
}

export function useQuoteTokens({ resourceKey, resourceId, links }: UseQuoteTokensOptions) {
  const currentRef = useCurrentReference()
  
  // Get original language content (now requests from other panels first)
  const {
    originalContent,
    loading: loadingOriginal,
    error: originalError,
  } = useOriginalLanguageContent({ resourceKey, resourceId })
  
  // Build quoteTokens for each link
  // Only process links in the current chapter range to optimize performance
  const linksWithQuotes = useMemo(() => {
    // Don't build quotes if content isn't loaded yet or if we have no links
    if (!originalContent || originalContent.length === 0 || links.length === 0) {
      return links
    }
    
    // Use uppercase for QuoteMatcher (bt-studio format), but lowercase for semantic IDs
    const bookCode = currentRef.book?.toUpperCase() || ''
    const currentChapter = currentRef.chapter || 1
    
    // Build quotes only for relevant links
    const linksWithQuotes = links.map(link => {
      // Only build quotes if we don't already have them
      if (link.quoteTokens && link.quoteTokens.length > 0) {
        return link
      }
      
      // Only build quotes for links in current chapter (optimization)
      const refParts = link.reference.split(':')
      const linkChapter = parseInt(refParts[0] || '1', 10)
      if (linkChapter !== currentChapter) {
        return link // Skip links not in current chapter
      }
      
      // Build quote tokens using QuoteMatcher algorithm
      const quoteTokens = buildQuoteTokens({
        link,
        originalChapters: originalContent,
        bookCode,
      })
      
      return {
        ...link,
        quoteTokens: quoteTokens.length > 0 ? quoteTokens : undefined,
      }
    })
    
    return linksWithQuotes
  }, [
    links, 
    originalContent, 
    currentRef.book, 
    currentRef.chapter,
    currentRef.verse,
    currentRef.endChapter,
    currentRef.endVerse
  ])
  
  return {
    linksWithQuotes,
    loadingOriginal,
    originalError,
    hasOriginalContent: !!originalContent && originalContent.length > 0,
  }
}
