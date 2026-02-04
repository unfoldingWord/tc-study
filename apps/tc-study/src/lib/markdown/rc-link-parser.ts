/**
 * RC Link Parser
 * 
 * Utilities for parsing Door43 rc links
 * Format: rc:[slashes][lang]/[resource]/[type]/[path]
 * Examples:
 * - rc:[slashes]star/ta/man/translate/figs-metaphor
 * - rc:[slashes]star/tw/dict/bible/kt/grace
 * - rc:[slashes]en/tn/help/gen/01/01
 */

export interface ParsedRcLink {
  language: string
  resourceAbbrev: string  // ta, tw, tn, etc.
  resourceType: 'academy' | 'words' | 'notes' | 'questions' | 'unknown'
  entryId: string         // Full path: translate/figs-metaphor, bible/kt/grace, etc.
  isValid: boolean
  // Scripture reference for TN links (extracted from path)
  scriptureRef?: {
    bookCode: string      // e.g., 'gen', 'psa', '1jn'
    chapter: string       // e.g., '01', '047'
    verse: string         // e.g., '02', '09'
  }
}

/**
 * Parse an rc link into its components
 */
export function parseRcLink(href: string): ParsedRcLink {
  // Default result for invalid links
  const invalid: ParsedRcLink = {
    language: '',
    resourceAbbrev: '',
    resourceType: 'unknown',
    entryId: '',
    isValid: false
  }

  if (!href || !href.startsWith('rc://')) {
    return invalid
  }

  try {
    // Remove rc prefix (5 chars)
    const path = href.substring(5)
    
    // Split into parts: [lang]/[resource]/[type]/[...path]
    const parts = path.split('/')
    
    if (parts.length < 4) {
      console.warn('[parseRcLink] Invalid rc link format:', href)
      return invalid
    }

    const [language, resourceAbbrev, resourceSubtype, ...pathParts] = parts
    
    // Determine resource type
    let resourceType: ParsedRcLink['resourceType'] = 'unknown'
    if (resourceAbbrev === 'ta') {
      resourceType = 'academy'
    } else if (resourceAbbrev === 'tw') {
      resourceType = 'words'
    } else if (resourceAbbrev === 'tn') {
      resourceType = 'notes'
    } else if (resourceAbbrev === 'tq') {
      resourceType = 'questions'
    }

    // Construct entry ID (everything after the resource type)
    // For TA: man/translate/figs-metaphor -> translate/figs-metaphor
    // For TW: dict/bible/kt/grace -> bible/kt/grace
    let entryId = pathParts.join('/')
    
    // Special handling for TA: skip the 'man' part
    if (resourceType === 'academy' && resourceSubtype === 'man') {
      entryId = pathParts.join('/')
    }
    // Special handling for TW: skip the 'dict' part
    else if (resourceType === 'words' && resourceSubtype === 'dict') {
      entryId = pathParts.join('/')
    }
    // For other resources, include the subtype in the entry ID
    else {
      entryId = [resourceSubtype, ...pathParts].join('/')
    }

    // Extract scripture reference for TN links
    // Format: rc://*/tn/help/[bookCode]/[chapter]/[verse]
    let scriptureRef: ParsedRcLink['scriptureRef'] = undefined
    if (resourceType === 'notes' && pathParts.length >= 3) {
      scriptureRef = {
        bookCode: pathParts[0],    // e.g., 'gen', 'psa', '1jn'
        chapter: pathParts[1],     // e.g., '01', '047'
        verse: pathParts[2]        // e.g., '02', '09'
      }
    }

    return {
      language,
      resourceAbbrev,
      resourceType,
      entryId,
      scriptureRef,
      isValid: true
    }
  } catch (error) {
    console.error('[parseRcLink] Error parsing rc link:', href, error)
    return invalid
  }
}

/**
 * Check if a link is a relative link (dot-dot-slash or dot-slash)
 */
export function isRelativeLink(href: string): boolean {
  return href.startsWith('../') || href.startsWith('./')
}

/**
 * Parse a relative link to extract the entry ID
 * Examples:
 * - dot-dot-slash translate/figs-metaphor becomes translate/figs-metaphor
 * - dot-dot-slash dot-dot-slash bible/kt/grace becomes bible/kt/grace
 */
export function parseRelativeLink(href: string, currentEntryId: string): string {
  if (!href || !isRelativeLink(href)) {
    return href
  }

  // Remove ../ and ./ prefixes
  let path = href
  const upLevels = (href.match(/\.\.\//g) || []).length
  path = path.replace(/^(\.\.\/)*(\.\/)?/, '')

  // If we have the current entry ID, resolve relative to it
  if (currentEntryId && upLevels > 0) {
    const currentParts = currentEntryId.split('/')
    // Go up the specified number of levels
    const baseParts = currentParts.slice(0, -upLevels)
    // Append the relative path
    return [...baseParts, path].join('/')
  }

  return path
}

/**
 * Get a display name for an rc link
 */
export function getRcLinkDisplayName(parsed: ParsedRcLink): string {
  if (!parsed.isValid || !parsed.entryId) {
    return 'Unknown'
  }

  // Extract the last part of the entry ID as the display name
  const parts = parsed.entryId.split('/')
  const lastPart = parts[parts.length - 1]
  
  // Convert kebab-case to Title Case
  return lastPart
    .split('-')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ')
}

/**
 * Parse verse range from link text
 * Examples:
 * - "Génesis 1:2" -> { chapter: "1", verseStart: "2" }
 * - "Josué 3:9-11" -> { chapter: "3", verseStart: "9", verseEnd: "11" }
 * - "Mateo 5:3-6:4" -> { chapter: "5", verseStart: "3", endChapter: "6", verseEnd: "4" }
 * - "Salmos 47:9" -> { chapter: "47", verseStart: "9" }
 */
export function parseVerseRangeFromText(linkText: string): {
  chapter?: string
  verseStart?: string
  endChapter?: string
  verseEnd?: string
} | null {
  // Match pattern with optional cross-chapter range:
  // - "Chapter:Verse" (single verse)
  // - "Chapter:Verse-Verse" (verse range in same chapter)
  // - "Chapter:Verse-Chapter:Verse" (cross-chapter range)
  // Examples: "1:2", "3:9-11", "5:3-6:4", "1 Juan 1:5"
  
  // Try cross-chapter range first: "5:3-6:4"
  const crossChapterMatch = linkText.match(/(\d+):(\d+)-(\d+):(\d+)/)
  if (crossChapterMatch) {
    return {
      chapter: crossChapterMatch[1],
      verseStart: crossChapterMatch[2],
      endChapter: crossChapterMatch[3],
      verseEnd: crossChapterMatch[4]
    }
  }
  
  // Try same-chapter range: "3:9-11"
  const sameChapterMatch = linkText.match(/(\d+):(\d+)-(\d+)/)
  if (sameChapterMatch) {
    return {
      chapter: sameChapterMatch[1],
      verseStart: sameChapterMatch[2],
      verseEnd: sameChapterMatch[3]
    }
  }
  
  // Try single verse: "1:2"
  const singleVerseMatch = linkText.match(/(\d+):(\d+)/)
  if (singleVerseMatch) {
    return {
      chapter: singleVerseMatch[1],
      verseStart: singleVerseMatch[2]
    }
  }
  
  return null
}
