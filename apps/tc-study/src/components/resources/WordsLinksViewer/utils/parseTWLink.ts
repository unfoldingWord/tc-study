/**
 * Parse TW Link Utility
 * 
 * Extracts category and term from Translation Words link strings
 */

import type { TWLinkInfo } from '../types'

/**
 * Parse TW link to extract category and term
 * Handles multiple formats:
 * - "rc://.../tw/dict/bible/kt/god" -> { category: "kt", term: "god" }
 * - "bible/kt/god" -> { category: "kt", term: "god" }
 * - "kt/god" -> { category: "kt", term: "god" }
 */
export function parseTWLink(twLink: string | undefined): TWLinkInfo {
  if (!twLink) {
    return { category: 'unknown', term: '' }
  }
  
  // Try full rc:// format first
  const rcMatch = twLink.match(/rc:\/\/\*\/tw\/dict\/bible\/([^/]+)\/(.+)$/)
  if (rcMatch) {
    return {
      category: rcMatch[1], // kt, names, other
      term: rcMatch[2],     // god, abraham, bread
    }
  }
  
  // Try bible/category/term format
  const bibleMatch = twLink.match(/bible\/([^/]+)\/(.+)$/)
  if (bibleMatch) {
    return {
      category: bibleMatch[1],
      term: bibleMatch[2],
    }
  }
  
  // Try category/term format (without bible prefix)
  const simpleMatch = twLink.match(/^([^/]+)\/(.+)$/)
  if (simpleMatch) {
    return {
      category: simpleMatch[1],
      term: simpleMatch[2],
    }
  }
  
  // If it's just a term without category, try to infer from common patterns
  // This shouldn't happen often, but handle it gracefully
  return { category: 'unknown', term: twLink }
}
