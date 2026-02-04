/**
 * ResourceModalContainer - Orchestrates data fetching and presentation
 * 
 * This container handles:
 * - Resource content fetching via ResourceContentService
 * - Navigation state management
 * - Loading and error states
 * - Connecting business logic to presentation component
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useWorkspace } from '../../contexts/WorkspaceContext';
import { ResourceContentService, ResourceItem } from '../../services/ResourceContentService';
import {
    NavigationState,
    ResourceContent,
    ResourceModalPresentation
} from './ResourceModalPresentation';

interface ResourceModalContainerProps {
  isOpen: boolean;
  isMinimized?: boolean;
  initialResource?: ResourceItem;
  onClose: () => void;
  onMinimize?: () => void;
  onRestore?: () => void;
  // Expose content for external components (like minimized button)
  onContentChange?: (content: ResourceContent | undefined) => void;
}

export const ResourceModalContainer: React.FC<ResourceModalContainerProps> = ({
  isOpen,
  isMinimized = false,
  initialResource,
  onClose,
  onMinimize,
  onRestore,
  onContentChange,
}) => {
  const { resourceManager, processedResourceConfig, anchorResource } = useWorkspace();
  
  // Content state
  const [content, setContent] = useState<ResourceContent | undefined>(undefined);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | undefined>(undefined);
  
  // Navigation state
  const [navigationStack, setNavigationStack] = useState<ResourceItem[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  
  // Service instance
  const contentServiceRef = useRef<ResourceContentService | null>(null);
  
  // Initialize content service
  useEffect(() => {
    if (resourceManager && processedResourceConfig) {
      contentServiceRef.current = new ResourceContentService(
        resourceManager,
        processedResourceConfig,
        anchorResource
      );
    }
  }, [resourceManager, processedResourceConfig, anchorResource]);
  
  // Track last initialized resource
  const lastResourceRef = useRef<string | null>(null);
  
  // Initialize or update navigation stack when initialResource changes
  useEffect(() => {
    if (!initialResource) return;
    
    const resourceKey = `${initialResource.type}/${initialResource.id}`;
    
    // Check if this is a new resource (different from last one)
    if (lastResourceRef.current === resourceKey) {
      return; // Same resource, no need to update
    }
    
    lastResourceRef.current = resourceKey;
    
    // If we have an existing stack, add to it (building history)
    if (navigationStack.length > 0) {
      setNavigationStack(prev => {
        // Remove any forward history
        const newStack = prev.slice(0, currentIndex + 1);
        // Add new resource
        return [...newStack, initialResource];
      });
      setCurrentIndex(prev => prev + 1);
    } else {
      // First time opening - start fresh
      setNavigationStack([initialResource]);
      setCurrentIndex(0);
    }
  }, [initialResource]);
  
  // Clear navigation when modal closes
  useEffect(() => {
    if (!isOpen) {
      setNavigationStack([]);
      setCurrentIndex(0);
      setContent(undefined);
      setError(undefined);
      lastResourceRef.current = null;
    }
  }, [isOpen]);
  
  // Current resource and navigation state
  const currentResource = navigationStack[currentIndex];
  const navigationState: NavigationState = {
    canGoBack: currentIndex > 0,
    canGoForward: currentIndex < navigationStack.length - 1,
    currentIndex,
    totalItems: navigationStack.length,
  };
  
  // Navigation functions
  const navigateBack = useCallback(() => {
    if (navigationState.canGoBack) {
      setCurrentIndex(prev => prev - 1);
    }
  }, [navigationState.canGoBack]);
  
  const navigateForward = useCallback(() => {
    if (navigationState.canGoForward) {
      setCurrentIndex(prev => prev + 1);
    }
  }, [navigationState.canGoForward]);
  
  // Load content when current resource changes
  useEffect(() => {
    if (!currentResource || !contentServiceRef.current) {
      
      return;
    }
    
    
    
    const loadContent = async () => {
      setLoading(true);
      setError(undefined);
      
      try {
        const resourceContent = await contentServiceRef.current!.fetchContent(currentResource);
        
        setContent(resourceContent);
        
        // Update navigation stack with actual title
        setNavigationStack(prev => prev.map((item, index) => 
          index === currentIndex 
            ? { ...item, title: resourceContent.title }
            : item
        ));
      } catch (err) {
        console.error(`❌ ResourceModalContainer: Failed to load ${currentResource.type} content:`, err);
        setError(err instanceof Error ? err.message : `Failed to load ${currentResource.type} content`);
      } finally {
        setLoading(false);
      }
    };
    
    loadContent();
  }, [currentResource?.type, currentResource?.id, currentIndex]);
  
  // Notify parent when content changes
  useEffect(() => {
    if (onContentChange) {
      onContentChange(content);
    }
  }, [content, onContentChange]);

  // Add new resource to navigation stack
  const addResource = useCallback((resource: ResourceItem) => {
    setNavigationStack(prev => {
      // Remove any forward history
      const newStack = prev.slice(0, currentIndex + 1);
      // Add new resource
      return [...newStack, resource];
    });
    setCurrentIndex(prev => prev + 1);
  }, [currentIndex]);
  
  // Handle TA link clicks - add to navigation history
  const handleTALinkClick = useCallback((articleId: string, title?: string) => {
    const newResource: ResourceItem = {
      type: 'ta',
      id: articleId,
      title: title
    };
    addResource(newResource);
  }, [addResource]);
  
  // Handle TW link clicks - add to navigation history
  const handleTWLinkClick = useCallback((wordId: string, title?: string) => {
    const fullWordId = wordId.startsWith('bible/') ? wordId : `bible/${wordId}`;
    const newResource: ResourceItem = {
      type: 'tw',
      id: fullWordId,
      title: title
    };
    addResource(newResource);
  }, [addResource]);
  
  return (
    <ResourceModalPresentation
      isOpen={isOpen}
      isMinimized={isMinimized}
      content={content}
      loading={loading}
      error={error}
      navigation={navigationState}
      onClose={onClose}
      onMinimize={onMinimize}
      onRestore={onRestore}
      onNavigateBack={navigateBack}
      onNavigateForward={navigateForward}
      onTALinkClick={handleTALinkClick}
      onTWLinkClick={handleTWLinkClick}
    />
  );
};

// Export the container as the main ResourceModal
export const ResourceModal = ResourceModalContainer;
