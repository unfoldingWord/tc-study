/**
 * ResourceModalPresentation - Pure Presentation Component
 * 
 * This modal only handles UI presentation and user interactions.
 * All data fetching and processing is handled by external layers.
 */

import React, { useCallback } from 'react';
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
import { useNavigation } from '../../contexts/NavigationContext';
import { Icon } from '../ui/Icon.native';
import { SimpleMarkdownRenderer } from '../ui/SimpleMarkdownRenderer';

export interface ResourceContent {
  id: string;
  title: string;
  content: string;
  type: 'ta' | 'tw';
  // Visual indicators
  icon: string;
  color: string;
  backgroundColor: string;
}

export interface NavigationState {
  canGoBack: boolean;
  canGoForward: boolean;
  currentIndex: number;
  totalItems: number;
}

interface ResourceModalPresentationProps {
  // Modal state
  isOpen: boolean;
  isMinimized?: boolean;
  
  // Content
  content?: ResourceContent;
  loading?: boolean;
  error?: string;
  
  // Navigation
  navigation?: NavigationState;
  
  // Actions
  onClose: () => void;
  onMinimize?: () => void;
  onRestore?: () => void;
  onNavigateBack?: () => void;
  onNavigateForward?: () => void;
  
  // Link handlers for building navigation history
  onTALinkClick?: (articleId: string, title?: string) => void;
  onTWLinkClick?: (wordId: string, title?: string) => void;
  onNavigationClick?: (bookCode: string, chapter: number, verse: number, title?: string) => void;
}

export const ResourceModalPresentation: React.FC<ResourceModalPresentationProps> = ({
  isOpen,
  isMinimized = false,
  content,
  loading = false,
  error,
  navigation,
  onClose,
  onMinimize,
  onRestore,
  onNavigateBack,
  onNavigateForward,
  onTALinkClick,
  onTWLinkClick,
  onNavigationClick,
}) => {
  const { currentReference, navigateToReference } = useNavigation();
  // Handle Android back button - should minimize, not close
  const handleBackPress = useCallback(() => {
    if (onMinimize) {
      onMinimize(); // Minimize instead of closing
      return true; // Prevent default back behavior
    }
    return false;
  }, [onMinimize]);

  // Handle navigation link clicks - minimize modal and navigate
  const handleNavigationLinkClick = useCallback((bookCode: string, chapter: number, verse: number, title?: string) => {
    console.log(`🧭 Navigation link clicked, minimizing and navigating to: ${bookCode} ${chapter}:${verse}`, title);
    
    // Minimize the modal first
    if (onMinimize) {
      onMinimize();
    }
    
    // Navigate to the scripture reference
    navigateToReference({
      book: bookCode.toLowerCase(),
      chapter,
      verse
    });
    
    // Call external handler if provided
    if (onNavigationClick) {
      onNavigationClick(bookCode, chapter, verse, title);
    }
  }, [onMinimize, navigateToReference, onNavigationClick]);

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

  // Only render the full modal (minimized state handled externally)
  if (!isOpen || isMinimized) {
    return null;
  }

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
            {navigation && (
              <>
                <Pressable
                  onPress={onNavigateBack}
                  disabled={!navigation.canGoBack}
                  style={[styles.navButton, !navigation.canGoBack && styles.navButtonDisabled]}
                >
                  <Icon 
                    name="chevron-left" 
                    size={20} 
                    color={navigation.canGoBack ? '#000000' : '#9ca3af'} 
                  />
                </Pressable>
                <Pressable
                  onPress={onNavigateForward}
                  disabled={!navigation.canGoForward}
                  style={[styles.navButton, !navigation.canGoForward && styles.navButtonDisabled]}
                >
                  <Icon 
                    name="chevron-right" 
                    size={20} 
                    color={navigation.canGoForward ? '#000000' : '#9ca3af'} 
                  />
                </Pressable>
              </>
            )}

            {/* Resource Info */}
            {content && (
              <View style={styles.resourceInfo}>
                <View style={[
                  styles.resourceIconContainer,
                  { backgroundColor: content.backgroundColor }
                ]}>
                  <Icon
                    name={content.icon}
                    size={14}
                    color={content.color}
                  />
                </View>
                <Text style={styles.resourceTitle} numberOfLines={1}>
                  {content.title || getResourceTypeLabel(content.type)}
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
              <SimpleMarkdownRenderer 
                content={removeFirstHeading(content.content)}
                currentBook={currentReference.book}
                currentResourceType={content.type}
                onTALinkClick={onTALinkClick}
                onTWLinkClick={onTWLinkClick}
                onNavigationClick={handleNavigationLinkClick}
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
  resourceIconContainer: {
    width: 24,
    height: 24,
    borderRadius: 4,
    alignItems: 'center',
    justifyContent: 'center',
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
});
