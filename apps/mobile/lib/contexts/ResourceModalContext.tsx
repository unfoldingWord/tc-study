/**
 * ResourceModalContext - Global state management for the unified resource modal
 * 
 * This context manages the resource modal state at a high level, preventing
 * it from being affected by panel re-renders or workspace changes.
 */

import React, { createContext, ReactNode, useCallback, useContext, useRef, useState } from 'react';

// Import ResourceItem from the service layer
import { ResourceItem } from '../services/ResourceContentService';

// Re-export for convenience
export type { ResourceItem };

interface ResourceModalContextType {
  // Modal state
  isOpen: boolean;
  isMinimized: boolean;
  initialResource: ResourceItem | null;
  
  // Actions
  openModal: (resource: ResourceItem) => void;
  addResourceToModal: (resource: ResourceItem) => void; // Add resource to existing modal
  closeModal: () => void;
  minimizeModal: () => void;
  restoreModal: () => void;
}

const ResourceModalContext = createContext<ResourceModalContextType | null>(null);

interface ResourceModalProviderProps {
  children: ReactNode;
}

export const ResourceModalProvider: React.FC<ResourceModalProviderProps> = ({ children }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [isMinimized, setIsMinimized] = useState(false);
  const [initialResource, setInitialResource] = useState<ResourceItem | null>(null);
  
  // Keep track of the last resource to prevent unnecessary updates
  const lastResourceRef = useRef<string | null>(null);

  const openModal = useCallback((resource: ResourceItem) => {
    const resourceKey = `${resource.type}/${resource.id}`;
    
    
    // Use refs to avoid dependency on changing state
    const currentIsOpen = isOpen;
    const currentIsMinimized = isMinimized;
    
    // Check if this is the same resource as the last one
    if (lastResourceRef.current === resourceKey && currentIsOpen) {
      
      if (currentIsMinimized) {
        setIsMinimized(false); // Just restore, don't update initialResource
      }
      return;
    }
    
    // Update the last resource tracker
    lastResourceRef.current = resourceKey;
    
    // If modal is already open and minimized, add to existing modal instead
    if (currentIsOpen && currentIsMinimized) {
      
      setInitialResource(resource); // This will trigger the modal to add to history
      setIsMinimized(false); // Restore the modal
    } else {
      // Fresh modal open
      
      setInitialResource(resource);
      setIsOpen(true);
      setIsMinimized(false);
    }
  }, []); // Remove state dependencies to prevent re-creation

  const addResourceToModal = useCallback((resource: ResourceItem) => {
    
    const currentIsOpen = isOpen;
    const currentIsMinimized = isMinimized;
    
    if (currentIsOpen) {
      setInitialResource(resource); // This will trigger the modal to add to history
      if (currentIsMinimized) {
        setIsMinimized(false); // Restore if minimized
      }
    } else {
      // If modal isn't open, just open it normally
      openModal(resource);
    }
  }, [openModal]); // Only depend on openModal

  const closeModal = useCallback(() => {
    
    setIsOpen(false);
    setIsMinimized(false);
    setInitialResource(null);
    lastResourceRef.current = null;
  }, []);

  const minimizeModal = useCallback(() => {
    
    setIsMinimized(true);
  }, []);

  const restoreModal = useCallback(() => {
    
    setIsMinimized(false);
  }, []);

  const contextValue: ResourceModalContextType = {
    isOpen,
    isMinimized,
    initialResource,
    openModal,
    addResourceToModal,
    closeModal,
    minimizeModal,
    restoreModal,
  };

  return (
    <ResourceModalContext.Provider value={contextValue}>
      {children}
    </ResourceModalContext.Provider>
  );
};

export const useResourceModal = (): ResourceModalContextType => {
  const context = useContext(ResourceModalContext);
  if (!context) {
    throw new Error('useResourceModal must be used within a ResourceModalProvider');
  }
  return context;
};
