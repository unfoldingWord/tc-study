/**
 * Door43 Markdown Link Component for React Native
 * 
 * Custom link renderer for react-native-markdown-display that handles:
 * - Translation Academy (TA) links - Blue styling
 * - Translation Words (TW) links - Green styling
 * - Navigation/Scripture (TN) links - Purple styling
 */

import React, { useCallback, useState } from 'react';
import { Pressable, StyleSheet, Text } from 'react-native';
import { Icon } from './Icon.native';

// Link patterns - rc:// can use * or language code (e.g., en, es)
const RC_TA_PATTERN = /^rc:\/\/[^/]+\/ta\/man\/(.+)/;
const RC_TW_PATTERN = /^rc:\/\/[^/]+\/tw\/dict\/bible\/(.+)/;
const RC_TN_PATTERN = /^rc:\/\/[^/]+\/tn\/help\/(.+?)\/(\d+)\/(\d+)/;

const RELATIVE_TA_PATTERN = /^(?:\.\.\/)*ta\/man\/(.+)/;
const RELATIVE_TW_PATTERN = /^(?:\.\.\/)*tw\/dict\/bible\/(.+)/;
const RELATIVE_TN_PATTERN = /^(?:\.\.\/)*tn\/help\/(.+?)\/(\d+)\/(\d+)/;

// Shorthand relative links (within same resource type)
// e.g., ../kt/faith.md (TW), ../translate/figs-metaphor.md (TA)
const TW_CATEGORIES = ['kt', 'names', 'other'];
const TA_CATEGORIES = ['translate', 'checking', 'intro', 'process'];

export interface ParsedLink {
  type: 'ta' | 'tw' | 'tn' | 'external';
  resourceId: string;
  // For navigation links
  bookCode?: string;
  chapter?: number;
  verse?: number;
}

export interface Door43MarkdownLinkProps {
  href: string;
  children: React.ReactNode;
  currentBook?: string;
  currentResourceType?: 'ta' | 'tw' | 'tn'; // Current resource type for resolving relative links
  onTALinkClick?: (articleId: string, title?: string) => void;
  onTWLinkClick?: (wordId: string, title?: string) => void;
  onNavigationClick?: (bookCode: string, chapter: number, verse: number, title?: string) => void;
}

/**
 * Parse various Door43 link formats
 */
function parseLink(href: string, currentBook?: string, currentResourceType?: 'ta' | 'tw' | 'tn'): ParsedLink | null {
  console.log(`🔍 Parsing link: "${href}" with context:`, { currentBook, currentResourceType });
  
  // Translation Academy links
  let match = href.match(RC_TA_PATTERN) || href.match(RELATIVE_TA_PATTERN);
  if (match) {
    const result = {
      type: 'ta' as const,
      resourceId: match[1].replace(/\.md$/, '')
    };
    console.log(`✅ Matched TA link:`, result);
    return result;
  }

  // Translation Words links
  match = href.match(RC_TW_PATTERN) || href.match(RELATIVE_TW_PATTERN);
  if (match) {
    const wordId = match[1].replace(/\.md$/, '');
    const result = {
      type: 'tw' as const,
      resourceId: wordId.startsWith('bible/') ? wordId : `bible/${wordId}`
    };
    console.log(`✅ Matched TW link:`, result);
    return result;
  }

  // Navigation/Scripture links
  match = href.match(RC_TN_PATTERN) || href.match(RELATIVE_TN_PATTERN);
  if (match) {
    const bookCode = match[1] === 'navigation' && currentBook ? currentBook : match[1];
    const chapter = parseInt(match[2], 10);
    const verse = parseInt(match[3], 10);
    
    const result = {
      type: 'tn' as const,
      resourceId: `${bookCode}/${chapter}/${verse}`,
      bookCode,
      chapter,
      verse
    };
    console.log(`✅ Matched TN link:`, result);
    return result;
  }

  // Shorthand relative links - resolve based on current resource type
  // Pattern: ../category/filename.md
  const relativeMatch = href.match(/^(?:\.\.\/)+([^/]+)\/([^/]+)\.md$/);
  if (relativeMatch) {
    const [, category, filename] = relativeMatch;
    console.log(`🔍 Shorthand relative link detected:`, { category, filename, currentResourceType });
    
    // Translation Words shorthand: ../kt/faith.md, ../other/obey.md
    if (currentResourceType === 'tw' || TW_CATEGORIES.includes(category)) {
      const result = {
        type: 'tw' as const,
        resourceId: `bible/${category}/${filename}`
      };
      console.log(`✅ Matched TW shorthand link:`, result);
      return result;
    }
    
    // Translation Academy shorthand: ../translate/figs-metaphor.md
    if (currentResourceType === 'ta' || TA_CATEGORIES.includes(category)) {
      const result = {
        type: 'ta' as const,
        resourceId: `${category}/${filename}`
      };
      console.log(`✅ Matched TA shorthand link:`, result);
      return result;
    }
  }

  // External/unsupported links
  console.log(`⚠️ Link not matched, treating as external:`, href);
  return {
    type: 'external',
    resourceId: href
  };
}

/**
 * Get default title from resource ID
 */
function getDefaultTitle(type: string, resourceId: string): string {
  const parts = resourceId.split('/');
  const lastPart = parts[parts.length - 1] || resourceId;
  
  // Convert from kebab-case to title case
  return lastPart
    .replace(/[-_]/g, ' ')
    .replace(/\b\w/g, l => l.toUpperCase())
    .replace(/^Figs /, 'Figures of Speech: ')
    .replace(/^Translate /, 'How to Translate ');
}

/**
 * Extract text from children (simple version)
 */
function extractTextFromChildren(children: React.ReactNode): string {
  if (typeof children === 'string') {
    return children;
  }
  if (Array.isArray(children)) {
    return children.map(extractTextFromChildren).join('');
  }
  if (children && typeof children === 'object' && 'props' in children) {
    return extractTextFromChildren((children as any).props?.children);
  }
  return '';
}

export const Door43MarkdownLink: React.FC<Door43MarkdownLinkProps> = ({
  href,
  children,
  currentBook,
  currentResourceType,
  onTALinkClick,
  onTWLinkClick,
  onNavigationClick,
}) => {
  const parsedLink = parseLink(href, currentBook, currentResourceType);
  const textContent = extractTextFromChildren(children);

  // State for fetched title (placeholder for future implementation)
  const [displayTitle] = useState<string>(textContent);

  const handlePress = useCallback(() => {
    if (!parsedLink) return;

    console.log(`📎 Door43 Link pressed:`, parsedLink);

    switch (parsedLink.type) {
      case 'ta':
        if (onTALinkClick) {
          onTALinkClick(parsedLink.resourceId, textContent);
        }
        break;

      case 'tw':
        if (onTWLinkClick) {
          onTWLinkClick(parsedLink.resourceId, textContent);
        }
        break;

      case 'tn':
        if (onNavigationClick && parsedLink.bookCode && parsedLink.chapter && parsedLink.verse) {
          onNavigationClick(parsedLink.bookCode, parsedLink.chapter, parsedLink.verse, textContent);
        }
        break;

      case 'external':
        // For external links, could open in browser
        console.log('External link clicked:', href);
        break;
    }
  }, [parsedLink, href, textContent, onTALinkClick, onTWLinkClick, onNavigationClick]);

  if (!parsedLink || parsedLink.type === 'external') {
    // Render as normal link for external URLs
    return (
      <Text style={styles.externalLink} onPress={handlePress}>
        {children}
      </Text>
    );
  }

  // Get styling based on link type
  const getStyles = () => {
    switch (parsedLink.type) {
      case 'ta':
        return {
          container: styles.taContainer,
          text: styles.taText,
          icon: 'academy' as const,
          iconColor: '#1d4ed8', // blue-700
        };
      case 'tw':
        return {
          container: styles.twContainer,
          text: styles.twText,
          icon: 'book-open' as const,
          iconColor: '#14532d', // green-900
        };
      case 'tn':
        return {
          container: styles.tnContainer,
          text: styles.tnText,
          icon: 'search' as const,
          iconColor: '#6b21a8', // purple-700
        };
      default:
        return {
          container: styles.defaultContainer,
          text: styles.defaultText,
          icon: 'link' as const,
          iconColor: '#374151', // gray-700
        };
    }
  };

  const linkStyles = getStyles();

  return (
    <Pressable
      onPress={handlePress}
      style={({ pressed }) => [
        styles.linkContainer,
        linkStyles.container,
        pressed && styles.pressed
      ]}
    >
      <Icon name={linkStyles.icon} size={12} color={linkStyles.iconColor} />
      <Text style={[styles.linkText, linkStyles.text]}>
        {displayTitle}
      </Text>
    </Pressable>
  );
};

const styles = StyleSheet.create({
  linkContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    borderWidth: 1,
    marginHorizontal: 2,
  },
  pressed: {
    opacity: 0.7,
  },
  linkText: {
    fontSize: 14,
    marginLeft: 4,
  },

  // Translation Academy (TA) - Blue
  taContainer: {
    backgroundColor: '#eff6ff', // bg-blue-50
    borderColor: '#bfdbfe', // border-blue-200
  },
  taText: {
    color: '#1d4ed8', // text-blue-700
  },

  // Translation Words (TW) - Green
  twContainer: {
    backgroundColor: '#dcfce7', // bg-green-100
    borderColor: '#86efac', // border-green-300
  },
  twText: {
    color: '#14532d', // text-green-900
  },

  // Translation Notes / Navigation (TN) - Purple
  tnContainer: {
    backgroundColor: '#faf5ff', // bg-purple-50
    borderColor: '#e9d5ff', // border-purple-200
  },
  tnText: {
    color: '#6b21a8', // text-purple-700
  },

  // Default/External
  defaultContainer: {
    backgroundColor: '#f9fafb', // bg-gray-50
    borderColor: '#e5e7eb', // border-gray-200
  },
  defaultText: {
    color: '#374151', // text-gray-700
  },

  // External link (fallback)
  externalLink: {
    color: '#2563eb', // text-blue-600
    textDecorationLine: 'underline',
  },
});

