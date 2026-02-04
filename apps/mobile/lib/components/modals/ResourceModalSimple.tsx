/**
 * Simplified ResourceModal - React Native Version
 * 
 * Using standard React Native Modal patterns for better reliability
 * Based on Expo Router modals documentation
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
    Modal,
    Platform,
    Pressable,
    ScrollView,
    StatusBar,
    StyleSheet,
    Text,
    View
} from 'react-native';
import { useWorkspace } from '../../contexts/WorkspaceContext';
import { AcademyArticle, ResourceType } from '../../types/context';
import { Icon } from '../ui/Icon.native';
import { SimpleMarkdownRenderer } from '../ui/SimpleMarkdownRenderer';

interface ResourceItem {
  type: 'ta' | 'tw';
  id: string;
  title: string;
  displayTitle?: string;
}

interface ResourceModalProps {
  isOpen: boolean;
  isMinimized?: boolean;
  initialResource?: ResourceItem;
  onClose: () => void;
  onMinimize?: () => void;
  onRestore?: () => void;
}

export const ResourceModal: React.FC<ResourceModalProps> = ({
  isOpen,
  isMinimized = false,
  initialResource,
  onClose,
  onMinimize,
  onRestore,
}) => {
  const { resourceManager, processedResourceConfig, anchorResource } = useWorkspace();
  const [content, setContent] = useState<AcademyArticle | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [navigationStack, setNavigationStack] = useState<ResourceItem[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);

  // Initialize navigation stack - use ref to track if already initialized
  const initializedRef = useRef(false);
  useEffect(() => {
    if (initialResource && !initializedRef.current) {
      
      setNavigationStack([initialResource]);
      setCurrentIndex(0);
      initializedRef.current = true;
    }
  }, [initialResource]);

  const currentResource = navigationStack[currentIndex];
  const canGoBack = currentIndex > 0;
  const canGoForward = currentIndex < navigationStack.length - 1;

  // Navigation functions
  const navigateBack = useCallback(() => {
    if (canGoBack) {
      setCurrentIndex(prev => prev - 1);
    }
  }, [canGoBack]);

  const navigateForward = useCallback(() => {
    if (canGoForward) {
      setCurrentIndex(prev => prev + 1);
    }
  }, [canGoForward]);


  // Load content when current resource changes - inline functions to avoid dependency issues
  useEffect(() => {
    if (!currentResource || !resourceManager) {
      
      return;
    }

    
    
    
    

    const loadContent = async () => {
      setLoading(true);
      setError(null);
      
      try {
        if (currentResource.type === 'ta') {
          
          
          // Inline TA loading to avoid callback dependencies
          const academyResourceConfig = processedResourceConfig?.find((config: any) => 
            config.metadata?.type === 'academy' || config.metadata?.id === 'ta'
          );
          

          if (!academyResourceConfig) {
            console.error('❌ ResourceModal: No TA resource config found in:', processedResourceConfig);
            throw new Error('Translation Academy resource not found');
          }

          const server = anchorResource?.server || academyResourceConfig.server || 'git.door43.org';
          const owner = anchorResource?.owner || academyResourceConfig.owner || 'unfoldingWord';
          const language = anchorResource?.language || academyResourceConfig.language || 'en';
          const resourceId = 'ta';
          
          const contentKey = `${server}/${owner}/${language}/${resourceId}/${currentResource.id}`;
          
          
          const content = await resourceManager.getOrFetchContent(contentKey, ResourceType.ACADEMY);
          
          
          if (content && 'article' in content) {
            const article = content.article as AcademyArticle;
            
            
            setContent(article);
            
            // Update the current resource with the actual title
            setNavigationStack(prev => prev.map((item, index) => 
              index === currentIndex 
                ? { ...item, displayTitle: article.title }
                : item
            ));
          } else {
            console.error('❌ ResourceModal: Invalid TA content structure:', content);
            throw new Error('No article content received');
          }
          
        } else if (currentResource.type === 'tw') {
          
          
          // Inline TW loading to avoid callback dependencies
          const twResourceConfig = processedResourceConfig?.find((config: any) => 
            config.metadata?.type === 'words' || config.metadata?.id === 'tw'
          );
          

          if (!twResourceConfig) {
            console.error('❌ ResourceModal: No TW resource config found in:', processedResourceConfig);
            throw new Error('Translation Words resource not found');
          }

          const server = anchorResource?.server || twResourceConfig.server || 'git.door43.org';
          const owner = anchorResource?.owner || twResourceConfig.owner || 'unfoldingWord';
          const language = anchorResource?.language || twResourceConfig.language || 'en';
          const resourceId = 'tw';
          
          const contentKey = `${server}/${owner}/${language}/${resourceId}/${currentResource.id}`;
          
          
          const content = await resourceManager.getOrFetchContent(contentKey, ResourceType.WORDS);
          
          
          if (content && 'word' in content) {
            const word = content.word as any;
            
            
            
            // Translation Words uses 'definition' field, not 'content'
            const wordContent = word.definition || word.content || '';
            setContent({ title: word.term || word.title || currentResource.id, content: wordContent });
            
            // Update the current resource with the actual title
            setNavigationStack(prev => prev.map((item, index) => 
              index === currentIndex 
                ? { ...item, displayTitle: word.term || word.title || currentResource.id }
                : item
            ));
          } else {
            console.error('❌ ResourceModal: Invalid TW content structure:', content);
            throw new Error('No word content received');
          }
        }
        
      } catch (err) {
        console.error(`❌ ResourceModal: Failed to load ${currentResource.type} content:`, err);
        setError(err instanceof Error ? err.message : `Failed to load ${currentResource.type} content`);
      } finally {
        setLoading(false);
      }
    };

    loadContent();
  }, [currentResource?.type, currentResource?.id, currentIndex, resourceManager, processedResourceConfig, anchorResource]);

  // Helper functions
  const getResourceIcon = (type: string) => {
    switch (type) {
      case 'ta': return 'academy';
      case 'tw': return 'book-open';
      default: return 'book-open';
    }
  };

  const getResourceTypeLabel = (type: string) => {
    switch (type) {
      case 'ta': return 'Translation Academy';
      case 'tw': return 'Translation Words';
      default: return 'Resource';
    }
  };

  const removeFirstHeading = (content: string): string => {
    if (!content) return '';
    const lines = content.split('\n');
    if (lines[0]?.startsWith('# ')) {
      return lines.slice(1).join('\n').trim();
    }
    return content;
  };

  // Render minimized state - Modal stays open but shows floating button
  if (isMinimized) {
    return (
      <Modal
        visible={isOpen}
        transparent={true}
        animationType="none"
        onRequestClose={onClose}
      >
        <View style={styles.minimizedContainer}>
          <Pressable
            onPress={onRestore}
            style={styles.minimizedButton}
          >
            <Icon
              name={currentResource ? getResourceIcon(currentResource.type) : 'book-open'}
              size={18}
              color="white"
            />
            <Text style={styles.minimizedText} numberOfLines={1}>
              {currentResource?.displayTitle || currentResource?.title || 'Resource'}
            </Text>
            <Icon name="maximize" size={16} color="white" />
          </Pressable>
        </View>
      </Modal>
    );
  }

  // Handle Android back button - should minimize, not close
  const handleBackPress = useCallback(() => {
    if (onMinimize) {
      onMinimize(); // Minimize instead of closing
      return true; // Prevent default back behavior
    }
    return false;
  }, [onMinimize]);

  // Render full modal
  return (
    <Modal
      visible={isOpen}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={handleBackPress}
    >
      <StatusBar style={Platform.OS === 'ios' ? 'dark' : 'auto'} />
      
      <View style={styles.container}>
        {/* Header */}
        <View style={styles.header}>
          <View style={styles.headerLeft}>
            {/* Navigation Controls */}
            <Pressable
              onPress={navigateBack}
              disabled={!canGoBack}
              style={[styles.navButton, !canGoBack && styles.navButtonDisabled]}
            >
              <Icon 
                name="chevron-left" 
                size={20} 
                color={canGoBack ? '#000000' : '#9ca3af'} 
              />
            </Pressable>
            <Pressable
              onPress={navigateForward}
              disabled={!canGoForward}
              style={[styles.navButton, !canGoForward && styles.navButtonDisabled]}
            >
              <Icon 
                name="chevron-right" 
                size={20} 
                color={canGoForward ? '#000000' : '#9ca3af'} 
              />
            </Pressable>

            {/* Resource Info */}
            {currentResource && (
              <View style={styles.resourceInfo}>
                <Icon
                  name={getResourceIcon(currentResource.type)}
                  size={16}
                  color="#000000"
                />
                <Text style={styles.resourceTitle} numberOfLines={1}>
                  {currentResource.displayTitle || currentResource.title || getResourceTypeLabel(currentResource.type)}
                </Text>
              </View>
            )}
          </View>
          
          <View style={styles.headerRight}>
            {/* Minimize Button - Always show if onMinimize is provided */}
            {onMinimize && (
              <Pressable
                onPress={onMinimize}
                style={styles.headerButton}
              >
                <Icon name="minimize" size={20} color="#000000" />
              </Pressable>
            )}
            
            {/* Close Button - Actually closes and clears state */}
            <Pressable
              onPress={onClose}
              style={styles.headerButton}
            >
              <Icon name="close" size={20} color="#000000" />
            </Pressable>
          </View>
        </View>

        {/* Content */}
        <ScrollView 
          style={styles.content} 
          contentContainerStyle={styles.contentContainer}
          showsVerticalScrollIndicator={false}
        >
          {loading && (
            <View style={styles.loadingContainer}>
              <Text style={styles.loadingText}>Loading content...</Text>
            </View>
          )}

          {error && (
            <View style={styles.errorContainer}>
              <Text style={styles.errorText}>Error: {error}</Text>
            </View>
          )}

          {content && !loading && !error && (
            <View style={styles.contentWrapper}>
              <Text style={styles.debugText}>
                ✅ Content loaded: {content.content?.length || 0} characters
              </Text>
              <SimpleMarkdownRenderer 
                content={removeFirstHeading(content.content)}
              />
            </View>
          )}
        </ScrollView>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#ffffff',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
    backgroundColor: '#f9fafb',
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  navButton: {
    padding: 8,
    marginRight: 8,
  },
  navButtonDisabled: {
    opacity: 0.5,
  },
  resourceInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    marginLeft: 16,
    flex: 1,
  },
  resourceTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#111827',
    marginLeft: 8,
  },
  headerButton: {
    padding: 8,
    marginLeft: 8,
  },
  content: {
    flex: 1,
  },
  contentContainer: {
    padding: 20,
    minHeight: 400,
  },
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 200,
  },
  loadingText: {
    fontSize: 16,
    color: '#6b7280',
  },
  errorContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 200,
  },
  errorText: {
    fontSize: 16,
    color: '#dc2626',
    textAlign: 'center',
  },
  contentWrapper: {
    flex: 1,
  },
  debugText: {
    fontSize: 14,
    color: '#059669',
    backgroundColor: '#ecfdf5',
    padding: 8,
    borderRadius: 4,
    marginBottom: 16,
    textAlign: 'center',
  },
  // Minimized state styles
  minimizedContainer: {
    position: 'absolute',
    bottom: 20,
    right: 20,
    zIndex: 1000,
  },
  minimizedButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#3b82f6',
    borderRadius: 25,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
    minWidth: 200,
  },
  minimizedText: {
    color: 'white',
    fontSize: 14,
    fontWeight: '500',
    marginHorizontal: 8,
    flex: 1,
  },
});
