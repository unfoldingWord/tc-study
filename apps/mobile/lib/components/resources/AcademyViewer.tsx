/**
 * Academy Viewer Component
 * 
 * Displays Translation Academy articles with markdown rendering and navigation support.
 * Handles entry-based content (articles) rather than book-based content.
 */

import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useNavigation } from '../../contexts/NavigationContext';
import { useWorkspaceSelector } from '../../contexts/WorkspaceContext';
import { AcademyArticle, ProcessedContent, ResourceMetadata } from '../../types/context';
import { SimpleMarkdownRenderer } from '../ui/SimpleMarkdownRenderer';

interface AcademyViewerProps {
  resourceId: string;
  propArticle?: ProcessedContent;
}

export const AcademyViewer: React.FC<AcademyViewerProps> = ({ 
  resourceId, 
  propArticle 
}) => {
  const { currentReference } = useNavigation();
  const resourceManager = useWorkspaceSelector(state => state.resourceManager);
  const processedResourceConfig = useWorkspaceSelector(state => state.processedResourceConfig);
  
  const [actualArticle, setActualArticle] = useState<ProcessedContent | null>(null);
  const [loading, setLoading] = useState(false);
  const [contentError, setContentError] = useState<string | null>(null);
  const [resourceMetadata, setResourceMetadata] = useState<ResourceMetadata | null>(null);
  const [selectedArticleId, setSelectedArticleId] = useState<string>('translate/figs-metaphor'); // Default article
  const [showArticleSelector, setShowArticleSelector] = useState(false);

  // Find the resource configuration for this resourceId
  const resourceConfig = useMemo(() => {
    if (!processedResourceConfig?.metadata) return null;
    
    return Array.from(processedResourceConfig.metadata.values()).find(
      config => config.id === resourceId
    );
  }, [processedResourceConfig, resourceId]);

  // Load article content
  useEffect(() => {
    if (!resourceManager || !resourceConfig || !selectedArticleId) return;

    const fetchContent = async () => {
      setLoading(true);
      setContentError(null);
      
      try {
        
        
        
        
        // Construct the full content key for academy articles
        // Format: server/owner/language/resourceId/entryId
        const contentKey = `${resourceConfig.server}/${resourceConfig.owner}/${resourceConfig.language}/${resourceConfig.id}/${selectedArticleId}`;
        
        
        // Try to get content using the resource manager
        const content = await resourceManager.getOrFetchContent(
          contentKey,
          resourceConfig.type as any // Resource type from metadata
        );
        
        
        setActualArticle(content as ProcessedContent);
        
        // Use existing metadata from resource config for language direction
        
        setResourceMetadata(resourceConfig);
        
      } catch (err) {
        console.error(`❌ AcademyViewer - Failed to load content for ${resourceId}:`, err);
        setContentError(err instanceof Error ? err.message : 'Failed to load content');
      } finally {
        setLoading(false);
      }
    };

    fetchContent();
  }, [resourceManager, resourceId, selectedArticleId, resourceConfig]);

  const displayArticle = actualArticle || propArticle;
  const isLoading = loading;

  // Get available articles from metadata
  const availableArticles = useMemo(() => {
    if (!resourceMetadata?.toc?.articles) return [];
    return resourceMetadata.toc.articles;
  }, [resourceMetadata]);

  // Determine text direction based on resource metadata
  const textDirection = resourceMetadata?.languageDirection || 'ltr';
  const textAlign = textDirection === 'rtl' ? 'text-right rtl' : 'text-left ltr';

  if (isLoading) {
    return (
      <View style={styles.loadingContainer}>
        <View style={styles.loadingContent}>
          <ActivityIndicator size="large" color="#3b82f6" style={styles.spinner} />
          <Text style={styles.loadingText}>Loading Translation Academy article...</Text>
        </View>
      </View>
    );
  }

  if (contentError) {
    return (
      <View style={styles.errorContainer}>
        <View style={styles.errorContent}>
          <Text style={styles.errorIcon}>⚠️</Text>
          <Text style={styles.errorTitle}>Failed to load article</Text>
          <Text style={styles.errorMessage}>{contentError}</Text>
        </View>
      </View>
    );
  }

  if (!displayArticle?.article) {
    return (
      <View style={styles.noContentContainer}>
        <View style={styles.noContentContent}>
          <Text style={styles.noContentIcon}>📖</Text>
          <Text style={styles.noContentTitle}>No article content available</Text>
          <Text style={styles.noContentMessage}>Select an article to view its content</Text>
        </View>
      </View>
    );
  }

  const article = displayArticle.article as AcademyArticle;

  return (
    <View style={styles.container}>
      {/* Article Selection Header */}
      <View style={styles.header}>
        <View style={styles.headerContent}>
          <View style={styles.titleSection}>
            <Text style={styles.title}>Translation Academy</Text>
            <Text style={styles.subtitle}>Training materials and methodology</Text>
          </View>
          
          {/* Article Selector */}
          <View style={styles.selectorContainer}>
            <Text style={styles.selectorLabel}>Article:</Text>
            <Pressable 
              style={styles.selectorButton}
              onPress={() => setShowArticleSelector(true)}
            >
              <Text style={styles.selectorValue}>
                {availableArticles.find(a => a.id === selectedArticleId)?.title || 'Select Article'}
              </Text>
              <Text style={styles.selectorArrow}>▼</Text>
            </Pressable>
          </View>
        </View>
      </View>

      {/* Article Content */}
      <ScrollView style={styles.content}>
        <View style={[styles.contentWrapper, { textAlign, writingDirection: textDirection }]}>
          <View style={styles.contentContainer}>
            {/* Article Header */}
            <View style={styles.articleHeader}>
              <View style={styles.articleMeta}>
                <Text style={styles.categoryTag}>
                  {article.category}
                </Text>
                <Text style={styles.separator}>•</Text>
                <Text style={styles.source}>Translation Academy</Text>
              </View>
            </View>

            {/* Rendered Article Content */}
            <View style={styles.articleContent}>
              <SimpleMarkdownRenderer content={article.content} />
            </View>
          </View>
        </View>
      </ScrollView>

      {/* Article Selector Modal */}
      <Modal
        visible={showArticleSelector}
        transparent={true}
        animationType="slide"
        onRequestClose={() => setShowArticleSelector(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContainer}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Select Article</Text>
              <Pressable 
                style={styles.modalCloseButton}
                onPress={() => setShowArticleSelector(false)}
              >
                <Text style={styles.modalCloseText}>✕</Text>
              </Pressable>
            </View>
            <ScrollView style={styles.modalContent}>
              {availableArticles.map((articleInfo) => (
                <Pressable
                  key={articleInfo.id}
                  style={[
                    styles.articleOption,
                    selectedArticleId === articleInfo.id && styles.articleOptionSelected
                  ]}
                  onPress={() => {
                    setSelectedArticleId(articleInfo.id);
                    setShowArticleSelector(false);
                  }}
                >
                  <Text style={[
                    styles.articleOptionTitle,
                    selectedArticleId === articleInfo.id && styles.articleOptionTitleSelected
                  ]}>
                    {articleInfo.title}
                  </Text>
                  <Text style={[
                    styles.articleOptionCategory,
                    selectedArticleId === articleInfo.id && styles.articleOptionCategorySelected
                  ]}>
                    ({articleInfo.category})
                  </Text>
                </Pressable>
              ))}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    flexDirection: 'column',
  },
  header: {
    flexShrink: 0,
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb', // border-gray-200
    padding: 16,
  },
  headerContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  titleSection: {
    flex: 1,
  },
  title: {
    fontSize: 18,
    fontWeight: '600',
    color: '#111827', // text-gray-900
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 14,
    color: '#6b7280', // text-gray-600
  },
  selectorContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  selectorLabel: {
    fontSize: 14,
    fontWeight: '500',
    color: '#374151', // text-gray-700
  },
  selectorButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderWidth: 1,
    borderColor: '#d1d5db', // border-gray-300
    borderRadius: 6,
    backgroundColor: '#ffffff',
    minWidth: 150,
  },
  selectorValue: {
    fontSize: 14,
    color: '#374151',
    flex: 1,
  },
  selectorArrow: {
    fontSize: 12,
    color: '#6b7280',
    marginLeft: 8,
  },
  content: {
    flex: 1,
  },
  contentWrapper: {
    padding: 24,
  },
  contentContainer: {
    maxWidth: 896, // max-w-4xl equivalent
    alignSelf: 'center',
    width: '100%',
  },
  articleHeader: {
    marginBottom: 24,
  },
  articleMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
  },
  categoryTag: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    backgroundColor: '#dbeafe', // bg-blue-100
    color: '#1e40af', // text-blue-800
    borderRadius: 12,
    fontSize: 12,
    fontWeight: '500',
  },
  separator: {
    fontSize: 14,
    color: '#6b7280', // text-gray-500
  },
  source: {
    fontSize: 14,
    color: '#6b7280', // text-gray-500
  },
  articleContent: {
    // Prose styling will be handled by SimpleMarkdownRenderer
  },
  // Loading, error, and no content styles
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    height: 256, // h-64
  },
  loadingContent: {
    alignItems: 'center',
  },
  spinner: {
    marginBottom: 8,
  },
  loadingText: {
    fontSize: 14,
    color: '#6b7280', // text-gray-600
  },
  errorContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    height: 256, // h-64
  },
  errorContent: {
    alignItems: 'center',
  },
  errorIcon: {
    fontSize: 24,
    marginBottom: 8,
  },
  errorTitle: {
    fontSize: 16,
    color: '#dc2626', // text-red-600
    fontWeight: '600',
    marginBottom: 4,
  },
  errorMessage: {
    fontSize: 14,
    color: '#6b7280', // text-gray-500
    textAlign: 'center',
  },
  noContentContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    height: 256, // h-64
  },
  noContentContent: {
    alignItems: 'center',
  },
  noContentIcon: {
    fontSize: 24,
    marginBottom: 8,
  },
  noContentTitle: {
    fontSize: 16,
    color: '#6b7280', // text-gray-500
    fontWeight: '600',
    marginBottom: 4,
  },
  noContentMessage: {
    fontSize: 14,
    color: '#6b7280', // text-gray-500
    textAlign: 'center',
  },
  // Modal styles
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContainer: {
    backgroundColor: '#ffffff',
    borderRadius: 8,
    width: '90%',
    maxHeight: '80%',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 5,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#111827',
  },
  modalCloseButton: {
    padding: 4,
  },
  modalCloseText: {
    fontSize: 18,
    color: '#6b7280',
  },
  modalContent: {
    maxHeight: 400,
  },
  articleOption: {
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#f3f4f6',
  },
  articleOptionSelected: {
    backgroundColor: '#eff6ff',
  },
  articleOptionTitle: {
    fontSize: 16,
    color: '#111827',
    marginBottom: 4,
  },
  articleOptionTitleSelected: {
    color: '#1e40af',
    fontWeight: '600',
  },
  articleOptionCategory: {
    fontSize: 14,
    color: '#6b7280',
  },
  articleOptionCategorySelected: {
    color: '#1e40af',
  },
});

export default AcademyViewer;
