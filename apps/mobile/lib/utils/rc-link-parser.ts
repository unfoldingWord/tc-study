/**
 * RC Link Parser Utility
 * 
 * Parses rc:// links from Translation Notes support references
 * to extract Translation Academy article information.
 * 
 * Example rc:// link formats:
 * - rc://en/ta/man/translate/figs-metaphor
 * - rc://wildcard/ta/man/checking/acceptable  
 * - rc://en/ta/man/intro/translation-guidelines
 */

export interface ParsedRcLink {
  language: string;
  resource: string; // 'ta', 'tw', 'tn', etc.
  type: string; // 'man' for manual, 'dict' for dictionary, 'help' for help
  category: string; // 'translate', 'checking', 'intro', 'bible', 'kt', 'names', 'other'
  articleId: string; // 'figs-metaphor', 'faith', etc.
  fullArticleId: string; // 'translate/figs-metaphor', 'kt/faith', etc.
  isValid: boolean;
  
  // Additional properties for different resource types
  resourceType: 'ta' | 'tw' | 'tn' | 'obs' | 'unknown';
  
  // For TN links (navigation)
  bookCode?: string;
  chapter?: number;
  verse?: number;
  
  // For relative links
  isRelative?: boolean;
  relativePath?: string;
}

/**
 * Parse an rc:// link to extract resource information
 * Supports TA, TW, TN, and OBS resources
 */
export function parseRcLink(rcLink: string): ParsedRcLink {
  const result: ParsedRcLink = {
    language: '',
    resource: '',
    type: '',
    category: '',
    articleId: '',
    fullArticleId: '',
    isValid: false,
    resourceType: 'unknown'
  };

  try {
    // Remove rc:// prefix and split by /
    const cleanLink = rcLink.replace(/^rc:\/\//, '');
    const parts = cleanLink.split('/');

    // Expected format varies by resource:
    // TA: language/ta/man/category/article (e.g., en/ta/man/translate/figs-metaphor)
    // TW: language/tw/dict/bible/category/article (e.g., en/tw/dict/bible/kt/faith)
    // TN: language/tn/help/book/chapter/verse (e.g., en/tn/help/2ti/04/07)
    // OBS: language/tn/help/obs/story/frame (e.g., en/tn/help/obs/05/06)
    
    if (parts.length < 4) {
      console.warn(`Invalid rc:// link format: ${rcLink} (expected at least 4 parts, got ${parts.length})`);
      return result;
    }

    const [language, resource, type] = parts;
    
    result.language = language === '*' ? 'en' : language; // Default wildcard to English
    result.resource = resource;
    result.type = type;

    // Handle different resource types
    switch (resource) {
      case 'ta':
        return parseTranslationAcademyLink(parts, result, rcLink);
      case 'tw':
        return parseTranslationWordsLink(parts, result, rcLink);
      case 'tn':
        return parseTranslationNotesLink(parts, result, rcLink);
      default:
        console.warn(`Unsupported resource type: ${resource} in ${rcLink}`);
        return result;
    }

  } catch (error) {
    console.error(`❌ Failed to parse rc:// link: ${rcLink}`, error);
    return result;
  }
}

/**
 * Parse Translation Academy rc:// link
 * Format: language/ta/man/category/article
 */
function parseTranslationAcademyLink(parts: string[], result: ParsedRcLink, originalLink: string): ParsedRcLink {
  if (parts.length < 5) {
    console.warn(`Invalid TA link format: ${originalLink} (expected 5 parts, got ${parts.length})`);
    return result;
  }

  const [, , type, category, articleId] = parts;

  // Validate TA format
  if (type !== 'man') {
    console.warn(`Invalid TA type: ${type} in ${originalLink} (expected 'man')`);
    return result;
  }

  // Validate category
  const validCategories = ['translate', 'checking', 'intro'];
  if (!validCategories.includes(category)) {
    console.warn(`Invalid TA category: ${category} in ${originalLink}`);
    return result;
  }

  result.category = category;
  result.articleId = articleId;
  result.fullArticleId = `${category}/${articleId}`;
  result.resourceType = 'ta';
  result.isValid = true;

  return result;
}

/**
 * Parse Translation Words rc:// link
 * Format: language/tw/dict/bible/category/article
 */
function parseTranslationWordsLink(parts: string[], result: ParsedRcLink, originalLink: string): ParsedRcLink {
  if (parts.length < 6) {
    console.warn(`Invalid TW link format: ${originalLink} (expected 6 parts, got ${parts.length})`);
    return result;
  }

  const [, , type, bible, category, articleId] = parts;

  // Validate TW format
  if (type !== 'dict' || bible !== 'bible') {
    console.warn(`Invalid TW format: ${originalLink} (expected 'dict/bible')`);
    return result;
  }

  // Validate category
  const validCategories = ['kt', 'names', 'other'];
  if (!validCategories.includes(category)) {
    console.warn(`Invalid TW category: ${category} in ${originalLink}`);
    return result;
  }

  result.category = category;
  result.articleId = articleId;
  result.fullArticleId = `${category}/${articleId}`;  // Keep original format for title fetching
  result.resourceType = 'tw';
  result.isValid = true;

  return result;
}

/**
 * Parse Translation Notes rc:// link
 * Format: language/tn/help/book/chapter/verse OR language/tn/help/obs/story/frame
 */
function parseTranslationNotesLink(parts: string[], result: ParsedRcLink, originalLink: string): ParsedRcLink {
  if (parts.length < 6) {
    console.warn(`Invalid TN link format: ${originalLink} (expected 6 parts, got ${parts.length})`);
    return result;
  }

  const [, , type, bookOrObs, chapterOrStory, verseOrFrame] = parts;

  // Validate TN format
  if (type !== 'help') {
    console.warn(`Invalid TN type: ${type} in ${originalLink} (expected 'help')`);
    return result;
  }

  // Handle OBS (Open Bible Stories)
  if (bookOrObs === 'obs') {
    result.category = 'obs';
    result.articleId = `${chapterOrStory}/${verseOrFrame}`;
    result.fullArticleId = `obs/${chapterOrStory}/${verseOrFrame}`;
    result.resourceType = 'obs';
    result.bookCode = 'obs';
    result.chapter = parseInt(chapterOrStory, 10);
    result.verse = parseInt(verseOrFrame, 10);
    result.isValid = true;
    return result;
  }

  // Handle regular Bible books
  const chapter = parseInt(chapterOrStory, 10);
  const verse = parseInt(verseOrFrame, 10);

  if (isNaN(chapter) || isNaN(verse)) {
    console.warn(`Invalid TN reference: ${originalLink} (chapter: ${chapterOrStory}, verse: ${verseOrFrame})`);
    return result;
  }

  result.category = 'bible';
  result.articleId = `${bookOrObs}/${chapterOrStory}/${verseOrFrame}`;
  result.fullArticleId = `${bookOrObs}/${chapterOrStory}/${verseOrFrame}`;
  result.resourceType = 'tn';
  result.bookCode = bookOrObs.toLowerCase();
  result.chapter = chapter;
  result.verse = verse;
  result.isValid = true;

  return result;
}

/**
 * Check if a string contains an rc:// link
 */
export function containsRcLink(text: string): boolean {
  return /rc:\/\//.test(text);
}

/**
 * Extract all rc:// links from a text string
 */
export function extractRcLinks(text: string): string[] {
  const rcLinkRegex = /rc:\/\/[^\s,;)]+/g;
  return text.match(rcLinkRegex) || [];
}

/**
 * Parse a relative link (e.g., ../kt/faith.md, ../01/10.md)
 */
export function parseRelativeLink(relativePath: string): ParsedRcLink {
  const result: ParsedRcLink = {
    language: 'en', // Default for relative links
    resource: '',
    type: '',
    category: '',
    articleId: '',
    fullArticleId: '',
    isValid: false,
    resourceType: 'unknown',
    isRelative: true,
    relativePath
  };

  try {
    // Handle cross-book references like ../../1ti/03/01.md
    if (relativePath.startsWith('../../')) {
      const crossBookPath = relativePath.replace(/^\.\.\/\.\.\//, '').replace(/\.md$/, '');
      const crossBookParts = crossBookPath.split('/');
      
      if (crossBookParts.length === 3) {
        const bookCode = crossBookParts[0];
        const chapter = parseInt(crossBookParts[1], 10);
        const verse = parseInt(crossBookParts[2], 10);
        
        if (!isNaN(chapter) && !isNaN(verse)) {
          result.resource = 'tn';
          result.type = 'help';
          result.category = 'bible';
          result.articleId = `${bookCode}:${chapter}:${verse}`;
          result.fullArticleId = `${bookCode}/${chapter}/${verse}`;
          result.resourceType = 'tn';
          result.bookCode = bookCode;
          result.chapter = chapter;
          result.verse = verse;
          result.isValid = true;
          return result;
        }
      }
    }

    // Clean up the path for regular relative links
    const cleanPath = relativePath.replace(/^\.\.\//, '').replace(/\.md$/, '');
    const parts = cleanPath.split('/');

    if (parts.length < 1) {
      return result;
    }

    // Check for Translation Words patterns (kt/, names/, other/)
    if (parts.length >= 2 && ['kt', 'names', 'other'].includes(parts[0])) {
      result.resource = 'tw';
      result.type = 'dict';
      result.category = parts[0];
      result.articleId = parts[1];
      result.fullArticleId = `${parts[0]}/${parts[1]}`;
      result.resourceType = 'tw';
      result.isValid = true;
      return result;
    }

    // Check for Translation Academy patterns (figs-*, translate-*, etc.)
    if (parts.length >= 2 && parts[1] === '01') {
      // Pattern like ../figs-youcrowd/01.md -> TA article
      const articleId = parts[0];
      if (articleId.startsWith('figs-') || articleId.startsWith('translate-') || articleId.startsWith('checking-') || articleId.startsWith('intro-')) {
        result.resource = 'ta';
        result.type = 'man';
        result.category = 'translate'; // Default category
        result.articleId = articleId;
        result.fullArticleId = `translate/${articleId}`;
        result.resourceType = 'ta';
        result.isValid = true;
        return result;
      }
    }

    // Check for chapter/verse navigation patterns (01/10, 02/05, etc.)
    if (parts.length >= 2) {
      const chapter = parseInt(parts[0], 10);
      const verse = parseInt(parts[1], 10);
      
      if (!isNaN(chapter) && !isNaN(verse)) {
        result.resource = 'tn';
        result.type = 'help';
        result.category = 'navigation';
        result.articleId = `${parts[0]}/${parts[1]}`;
        result.fullArticleId = `${parts[0]}/${parts[1]}`;
        result.resourceType = 'tn';
        result.bookCode = 'navigation'; // Will be resolved using currentBook
        result.chapter = chapter;
        result.verse = verse;
        result.isValid = true;
        return result;
      }
    }

    // Check for single chapter navigation (intro.md, etc.)
    if (parts.length === 1) {
      const fileName = parts[0];
      if (fileName === 'intro') {
        result.resource = 'tn';
        result.type = 'help';
        result.category = 'intro';
        result.articleId = 'intro';
        result.fullArticleId = 'intro';
        result.resourceType = 'tn';
        result.isValid = true;
        return result;
      }
    }

    console.warn(`Unable to parse relative link: ${relativePath}`);
    return result;

  } catch (error) {
    console.error(`❌ Failed to parse relative link: ${relativePath}`, error);
    return result;
  }
}

/**
 * Check if a string is a relative link
 */
export function isRelativeLink(link: string): boolean {
  return link.startsWith('../') || link.startsWith('./');
}

/**
 * Check if an rc:// link is a Translation Academy link
 */
export function isTranslationAcademyLink(rcLink: string): boolean {
  const parsed = parseRcLink(rcLink);
  return parsed.isValid && parsed.resourceType === 'ta';
}

/**
 * Check if an rc:// link is a Translation Words link
 */
export function isTranslationWordsLink(rcLink: string): boolean {
  const parsed = parseRcLink(rcLink);
  return parsed.isValid && parsed.resourceType === 'tw';
}

/**
 * Check if an rc:// link is a Translation Notes link
 */
export function isTranslationNotesLink(rcLink: string): boolean {
  const parsed = parseRcLink(rcLink);
  return parsed.isValid && parsed.resourceType === 'tn';
}

/**
 * Check if an rc:// link is an OBS link
 */
export function isOBSLink(rcLink: string): boolean {
  const parsed = parseRcLink(rcLink);
  return parsed.isValid && parsed.resourceType === 'obs';
}

/**
 * Get a human-readable title for a Translation Academy article
 */
export function getArticleDisplayTitle(articleId: string, category: string): string {
  // Common article titles mapping
  const titleMap: Record<string, string> = {
    'figs-metaphor': 'Metaphor',
    'figs-simile': 'Simile',
    'figs-hyperbole': 'Hyperbole',
    'figs-irony': 'Irony',
    'translate-names': 'How to Translate Names',
    'translate-unknown': 'Translate the Unknown',
    'acceptable': 'Acceptable Style',
    'good': 'A Good Translation',
    'translation-guidelines': 'Translation Guidelines'
  };

  const title = titleMap[articleId];
  if (title) {
    return title;
  }

  // Fallback: convert kebab-case to Title Case
  return articleId
    .split('-')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}
