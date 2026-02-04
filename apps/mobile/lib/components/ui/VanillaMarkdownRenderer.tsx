import React, { useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import Markdown from 'react-native-markdown-display';
import { Door43MarkdownLink } from './Door43MarkdownLink';

interface VanillaMarkdownRendererProps {
  content: string;
  style?: any;
  currentBook?: string;
  currentResourceType?: 'ta' | 'tw' | 'tn'; // Current resource type for resolving relative links
  onTALinkClick?: (articleId: string, title?: string) => void;
  onTWLinkClick?: (wordId: string, title?: string) => void;
  onNavigationClick?: (bookCode: string, chapter: number, verse: number, title?: string) => void;
}

export const VanillaMarkdownRenderer: React.FC<VanillaMarkdownRendererProps> = ({
  content,
  style,
  currentBook,
  currentResourceType,
  onTALinkClick,
  onTWLinkClick,
  onNavigationClick
}) => {
  // Preprocess content to handle escape sequences and ensure proper newlines
  const preprocessContent = (text: string): string => {
    if (!text) return '';
    
    return text
      // Convert literal \n\n to actual double newlines
      .replace(/\\n\\n/g, '\n\n')
      // Convert literal \n to actual newlines
      .replace(/\\n/g, '\n')
      // Convert literal \t to actual tabs
      .replace(/\\t/g, '\t')
      // Convert literal \r to actual carriage returns
      .replace(/\\r/g, '\r')
      // Clean up any remaining escape sequences
      .replace(/\\/g, '');
  };

  // Custom link renderer using Door43MarkdownLink component
  const customRules = useMemo(() => ({
    link: (node: any, children: any, parent: any, styles: any) => {
      const href = node.attributes?.href || '';
      
      return (
        <Door43MarkdownLink
          key={node.key}
          href={href}
          currentBook={currentBook}
          currentResourceType={currentResourceType}
          onTALinkClick={onTALinkClick}
          onTWLinkClick={onTWLinkClick}
          onNavigationClick={onNavigationClick}
        >
          {children}
        </Door43MarkdownLink>
      );
    },
  }), [currentBook, currentResourceType, onTALinkClick, onTWLinkClick, onNavigationClick]);

  const processedContent = preprocessContent(content);

  return (
    <View style={[styles.container, style]}>
      <Markdown 
        style={markdownStyles}
        rules={customRules}
      >
        {processedContent}
      </Markdown>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
});

const markdownStyles = StyleSheet.create({
  // Headers
  heading1: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#000000',
    marginBottom: 16,
    marginTop: 8,
  },
  heading2: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#000000',
    marginBottom: 12,
    marginTop: 6,
  },
  heading3: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#000000',
    marginBottom: 10,
    marginTop: 4,
  },
  heading4: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#000000',
    marginBottom: 8,
    marginTop: 4,
  },
  heading5: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#000000',
    marginBottom: 6,
    marginTop: 4,
  },
  heading6: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#000000',
    marginBottom: 4,
    marginTop: 4,
  },

  // Text
  paragraph: {
    fontSize: 16, // Increased from 14 to match Scripture viewer word tokens
    color: '#000000',
    lineHeight: 22, // Increased from 20 to maintain proportional spacing
    marginBottom: 8,
  },
  text: {
    fontSize: 16, // Increased from 14 to match Scripture viewer word tokens
    color: '#000000',
  },

  // Emphasis
  strong: {
    fontWeight: 'bold',
    color: '#000000',
  },
  em: {
    fontStyle: 'italic',
    color: '#000000',
  },

  // Links
  link: {
    color: '#2563eb',
    textDecorationLine: 'underline',
  },

  // Lists
  bullet_list: {
    marginBottom: 8,
  },
  ordered_list: {
    marginBottom: 8,
  },
  list_item: {
    fontSize: 14,
    color: '#000000',
    marginBottom: 4,
  },
  bullet_list_icon: {
    marginLeft: 10,
    marginRight: 10,
  },
  ordered_list_icon: {
    marginLeft: 10,
    marginRight: 10,
  },

  // Code
  code_inline: {
    backgroundColor: '#f3f4f6',
    color: '#dc2626',
    paddingHorizontal: 4,
    paddingVertical: 2,
    borderRadius: 3,
    fontSize: 13,
    fontFamily: 'monospace',
  },
  code_block: {
    backgroundColor: '#f3f4f6',
    color: '#000000',
    padding: 12,
    borderRadius: 6,
    marginBottom: 8,
    fontSize: 13,
    fontFamily: 'monospace',
  },
  fence: {
    backgroundColor: '#f3f4f6',
    color: '#000000',
    padding: 12,
    borderRadius: 6,
    marginBottom: 8,
    fontSize: 13,
    fontFamily: 'monospace',
  },

  // Blockquotes
  blockquote: {
    backgroundColor: '#f9fafb',
    borderLeftWidth: 4,
    borderLeftColor: '#d1d5db',
    paddingLeft: 12,
    paddingVertical: 8,
    marginBottom: 8,
    fontStyle: 'italic',
  },

  // Horizontal rule
  hr: {
    backgroundColor: '#d1d5db',
    height: 1,
    marginVertical: 16,
  },

  // Tables
  table: {
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 6,
    marginBottom: 8,
  },
  thead: {
    backgroundColor: '#f9fafb',
  },
  tbody: {},
  th: {
    borderWidth: 1,
    borderColor: '#d1d5db',
    padding: 8,
    fontWeight: 'bold',
    fontSize: 14,
    color: '#000000',
  },
  td: {
    borderWidth: 1,
    borderColor: '#d1d5db',
    padding: 8,
    fontSize: 14,
    color: '#000000',
  },
  tr: {},

  // Images
  image: {
    marginVertical: 8,
  },
});
