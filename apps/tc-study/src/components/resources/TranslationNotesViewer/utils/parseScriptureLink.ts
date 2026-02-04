/**
 * Parse scripture references from markdown links
 * 
 * Handles relative scripture links like:
 * - [1:1–2:10](../01/01.md) -> Uses the reference from the link text
 * - [See verse 5](../01/05.md) -> Falls back to parsing the file path
 */

import type { BCVReference } from '../../../../contexts/types'

/**
 * Parse a scripture reference from link text or file path
 * 
 * @param linkText - The text between brackets (e.g., "1:1–2:10" or "See verse 5")
 * @param linkHref - The link URL (e.g., "../01/01.md")
 * @param currentBook - The current book code to use if not specified
 * @returns Parsed BCVReference or null if not a scripture link
 */
export function parseScriptureLink(
  linkText: string,
  linkHref: string,
  currentBook: string
): BCVReference | null {
  // First, try to parse the reference from the link text
  const refFromText = parseReferenceFromText(linkText, currentBook)
  if (refFromText) {
    return refFromText
  }
  
  // Fallback: parse from the file path (e.g., ../01/05.md -> chapter 1, verse 5)
  const refFromPath = parseReferenceFromPath(linkHref, currentBook)
  if (refFromPath) {
    return refFromPath
  }
  
  return null
}

/**
 * Parse a scripture reference from link text
 * Handles formats like:
 * - "1:1" -> chapter 1, verse 1
 * - "1:1-5" -> chapter 1, verses 1-5
 * - "1:1–2:10" -> chapter 1 verse 1 to chapter 2 verse 10
 * - "12:5-7" -> chapter 12, verses 5-7
 */
function parseReferenceFromText(text: string, currentBook: string): BCVReference | null {
  // Match patterns like "1:1", "1:1-5", "1:1–2:10"
  // Support both hyphen (-) and en dash (–)
  const pattern = /(\d+):(\d+)(?:[-–](?:(\d+):)?(\d+))?/
  const match = text.match(pattern)
  
  if (!match) {
    return null
  }
  
  const chapter = parseInt(match[1], 10)
  const verse = parseInt(match[2], 10)
  const endChapterStr = match[3]
  const endVerseStr = match[4]
  
  const result: BCVReference = {
    book: currentBook,
    chapter,
    verse,
  }
  
  if (endVerseStr) {
    result.endVerse = parseInt(endVerseStr, 10)
    
    // If there's an end chapter specified
    if (endChapterStr) {
      result.endChapter = parseInt(endChapterStr, 10)
    }
  }
  
  return result
}

/**
 * Parse a scripture reference from a file path
 * Handles formats like:
 * - "../01/01.md" -> chapter 1, verse 1
 * - "../12/05.md" -> chapter 12, verse 5
 * - "../../gen/01/01.md" -> book GEN, chapter 1, verse 1
 */
function parseReferenceFromPath(href: string, currentBook: string): BCVReference | null {
  // Extract numbers from path segments
  // Match patterns like ../01/01.md or ../../gen/01/01.md
  const pathPattern = /(?:\.\.\/)+(?:([a-z]{3})\/)?(\d+)\/(\d+)\.md/i
  const match = href.match(pathPattern)
  
  if (!match) {
    return null
  }
  
  const bookFromPath = match[1]
  const chapter = parseInt(match[2], 10)
  const verse = parseInt(match[3], 10)
  
  return {
    book: bookFromPath ? bookFromPath.toLowerCase() : currentBook,
    chapter,
    verse,
  }
}
