/**
 * ResourceModalWrapper - Renders the ResourceModal at the app level
 * 
 * This component connects the ResourceModal to the ResourceModalContext
 * and renders it outside of any panel-specific components.
 */

import React, { useState } from 'react';
import { useResourceModal } from '../../contexts/ResourceModalContext';
import { MinimizedResourceButton } from './MinimizedResourceButton';
import { ResourceModal } from './ResourceModalContainer';
import { ResourceContent } from './ResourceModalPresentation';

export const ResourceModalWrapper: React.FC = () => {
  const { isOpen, isMinimized, initialResource, closeModal, minimizeModal, restoreModal } = useResourceModal();
  const [currentContent, setCurrentContent] = useState<ResourceContent | undefined>(undefined);

  return (
    <>
      {/* Full Modal */}
      {isOpen && (
        <ResourceModal
          isOpen={isOpen}
          isMinimized={isMinimized}
          initialResource={initialResource}
          onClose={closeModal}
          onMinimize={minimizeModal}
          onRestore={restoreModal}
          onContentChange={setCurrentContent}
        />
      )}
      
      {/* Minimized Floating Button - Rendered separately to not block interactions */}
      <MinimizedResourceButton
        isVisible={isOpen && isMinimized}
        content={currentContent}
        onRestore={restoreModal}
      />
    </>
  );
};
