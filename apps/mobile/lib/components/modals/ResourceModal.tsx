/**
 * Unified Resource Modal Component - React Native Version
 * 
 * Simplified React Native version of the resource modal for displaying
 * both Translation Academy and Translation Words content.
 */

import React, { useEffect, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useNavigation } from '../../contexts/NavigationContext';
import { useWorkspaceSelector } from '../../contexts/WorkspaceContext';
import { ResourceType } from '../../types/context';
import { Icon } from '../ui/Icon.native';
import { SimpleMarkdownRenderer } from '../ui/SimpleMarkdownRenderer';

interface ResourceModalProps {
  isOpen: boolean;
  onClose: () => void;
  resourceType: ResourceType;
  resourceId: string;
  title?: string;
  onTALinkClick?: (articleId: string, title?: string) => void;
  onTWLinkClick?: (wordId: string, title?: string) => void;
}

interface ResourceItem {
  type: ResourceType;
  id: string;
  title?: string;
  displayTitle?: string; // Actual title from loaded content
}

export function ResourceModal({
  isOpen,
  onClose,
  resourceType,
  resourceId,
  title,
  onTALinkClick,
  onTWLinkClick
}: ResourceModalProps) {
  const resourceManager = useWorkspaceSelector(state => state.resourceManager);
  const { currentReference } = useNavigation();
  
  // Navigation history stack
  const [navigationStack, setNavigationStack] = useState<ResourceItem[]>([]);
  const [currentIndex, setCurrentIndex] = useState(-1);
  
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [content, setContent] = useState<string>('');
  const [resourceTitle, setResourceTitle] = useState<string>('');

  // Current resource being displayed
  const currentResource = currentIndex >= 0 ? navigationStack[currentIndex] : null;

  // Initialize navigation stack when modal opens with new resource
  useEffect(() => {
    if (!isOpen || !resourceId) return;

    // Check if this is a new resource (different from current)
    const resourceKey = `${resourceType}/${resourceId}`;
    const currentResourceKey = currentResource ? `${currentResource.type}/${currentResource.id}` : null;
    
    if (resourceKey === currentResourceKey) {
      return; // Same resource, no need to update
    }

    const newResource: ResourceItem = {
      type: resourceType,
      id: resourceId,
      title: title
    };

    // If modal has existing history, add to it
    if (navigationStack.length > 0) {
      setNavigationStack(prev => {
        // Remove any items after current index (forward history)
        const newStack = prev.slice(0, currentIndex + 1);
        // Add new resource
        newStack.push(newResource);
        return newStack;
      });
      setCurrentIndex(prev => prev + 1);
    } else {
      // First time opening modal
      setNavigationStack([newResource]);
      setCurrentIndex(0);
    }
  }, [isOpen, resourceType, resourceId, title, navigationStack.length, currentIndex, currentResource]);

  // Clear navigation when modal closes
  useEffect(() => {
    if (!isOpen) {
      setNavigationStack([]);
      setCurrentIndex(-1);
      setContent('');
      setError(null);
      setResourceTitle('');
    }
  }, [isOpen]);

  // Load content when current resource changes
  useEffect(() => {
    if (!currentResource || !resourceManager) return;

    const loadResource = async () => {
      setLoading(true);
      setError(null);
      
      try {
        let resource;
        
        if (currentResource.type === 'ta') {
          resource = await resourceManager.getAcademyArticle(currentResource.id);
        } else if (currentResource.type === 'tw') {
          resource = await resourceManager.getTranslationWord(currentResource.id);
        } else {
          throw new Error(`Unsupported resource type: ${currentResource.type}`);
        }

        if (resource) {
          setContent(resource.content || '');
          setResourceTitle(resource.title || currentResource.title || currentResource.id);
          
          // Update displayTitle in navigation stack
          setNavigationStack(prev => prev.map((item, index) => 
            index === currentIndex 
              ? { ...item, displayTitle: resource.title }
              : item
          ));
        } else {
          throw new Error('Resource not found');
        }
      } catch (err) {
        console.error('Failed to load resource:', err);
        setError(err instanceof Error ? err.message : 'Failed to load resource');
      } finally {
        setLoading(false);
      }
    };

    loadResource();
  }, [currentResource?.type, currentResource?.id, currentIndex, resourceManager]);

  // Navigation functions
  const navigateToResource = useCallback((resource: ResourceItem) => {
    setNavigationStack(prev => {
      // Remove any items after current index (forward history)
      const newStack = prev.slice(0, currentIndex + 1);
      // Add new resource
      newStack.push(resource);
      return newStack;
    });
    setCurrentIndex(prev => prev + 1);
  }, [currentIndex]);

  const navigateBack = useCallback(() => {
    if (currentIndex > 0) {
      setCurrentIndex(prev => prev - 1);
    }
  }, [currentIndex]);

  const navigateForward = useCallback(() => {
    if (currentIndex < navigationStack.length - 1) {
      setCurrentIndex(prev => prev + 1);
    }
  }, [currentIndex, navigationStack.length]);

  // Handle internal TA link clicks
  const handleInternalTALinkClick = useCallback((articleId: string, title?: string) => {
    const newResource: ResourceItem = {
      type: 'ta',
      id: articleId,
      title: title
    };
    navigateToResource(newResource);
    
    // Also call external handler if provided
    if (onTALinkClick) {
      onTALinkClick(articleId, title);
    }
  }, [navigateToResource, onTALinkClick]);

  // Handle internal TW link clicks
  const handleInternalTWLinkClick = useCallback((wordId: string, title?: string) => {
    const fullWordId = wordId.startsWith('bible/') ? wordId : `bible/${wordId}`;
    const newResource: ResourceItem = {
      type: 'tw',
      id: fullWordId,
      title: title
    };
    navigateToResource(newResource);
    
    // Also call external handler if provided
    if (onTWLinkClick) {
      onTWLinkClick(fullWordId, title);
    }
  }, [navigateToResource, onTWLinkClick]);

  const getResourceIcon = (type: ResourceType) => {
    switch (type) {
      case 'ta': return 'academy';
      case 'tw': return 'book';
      default: return 'book-open';
    }
  };

  const getResourceTypeLabel = (type: ResourceType) => {
    switch (type) {
      case 'ta': return 'Translation Academy';
      case 'tw': return 'Translation Words';
      default: return 'Resource';
    }
  };

  if (!isOpen) return null;

  const canGoBack = currentIndex > 0;
  const canGoForward = currentIndex < navigationStack.length - 1;

    return (
    <Modal
      visible={isOpen}
      transparent={true}
      animationType="fade"
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
      {/* Backdrop */}
        <Pressable 
          style={styles.backdrop}
          onPress={onClose}
      />
      
      {/* Modal */}
        <View style={styles.modalContainer}>
          <View style={styles.modal}>
        {/* Header */}
            <View style={styles.header}>
              {/* Back/Forward Navigation Buttons */}
              <View style={styles.navigationButtons}>
                <Pressable
                  onPress={navigateBack}
                  disabled={!canGoBack}
                  style={[styles.navButton, !canGoBack && styles.navButtonDisabled]}
                >
                  <Icon 
                    name="chevron-left" 
                    size={20} 
                    color={canGoBack ? '#374151' : '#d1d5db'} 
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
                    color={canGoForward ? '#374151' : '#d1d5db'} 
                  />
                </Pressable>
                <View style={styles.divider} />
              </View>
              
              <View style={styles.headerLeft}>
                <View style={styles.iconContainer}>
                  <Icon name={currentResource ? getResourceIcon(currentResource.type) : getResourceIcon(resourceType)} size={20} />
                </View>
                <View style={styles.titleContainer}>
                  <Text style={styles.title}>
                    {resourceTitle || getResourceTypeLabel(currentResource?.type || resourceType)}
                  </Text>
                  <Text style={styles.resourceId}>
                    {currentResource?.id || resourceId}
                  </Text>
                </View>
              </View>
              
              <Pressable
                onPress={onClose}
                style={styles.closeButton}
              >
                <Text style={styles.closeButtonText}>✕</Text>
              </Pressable>
            </View>

        {/* Content */}
            <ScrollView style={styles.content}>
          {loading && (
                <View style={styles.loadingContainer}>
                  <View style={styles.loadingContent}>
                    <Text style={styles.loadingSpinner}>⟳</Text>
                    <Text style={styles.loadingText}>Loading {getResourceTypeLabel(resourceType).toLowerCase()}...</Text>
                  </View>
                </View>
          )}

          {error && (
                <View style={styles.errorContainer}>
                  <View style={styles.errorContent}>
                    <Text style={styles.errorIcon}>⚠️</Text>
                    <Text style={styles.errorTitle}>Failed to load {getResourceTypeLabel(resourceType).toLowerCase()}</Text>
                    <Text style={styles.errorMessage}>{error}</Text>
                    <Pressable
                      onPress={onClose}
                      style={styles.errorButton}
                    >
                      <Text style={styles.errorButtonText}>Close</Text>
                    </Pressable>
                  </View>
                </View>
          )}

          {content && !loading && !error && (
                <View style={styles.contentContainer}>
                 <SimpleMarkdownRenderer 
                    content={content}
                    onTALinkClick={handleInternalTALinkClick}
                    onTWLinkClick={handleInternalTWLinkClick}
                  />
                </View>
              )}
            </ScrollView>

            {/* Footer */}
            <View style={styles.footer}>
              <Text style={styles.footerText}>
                ℹ️ {getResourceTypeLabel(resourceType)} • unfoldingWord®
              </Text>
              <Pressable
                onPress={onClose}
                style={styles.footerButton}
              >
                <Text style={styles.footerButtonText}>Close</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  backdrop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  navigationButtons: {
    flexDirection: 'row',
    alignItems: 'center',
    marginRight: 12,
  },
  navButton: {
    padding: 8,
    borderRadius: 4,
  },
  navButtonDisabled: {
    opacity: 0.4,
  },
  divider: {
    width: 1,
    height: 20,
    backgroundColor: '#d1d5db',
    marginLeft: 8,
    marginRight: 4,
  },
  modalContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
  },
  modal: {
    backgroundColor: '#ffffff',
    borderRadius: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.25,
    shadowRadius: 20,
    elevation: 10,
    maxWidth: '100%',
    width: '100%',
    maxHeight: '90%',
    overflow: 'hidden',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 24,
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flex: 1,
  },
  iconContainer: {
    width: 40,
    height: 40,
    backgroundColor: '#dbeafe',
    borderRadius: 20,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  titleContainer: {
    flex: 1,
  },
  title: {
    fontSize: 18,
    fontWeight: '600',
    color: '#111827',
  },
  resourceId: {
    fontSize: 12,
    color: '#6b7280',
    marginTop: 4,
  },
  closeButton: {
    padding: 8,
    borderRadius: 20,
  },
  closeButtonText: {
    fontSize: 18,
    color: '#6b7280',
    fontWeight: 'bold',
  },
  content: {
    flex: 1,
  },
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 48,
  },
  loadingContent: {
    alignItems: 'center',
  },
  loadingSpinner: {
    fontSize: 32,
    color: '#3b82f6',
    marginBottom: 12,
  },
  loadingText: {
    fontSize: 14,
    color: '#6b7280',
  },
  errorContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 48,
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
    fontWeight: '500',
    color: '#dc2626',
    marginBottom: 4,
  },
  errorMessage: {
    fontSize: 14,
    color: '#6b7280',
    marginBottom: 16,
    textAlign: 'center',
  },
  errorButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: '#fecaca',
    borderRadius: 6,
  },
  errorButtonText: {
    color: '#dc2626',
    fontWeight: '500',
  },
  contentContainer: {
    padding: 24,
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 24,
    borderTopWidth: 1,
    borderTopColor: '#e5e7eb',
    backgroundColor: '#f9fafb',
  },
  footerText: {
    fontSize: 14,
    color: '#6b7280',
  },
  footerButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: '#e5e7eb',
    borderRadius: 6,
  },
  footerButtonText: {
    color: '#374151',
    fontWeight: '500',
  },
});
