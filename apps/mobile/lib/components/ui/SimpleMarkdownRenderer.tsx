/**
 * Simple Markdown Renderer - React Native Version
 * 
 * A basic markdown renderer using react-native-markdown-display for vanilla markdown rendering.
 * No custom rules yet - just standard markdown support.
 */

import React from 'react';
import { VanillaMarkdownRenderer } from './VanillaMarkdownRenderer';

interface SimpleMarkdownRendererProps {
  content: string;
  currentBook?: string;
  currentResourceType?: 'ta' | 'tw' | 'tn'; // Current resource type for resolving relative links
  onTALinkClick?: (articleId: string, title?: string) => void;
  onTWLinkClick?: (wordId: string, title?: string) => void;
  onNavigationClick?: (bookCode: string, chapter: number, verse: number, title?: string) => void;
}

export const SimpleMarkdownRenderer: React.FC<SimpleMarkdownRendererProps> = ({ 
  content,
  currentBook,
  currentResourceType,
  onTALinkClick,
  onTWLinkClick,
  onNavigationClick
}) => {
  if (!content) {
    return null;
  }

  return (<>
    <VanillaMarkdownRenderer 
      content={content}
      currentBook={currentBook}
      currentResourceType={currentResourceType}
      onTALinkClick={onTALinkClick}
      onTWLinkClick={onTWLinkClick}
      onNavigationClick={onNavigationClick}
    />
  </>);
};

