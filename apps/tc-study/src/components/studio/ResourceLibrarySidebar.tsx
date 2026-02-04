/**
 * ResourceLibrarySidebar - Collapsible sidebar showing all library resources
 * 
 * Features:
 * - Shows all resources from the user's library
 * - Collapsed state: Icon with resource ID
 * - Expanded state: Icon + more details (title, language, etc.)
 * - Draggable items for dropping into panels
 * - Pushes content (not overlay)
 */

import {
  Book,
  BookText,
  ChevronLeft,
  ChevronRight,
  FileText,
  FolderOpen,
  GraduationCap,
  HelpCircle,
  Link as LinkIcon,
  Package,
  Plus,
  Save,
  Trash2,
} from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useAppStore } from '../../contexts/AppContext';
import { useResourceManagement } from '../../hooks';
import { useWorkspaceStore } from '../../lib/stores/workspaceStore';
import { AddToCatalogWizard } from '../catalog/AddToCatalogWizard';
import { CollectionImportDialog } from '../collections/CollectionImportDialog';
import { SaveCollectionDialog } from '../collections/SaveCollectionDialog';


interface ResourceLibrarySidebarProps {
  onResourceDragStart?: (resourceKeys: string[]) => void;
  onResourceDragEnd?: () => void;
  onResourceSelect?: (resourceKey: string | null) => void;
  onSelectedResourcesChange?: (resourceKeys: string[]) => void;
  selectedResourceKey?: string | null;
  selectedResourceKeys?: string[];  // External control of selection
  showWizard?: boolean;
  onShowWizardChange?: (show: boolean) => void;
  activeCollection?: any;  // The currently active collection
}

// Map resource types/subjects to icons
const getResourceIcon = (type: string, subject?: string) => {
  const subjectLower = subject?.toLowerCase() || '';
  const typeLower = type.toLowerCase();
  
  if (subjectLower.includes('bible') || typeLower.includes('scripture')) {
    return Book;
  } else if (subjectLower.includes('words') || typeLower.includes('words')) {
    return BookText;
  } else if (subjectLower.includes('notes') || typeLower.includes('notes')) {
    return FileText;
  } else if (subjectLower.includes('questions') || typeLower.includes('questions')) {
    return HelpCircle;
  } else if (subjectLower.includes('academy') || typeLower.includes('academy')) {
    return GraduationCap;
  } else if (typeLower.includes('link')) {
    return LinkIcon;
  } else {
    return Package;
  }
};

// Get resource ID from resource key (e.g., "ult", "ugnt", "ust", "uhb")
const getResourceId = (key: string): string => {
  const parts = key.split('/');
  // Get last part and convert to uppercase
  const lastPart = parts[parts.length - 1] || key;
  return lastPart.toUpperCase();
};

// Get language display name - prefer stored name, then lookup from Door43, then fallback to code
const getLanguageName = (
  languageName: string | undefined, 
  languageCode: string | undefined, 
  availableLanguages: Array<{ code: string; name: string }>
): string => {
  // First priority: use the languageName if already stored in resource metadata
  if (languageName) return languageName;
  
  if (!languageCode) return 'Unknown';
  
  // Second priority: find the language in the available languages from Door43
  // This data is loaded at app startup from Door43 API
  const lang = availableLanguages.find(l => l.code.toLowerCase() === languageCode.toLowerCase());
  if (lang) return lang.name;
  
  // Last resort: show the uppercase language code
  // (Only reached if Door43 data hasn't loaded yet or language is not in Door43)
  return languageCode.toUpperCase();
};

export function ResourceLibrarySidebar({ 
  onResourceDragStart, 
  onResourceDragEnd,
  onResourceSelect,
  onSelectedResourcesChange,
  selectedResourceKey: propSelectedResourceKey,
  selectedResourceKeys: propSelectedResourceKeys,
  showWizard,
  onShowWizardChange,
  activeCollection
}: ResourceLibrarySidebarProps) {
  const [sidebarWidth, setSidebarWidth] = useState(288); // Default 288px (w-72)
  const [isDismissed, setIsDismissed] = useState(false);
  const [isResizing, setIsResizing] = useState(false);
  
  // Min and max width constraints with 4 breakpoints
  const MIN_WIDTH = 48; // Minimal state
  const MAX_WIDTH = 480; // Reasonable max
  const COMPACT_THRESHOLD = 100; // Above this: show resource ID + language
  const MEDIUM_THRESHOLD = 180; // Above this: show resource ID + title + language
  const EXPANDED_THRESHOLD = 260; // Above this: show full details with owner
  
  const setShowAddWizard = (show: boolean) => {
    if (onShowWizardChange) {
      onShowWizardChange(show);
    }
  };
  
  // Determine sidebar display mode based on width (4 breakpoints)
  const isExpanded = sidebarWidth > EXPANDED_THRESHOLD; // Show full details with owner
  const isMedium = sidebarWidth > MEDIUM_THRESHOLD && sidebarWidth <= EXPANDED_THRESHOLD; // Show title + language
  const isCompact = sidebarWidth > COMPACT_THRESHOLD && sidebarWidth <= MEDIUM_THRESHOLD; // Show ID + language
  const isMinimal = sidebarWidth <= COMPACT_THRESHOLD; // Show icon + ID only
  
  // Handle resize drag (mouse and touch)
  const handleMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    setIsResizing(true);
  };
  
  const handleTouchStart = (e: React.TouchEvent) => {
    e.preventDefault();
    setIsResizing(true);
  };
  
  // Handle mouse and touch move during resize
  useEffect(() => {
    const handleMove = (clientX: number) => {
      if (!isResizing) return;
      
      const newWidth = clientX;
      if (newWidth >= MIN_WIDTH && newWidth <= MAX_WIDTH) {
        setSidebarWidth(newWidth);
      }
    };
    
    const handleMouseMove = (e: MouseEvent) => {
      handleMove(e.clientX);
    };
    
    const handleTouchMove = (e: TouchEvent) => {
      if (e.touches.length > 0) {
        handleMove(e.touches[0].clientX);
      }
    };
    
    const handleEnd = () => {
      setIsResizing(false);
    };
    
    if (isResizing) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleEnd);
      document.addEventListener('touchmove', handleTouchMove, { passive: false });
      document.addEventListener('touchend', handleEnd);
      document.body.style.cursor = 'ew-resize';
      document.body.style.userSelect = 'none';
      document.body.style.touchAction = 'none';
      
      return () => {
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', handleEnd);
        document.removeEventListener('touchmove', handleTouchMove);
        document.removeEventListener('touchend', handleEnd);
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
        document.body.style.touchAction = '';
      };
    }
  }, [isResizing, MIN_WIDTH, MAX_WIDTH]);
  const [isDraggingOverTrash, setIsDraggingOverTrash] = useState(false);
  const [selectedResources, setSelectedResources] = useState<Set<string>>(new Set());
  const [showSaveDialog, setShowSaveDialog] = useState(false);
  const [showImportDialog, setShowImportDialog] = useState(false);
  
  // Use prop if provided, otherwise internal state
  const selectedResourceKey = propSelectedResourceKey ?? null;
  
  // Sync external selected resources state with internal state
  useEffect(() => {
    if (propSelectedResourceKeys !== undefined) {
      setSelectedResources(new Set(propSelectedResourceKeys));
    }
  }, [propSelectedResourceKeys]);
  
  // Notify parent when selected resources change
  const updateSelectedResources = (newSelected: Set<string>) => {
    setSelectedResources(newSelected);
    onSelectedResourcesChange?.(Array.from(newSelected));
  };
  
  // Get workspace store actions
  const removeResourceFromPackage = useWorkspaceStore((s) => s.removeResourceFromPackage);
  
  // Get workspace resources directly from the store - updates automatically!
  const workspaceResources = useWorkspaceStore((s) => s.currentPackage?.resources);
  
  // Get available languages from workspace store (populated from Door43)
  const availableLanguages = useWorkspaceStore((s) => s.availableLanguages);
  
  // Subscribe to loadedResources to trigger re-render when resources are added/removed from panels
  useAppStore((s) => Object.keys(s.loadedResources).length);
  
  // Get usage counts for resources
  const { getResourceUsageCount } = useResourceManagement();
  
  // Convert Map to ResourceItem array
  const resources = useMemo(() => {
    if (!workspaceResources) return [];
    
    const items = Array.from(workspaceResources.values()).map((res) => ({
      id: res.key,
      key: res.key,
      title: res.title || res.id,
      type: res.type,
      subject: res.subject,
      language: res.language || 'en',
      languageCode: res.languageCode || res.language || 'en',
      languageName: res.languageName, // Include language name from Door43
      owner: res.owner,
    }));
    
    console.log('📚 Workspace collection resources for sidebar:', items.length, items);
    return items;
  }, [workspaceResources]);
  
  const isLoading = false; // No async loading needed - store is always ready
  
  // Selection handler - always toggles multi-select
  const handleResourceClick = (resourceKey: string, event: React.MouseEvent) => {
    // Always use multi-select mode (toggle selection)
    const newSelected = new Set(selectedResources);
    if (newSelected.has(resourceKey)) {
      newSelected.delete(resourceKey);
      console.log('🎯 Resource deselected:', resourceKey);
    } else {
      newSelected.add(resourceKey);
      console.log('🎯 Resource selected:', resourceKey);
    }
    updateSelectedResources(newSelected);
    console.log('🎯 Multi-select:', Array.from(newSelected));
  };
  
  const handleDragStart = (e: React.DragEvent, resourceKey: string) => {
    // If the dragged resource is part of multi-selection, drag all selected
    // Otherwise, drag only the single resource
    const resourcesToDrag = selectedResources.has(resourceKey) && selectedResources.size > 0
      ? Array.from(selectedResources)
      : [resourceKey];
    
    console.log('🎯 Drag started:', resourcesToDrag.length > 1 ? `${resourcesToDrag.length} resources` : resourceKey);
    e.dataTransfer.effectAllowed = 'copy';
    e.dataTransfer.setData('text/plain', JSON.stringify(resourcesToDrag));
    e.dataTransfer.setData('application/resource-keys', JSON.stringify(resourcesToDrag));
    onResourceDragStart?.(resourcesToDrag);
  };
  
  const handleDragEnd = () => {
    console.log('🎯 Drag ended');
    setIsDraggingOverTrash(false);
    onResourceDragEnd?.();
  };
  
  // Trash drop zone handlers
  const handleTrashDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDraggingOverTrash(true);
  };
  
  const handleTrashDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDraggingOverTrash(false);
  };
  
  const handleTrashDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDraggingOverTrash(false);
    
    // Try to get multiple resource keys first
    const resourceKeysJson = e.dataTransfer.getData('application/resource-keys') || e.dataTransfer.getData('text/plain');
    let resourceKeys: string[] = [];
    
    try {
      resourceKeys = JSON.parse(resourceKeysJson);
      if (!Array.isArray(resourceKeys)) {
        resourceKeys = [resourceKeysJson];
      }
    } catch {
      resourceKeys = [resourceKeysJson];
    }
    
    if (resourceKeys.length > 0 && resourceKeys[0]) {
      if (resourceKeys.length === 1) {
        handleDeleteResource(resourceKeys[0]);
      } else {
        handleDeleteMultipleResources(resourceKeys);
      }
    }
  };
  
  // Delete resource(s) from workspace collection
  const handleDeleteResource = (resourceKey: string) => {
    const usageCount = getResourceUsageCount(resourceKey);
    const message = usageCount > 0
      ? `Remove "${resourceKey}" from collection? It's currently used in ${usageCount} panel(s) and will remain there until manually removed.`
      : `Remove "${resourceKey}" from collection?`;
    
    if (confirm(message)) {
      removeResourceFromPackage(resourceKey);
      updateSelectedResources(new Set()); // Clear selection
      console.log('🗑️ Removed resource from collection:', resourceKey);
    }
  };
  
  // Delete multiple resources (from drag-drop)
  const handleDeleteMultipleResources = (resourceKeys: string[]) => {
    const count = resourceKeys.length;
    if (confirm(`Remove ${count} resource(s) from collection? Resources in use will remain in panels until manually removed.`)) {
      resourceKeys.forEach(key => removeResourceFromPackage(key));
      updateSelectedResources(new Set()); // Clear selection
      console.log('🗑️ Removed resources from collection:', resourceKeys);
    }
  };
  
  // Delete multiple selected resources (from click)
  const handleDeleteSelected = () => {
    if (selectedResources.size === 0) return;
    
    const resourceKeys = Array.from(selectedResources);
    handleDeleteMultipleResources(resourceKeys);
  };
  
  // Save current workspace (or download as .btc.zip)
  const handleSaveCollection = () => {
    setShowSaveDialog(true);
  };
  
  // Load a collection into workspace
  const handleLoadCollection = () => {
    setShowImportDialog(true);
  };
  
  
  return (
    <>
      {/* Show sidebar stripe when dismissed - minimal stripe matching nav toggle */}
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
            {/* Collapse Stripe */}
            <button
              onClick={() => setIsDismissed(true)}
              className="flex-shrink-0 w-full bg-gray-50 hover:bg-gray-100 transition-colors cursor-pointer flex items-center justify-center py-0.5"
              title="Hide sidebar"
              aria-label="Hide sidebar"
            >
              <ChevronLeft className="w-3 h-3 text-gray-300 hover:text-gray-400 transition-colors" />
            </button>

          {/* Header */}
          <div className={`border-b border-gray-100 bg-white ${
            isExpanded ? 'px-3 py-2' : isMedium ? 'px-2.5 py-2' : isCompact ? 'px-2 py-1.5' : 'px-1 py-1.5 justify-center'
          }`}>
            {/* Collection name (if available) - only show in expanded/medium modes */}
            {activeCollection && (isExpanded || isMedium) && (
              <div className="flex items-center gap-1.5 mb-2">
                <FolderOpen className="w-3.5 h-3.5 text-blue-600 flex-shrink-0" />
                <span className="text-xs font-medium text-blue-900 truncate" title={activeCollection.title || activeCollection.name}>
                  {activeCollection.title || activeCollection.name}
                </span>
              </div>
            )}
            
            <div className="flex items-center">
              {/* Add button - always visible */}
              <button
                onClick={() => setShowAddWizard(true)}
                className="p-1 bg-blue-600 hover:bg-blue-700 rounded-full transition-colors"
                title="Add resources"
                aria-label="Add resources to library"
              >
                <Plus className="w-3.5 h-3.5 text-white" />
              </button>
            </div>
          </div>
          
          {/* Resource List */}
          <div className="flex-1 overflow-y-auto pl-1 pr-2">
        {isLoading ? (
          <div className={`text-center text-sm text-gray-400 ${
            isExpanded ? 'p-4' : isMedium ? 'p-3.5' : isCompact ? 'p-3' : 'p-2'
          }`}>
            {isExpanded || isMedium || isCompact ? 'Loading...' : '...'}
          </div>
        ) : resources.length === 0 ? (
          <div className={`text-center ${isExpanded ? 'p-4' : isMedium ? 'p-3.5' : isCompact ? 'p-3' : 'p-2'}`}>
            {isExpanded || isMedium ? (
              <div className="text-sm text-gray-500">
                <Package className="w-8 h-8 mx-auto mb-2 text-gray-300" />
                <p>No resources</p>
              </div>
            ) : isCompact ? (
              <div className="text-xs text-gray-500">
                <Package className="w-6 h-6 mx-auto mb-1 text-gray-300" />
                <p>Empty</p>
              </div>
            ) : (
              <Package className="w-4 h-4 mx-auto text-gray-300" />
            )}
          </div>
        ) : (
          <div className={isExpanded ? 'py-2' : isMedium ? 'py-2' : isCompact ? 'py-1.5' : 'py-1'}>
            {resources.map((resource) => {
              const Icon = getResourceIcon(resource.type, resource.subject);
              const resourceId = getResourceId(resource.key);
              const languageName = getLanguageName(resource.languageName, resource.languageCode || resource.language, availableLanguages);
              const usageCount = getResourceUsageCount(resource.key);
              
              const isSelected = selectedResourceKey === resource.key;
              const isMultiSelected = selectedResources.has(resource.key);
              
              return (
                <div
                  key={resource.key}
                  draggable
                  onDragStart={(e) => handleDragStart(e, resource.key)}
                  onDragEnd={handleDragEnd}
                  onClick={(e) => handleResourceClick(resource.key, e)}
                  className={`transition-all group relative cursor-pointer ${
                    isExpanded
                      ? `mx-2 mb-2 rounded-lg border-2 p-3 ${
                          isSelected
                            ? 'border-blue-500 bg-blue-50 shadow-md'
                            : isMultiSelected
                            ? 'border-purple-500 bg-purple-50 shadow-md'
                            : 'border-gray-200 bg-white hover:bg-blue-50 hover:border-blue-300'
                        }`
                      : isMedium
                      ? `mx-2 mb-2 rounded-lg border p-2.5 ${
                          isSelected
                            ? 'border-blue-500 bg-blue-50 shadow-sm'
                            : isMultiSelected
                            ? 'border-purple-500 bg-purple-50 shadow-sm'
                            : 'border-gray-200 bg-white hover:bg-blue-50 hover:border-blue-300'
                        }`
                      : isCompact
                      ? `mx-1.5 mb-1.5 rounded-md border p-2 ${
                          isSelected
                            ? 'border-blue-500 bg-blue-50 shadow-sm'
                            : isMultiSelected
                            ? 'border-purple-500 bg-purple-50 shadow-sm'
                            : 'border-gray-200 bg-white hover:bg-blue-50 hover:border-blue-300'
                        }`
                      : `mx-1 mb-1.5 rounded-md border py-1.5 px-1 ${
                          isSelected
                            ? 'border-blue-400 bg-blue-50'
                            : isMultiSelected
                            ? 'border-purple-400 bg-purple-50'
                            : 'border-gray-200 bg-gray-50 hover:bg-blue-50 hover:border-blue-300'
                        }`
                  }`}
                  title={
                    isExpanded
                      ? `Click to select (multi-select), drag to add or drag to trash\n${resource.title}${usageCount > 0 ? ` (${usageCount} in use)` : ''}`
                      : resource.title
                  }
                >
                  {/* Usage indicator */}
                  {usageCount > 0 && (
                    <div className={`absolute rounded-full bg-gray-200 text-gray-600 font-medium opacity-70 group-hover:opacity-100 transition-opacity ${
                      isExpanded
                        ? 'top-1 right-1 px-1.5 py-0.5 text-[9px]'
                        : isMedium
                        ? 'top-1 right-1 px-1.5 py-0.5 text-[9px]'
                        : isCompact
                        ? 'top-0.5 right-0.5 px-1 py-0.5 text-[8px]'
                        : 'top-0.5 right-0.5 w-3 h-3 text-[7px] flex items-center justify-center'
                    }`}>
                      {usageCount}
                    </div>
                  )}
                  
                  {isMinimal ? (
                    // 1. Minimal (≤100px): Icon + Resource ID only
                    <div className="flex flex-col items-center gap-0.5">
                      <Icon className="w-4 h-4 text-gray-500 group-hover:text-blue-600 transition-colors" />
                      <span className="text-[8px] font-bold text-gray-600 group-hover:text-blue-700 leading-tight text-center">
                        {resourceId}
                      </span>
                    </div>
                  ) : isCompact ? (
                    // 2. Compact (100-180px): Icon + Resource ID + Language
                    <div className="flex items-center gap-2">
                      <Icon className="w-4 h-4 text-gray-600 group-hover:text-blue-600 flex-shrink-0" />
                      <div className="flex-1 min-w-0">
                        <div className="text-xs font-bold text-gray-900 group-hover:text-blue-900">
                          {resourceId}
                        </div>
                        <div className="text-[10px] text-gray-500 truncate mt-0.5">
                          {languageName}
                        </div>
                      </div>
                    </div>
                  ) : isMedium ? (
                    // 3. Medium (180-260px): Icon + Resource ID + Full Title + Language
                    <div className="flex items-start gap-2.5">
                      <Icon className="w-4 h-4 text-gray-600 group-hover:text-blue-600 flex-shrink-0 mt-0.5" />
                      <div className="flex-1 min-w-0">
                        <div className="text-xs font-bold text-gray-900 group-hover:text-blue-900">
                          {resourceId}
                        </div>
                        <div className="text-[11px] text-gray-700 truncate mt-0.5 leading-tight">
                          {resource.title}
                        </div>
                        <div className="text-[10px] text-gray-500 truncate mt-0.5">
                          {languageName}
                        </div>
                      </div>
                    </div>
                  ) : (
                    // 4. Expanded (>260px): Icon + Resource ID + Full Title + Language + Owner
                    <div className="flex items-start gap-3">
                      <Icon className="w-5 h-5 text-gray-600 group-hover:text-blue-600 flex-shrink-0 mt-0.5" />
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-bold text-gray-900 group-hover:text-blue-900">
                          {resourceId}
                        </div>
                        <div className="text-xs text-gray-700 truncate mt-0.5">
                          {resource.title}
                        </div>
                        <div className="flex items-center gap-2 mt-1">
                          <span className="text-xs text-gray-600">
                            {languageName}
                          </span>
                          <span className="text-xs text-gray-400">•</span>
                          <span className="text-xs text-gray-500 truncate">
                            {resource.owner}
                          </span>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
      
      {/* Footer - Resource count */}
      {!isLoading && resources.length > 0 && (
        <div className={`border-t border-gray-100 bg-white ${
          isExpanded ? 'px-3 py-1.5' : isMedium ? 'px-2.5 py-1.5' : isCompact ? 'px-2 py-1' : 'px-1 py-1'
        }`}>
          {isExpanded || isMedium ? (
            <div className="text-xs text-gray-500 text-center font-semibold" title={`${resources.length} ${resources.length === 1 ? 'resource' : 'resources'}`}>
              {resources.length}
            </div>
          ) : isCompact ? (
            <div className="text-[10px] text-gray-500 text-center font-semibold" title={`${resources.length} ${resources.length === 1 ? 'resource' : 'resources'}`}>
              {resources.length}
            </div>
          ) : (
            <div className="text-[10px] text-gray-400 text-center font-medium" title={`${resources.length} ${resources.length === 1 ? 'resource' : 'resources'}`}>
              {resources.length}
            </div>
          )}
        </div>
      )}
      
      {/* Collection Controls */}
      <div className={`border-t border-gray-100 bg-white ${
        isExpanded ? 'px-3 py-2' : isMedium ? 'px-2.5 py-2' : isCompact ? 'px-2 py-1.5' : 'px-1 py-1.5'
      }`}>
        {isExpanded ? (
          <div className="flex items-center justify-center gap-2">
            <button
              onDragOver={handleTrashDragOver}
              onDragLeave={handleTrashDragLeave}
              onDrop={handleTrashDrop}
              onClick={selectedResources.size > 0 ? handleDeleteSelected : undefined}
              className={`p-2 rounded transition-all ${
                isDraggingOverTrash
                  ? 'bg-red-100 text-red-700 scale-110'
                  : selectedResources.size > 0
                  ? 'bg-red-50 text-red-600 hover:bg-red-100'
                  : 'text-red-600 hover:bg-red-50'
              }`}
              title={
                selectedResources.size > 0
                  ? `Delete ${selectedResources.size} selected resource(s) from collection`
                  : "Drag resource here to remove from collection"
              }
              aria-label={
                selectedResources.size > 0
                  ? `Delete ${selectedResources.size} selected resources from collection`
                  : "Delete resource from collection"
              }
            >
              <Trash2 className="w-4 h-4" />
              {selectedResources.size > 0 && (
                <span className="absolute -top-1 -right-1 w-4 h-4 bg-purple-600 text-white text-[10px] font-bold rounded-full flex items-center justify-center">
                  {selectedResources.size}
                </span>
              )}
            </button>
            <button
              onClick={handleSaveCollection}
              className="p-2 text-gray-700 hover:bg-gray-100 rounded transition-colors"
              title="Save or download collection"
              aria-label="Save or download collection"
            >
              <Save className="w-4 h-4" />
            </button>
            <button
              onClick={handleLoadCollection}
              className="p-2 text-gray-700 hover:bg-gray-100 rounded transition-colors"
              title="Load collection"
              aria-label="Load collection"
            >
              <FolderOpen className="w-4 h-4" />
            </button>
          </div>
        ) : (
          <div className="flex flex-col gap-1.5">
            <button
              onDragOver={handleTrashDragOver}
              onDragLeave={handleTrashDragLeave}
              onDrop={handleTrashDrop}
              onClick={selectedResources.size > 0 ? handleDeleteSelected : undefined}
              className={`p-1 flex items-center justify-center rounded transition-all relative ${
                isDraggingOverTrash
                  ? 'bg-red-100 text-red-700 scale-110'
                  : selectedResources.size > 0
                  ? 'bg-red-50 text-red-600 hover:bg-red-100'
                  : 'text-red-600 hover:bg-red-50'
              }`}
              title={
                selectedResources.size > 0
                  ? `Delete ${selectedResources.size} selected`
                  : "Drag to delete"
              }
              aria-label={
                selectedResources.size > 0
                  ? `Delete ${selectedResources.size} selected resources`
                  : "Delete resource"
              }
            >
              <Trash2 className="w-3.5 h-3.5" />
              {selectedResources.size > 0 && (
                <span className="absolute -top-0.5 -right-0.5 w-3 h-3 bg-purple-600 text-white text-[8px] font-bold rounded-full flex items-center justify-center">
                  {selectedResources.size}
                </span>
              )}
            </button>
            <button
              onClick={handleSaveCollection}
              className="p-1 text-gray-500 hover:bg-gray-50 rounded transition-colors flex items-center justify-center"
              title="Save or download collection"
              aria-label="Save or download collection"
            >
              <Save className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={handleLoadCollection}
              className="p-1 text-gray-500 hover:bg-gray-50 rounded transition-colors flex items-center justify-center"
              title="Load collection"
              aria-label="Load collection"
            >
              <FolderOpen className="w-3.5 h-3.5" />
            </button>
          </div>
        )}
          </div>
          </>
        )}
        
        {isDismissed && (
          /* Dismissed: Show pull-down stripe */
          <button
            onClick={() => setIsDismissed(false)}
            className="absolute left-0 top-0 w-12 bg-gray-50 hover:bg-gray-100 transition-colors cursor-pointer flex items-center justify-center py-0.5 z-10"
            title="Show sidebar"
            aria-label="Show sidebar"
          >
            <ChevronRight className="w-3 h-3 text-gray-300 hover:text-gray-400 transition-colors" />
          </button>
        )}
        
        {/* Resize Handle - Draggable edge (mouse and touch) */}
        {!isDismissed && (
          <div
            onMouseDown={handleMouseDown}
            onTouchStart={handleTouchStart}
            className={`absolute right-0 top-0 w-1.5 h-full cursor-ew-resize transition-colors ${
              isResizing ? 'bg-blue-500' : 'bg-gray-300 hover:bg-blue-400'
            }`}
            title="Drag to resize"
            aria-label="Resize sidebar"
          >
            {/* Touch-friendly hitbox */}
            <div className="absolute right-0 top-0 w-4 h-full -translate-x-1/2" />
            
            {/* Visual grip indicator - 3 vertical dots */}
            <div className="absolute flex flex-col gap-1 left-1/2 -translate-x-1/2 top-1/2 -translate-y-1/2 pointer-events-none">
              <div className={`w-1 h-1 rounded-full transition-colors ${
                isResizing ? 'bg-white' : 'bg-gray-500'
              }`} />
              <div className={`w-1 h-1 rounded-full transition-colors ${
                isResizing ? 'bg-white' : 'bg-gray-500'
              }`} />
              <div className={`w-1 h-1 rounded-full transition-colors ${
                isResizing ? 'bg-white' : 'bg-gray-500'
              }`} />
            </div>
          </div>
        )}
      </div>
      
      {/* Save/Download Collection Dialog */}
      {showSaveDialog && (
        <SaveCollectionDialog
          isOpen={showSaveDialog}
          onClose={() => setShowSaveDialog(false)}
          onSaved={(collectionId) => {
            console.log('✅ Collection saved:', collectionId);
            setShowSaveDialog(false);
          }}
        />
      )}
      
      {/* Import/Load Collection Dialog */}
      {showImportDialog && (
        <CollectionImportDialog
          isOpen={showImportDialog}
          onClose={() => setShowImportDialog(false)}
        />
      )}
    </>
  );
}

// Export wizard component separately for layout integration
export function ResourceWizardPanel({ 
  show, 
  onClose 
}: { 
  show: boolean; 
  onClose: () => void;
}) {
  if (!show) return null;
  
  const handleComplete = () => {
    console.log('✅ Resources added successfully');
    onClose();
  };
  
  return (
    <AddToCatalogWizard
      onClose={onClose}
      onComplete={handleComplete}
      isEmbedded={false}
    />
  );
}
