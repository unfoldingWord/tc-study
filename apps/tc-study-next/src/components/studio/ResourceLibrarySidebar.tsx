/**
 * ResourceLibrarySidebar - Collapsible sidebar showing all library resources
 */

import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useState } from 'react';
import { CollectionImportDialog } from '../collections/CollectionImportDialog';
import { SaveCollectionDialog } from '../collections/SaveCollectionDialog';
import { ResourceLibraryControls } from './ResourceLibrarySidebar/ResourceLibraryControls';
import { ResourceLibraryHeader } from './ResourceLibrarySidebar/ResourceLibraryHeader';
import { ResourceLibraryFooter, ResourceLibraryList } from './ResourceLibrarySidebar/ResourceLibraryList';
import { SidebarResizeHandle } from './ResourceLibrarySidebar/SidebarResizeHandle';
import type { ResourceLibrarySidebarProps } from './ResourceLibrarySidebar/types';
import { useResourceLibrarySidebar } from './ResourceLibrarySidebar/useResourceLibrarySidebar';
import { useSidebarResize } from './ResourceLibrarySidebar/useSidebarResize';

export { ResourceWizardPanel } from './ResourceLibrarySidebar/ResourceWizardPanel';
export type { ResourceLibrarySidebarProps } from './ResourceLibrarySidebar/types';

export function ResourceLibrarySidebar({
  onResourceDragStart,
  onResourceDragEnd,
  onSelectedResourcesChange,
  selectedResourceKey: propSelectedResourceKey,
  selectedResourceKeys: propSelectedResourceKeys,
  onShowWizardChange,
  activeCollection,
}: ResourceLibrarySidebarProps) {
  const [isDismissed, setIsDismissed] = useState(false);

  const { sidebarWidth, isResizing, displayMode, handleMouseDown, handleTouchStart } =
    useSidebarResize();

  const {
    resources,
    availableLanguages,
    selectedResourceKey,
    selectedResources,
    isDraggingOverTrash,
    showSaveDialog,
    setShowSaveDialog,
    showImportDialog,
    setShowImportDialog,
    getResourceUsageCount,
    handleResourceClick,
    handleDragStart,
    handleDragEnd,
    handleTrashDragOver,
    handleTrashDragLeave,
    handleTrashDrop,
    handleDeleteSelected,
  } = useResourceLibrarySidebar({
    propSelectedResourceKey,
    propSelectedResourceKeys,
    onResourceDragStart,
    onResourceDragEnd,
    onSelectedResourcesChange,
  });

  const setShowAddWizard = (show: boolean) => onShowWizardChange?.(show);

  return (
    <>
      {isDismissed && (
        <button
          onClick={() => setIsDismissed(false)}
          className="flex-shrink-0 h-full bg-gray-50 hover:bg-gray-100 transition-colors cursor-pointer flex flex-col items-center justify-start py-0.5 border-r border-gray-200"
          title="Show sidebar"
          aria-label="Show sidebar"
        >
          <ChevronRight className="w-3 h-3 text-gray-300 hover:text-gray-400 transition-colors" />
        </button>
      )}

      <div
        className={`relative h-full bg-white border-r border-gray-200 flex flex-col ${
          isDismissed ? 'hidden' : ''
        }`}
        style={{ width: isDismissed ? 0 : `${sidebarWidth}px` }}
      >
        {!isDismissed && (
          <>
            <button
              onClick={() => setIsDismissed(true)}
              className="flex-shrink-0 w-full bg-gray-50 hover:bg-gray-100 transition-colors cursor-pointer flex items-center justify-center py-0.5"
              title="Hide sidebar"
              aria-label="Hide sidebar"
            >
              <ChevronLeft className="w-3 h-3 text-gray-300 hover:text-gray-400 transition-colors" />
            </button>

            <ResourceLibraryHeader
              displayMode={displayMode}
              activeCollection={activeCollection}
              onAddClick={() => setShowAddWizard(true)}
            />

            <div className="flex-1 overflow-y-auto pl-1 pr-2">
              <ResourceLibraryList
                resources={resources}
                displayMode={displayMode}
                availableLanguages={availableLanguages}
                selectedResourceKey={selectedResourceKey}
                selectedResources={selectedResources}
                getResourceUsageCount={getResourceUsageCount}
                onResourceClick={handleResourceClick}
                onDragStart={handleDragStart}
                onDragEnd={handleDragEnd}
              />
            </div>

            {resources.length > 0 && (
              <ResourceLibraryFooter resourceCount={resources.length} displayMode={displayMode} />
            )}

            <ResourceLibraryControls
              displayMode={displayMode}
              selectedCount={selectedResources.size}
              isDraggingOverTrash={isDraggingOverTrash}
              onTrashDragOver={handleTrashDragOver}
              onTrashDragLeave={handleTrashDragLeave}
              onTrashDrop={handleTrashDrop}
              onDeleteSelected={handleDeleteSelected}
              onSaveCollection={() => setShowSaveDialog(true)}
              onLoadCollection={() => setShowImportDialog(true)}
            />
          </>
        )}

        {isDismissed && (
          <button
            onClick={() => setIsDismissed(false)}
            className="absolute left-0 top-0 w-12 bg-gray-50 hover:bg-gray-100 transition-colors cursor-pointer flex items-center justify-center py-0.5 z-10"
            title="Show sidebar"
            aria-label="Show sidebar"
          >
            <ChevronRight className="w-3 h-3 text-gray-300 hover:text-gray-400 transition-colors" />
          </button>
        )}

        {!isDismissed && (
          <SidebarResizeHandle
            isResizing={isResizing}
            onMouseDown={handleMouseDown}
            onTouchStart={handleTouchStart}
          />
        )}
      </div>

      {showSaveDialog && (
        <SaveCollectionDialog
          isOpen={showSaveDialog}
          onClose={() => setShowSaveDialog(false)}
          onSaved={() => setShowSaveDialog(false)}
        />
      )}

      {showImportDialog && (
        <CollectionImportDialog
          isOpen={showImportDialog}
          onClose={() => setShowImportDialog(false)}
        />
      )}
    </>
  );
}
