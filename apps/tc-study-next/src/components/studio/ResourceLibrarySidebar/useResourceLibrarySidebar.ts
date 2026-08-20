import { useEffect, useMemo, useState } from 'react';
import { useAppStore } from '../../../contexts/AppContext';
import { useResourceManagement } from '../../../hooks';
import { useWorkspaceStore } from '../../../lib/stores/workspaceStore';
import { useWizardStore } from '../../../lib/stores/wizardStore';
import type { ResourceItem } from './types';

interface UseResourceLibrarySidebarOptions {
  propSelectedResourceKey?: string | null;
  propSelectedResourceKeys?: string[];
  onResourceDragStart?: (resourceKeys: string[]) => void;
  onResourceDragEnd?: () => void;
  onSelectedResourcesChange?: (resourceKeys: string[]) => void;
}

export function useResourceLibrarySidebar({
  propSelectedResourceKey,
  propSelectedResourceKeys,
  onResourceDragStart,
  onResourceDragEnd,
  onSelectedResourcesChange,
}: UseResourceLibrarySidebarOptions) {
  const [isDraggingOverTrash, setIsDraggingOverTrash] = useState(false);
  const [selectedResources, setSelectedResources] = useState<Set<string>>(new Set());
  const [showSaveDialog, setShowSaveDialog] = useState(false);
  const [showImportDialog, setShowImportDialog] = useState(false);

  const selectedResourceKey = propSelectedResourceKey ?? null;
  const workspaceResources = useWorkspaceStore((s) => s.currentPackage?.resources);
  const availableLanguages = useWizardStore((s) => s.availableLanguages);

  useAppStore((s) => Object.keys(s.loadedResources).length);

  const { getResourceUsageCount, removeResourceFromPackage } = useResourceManagement();

  const resources = useMemo((): ResourceItem[] => {
    if (!workspaceResources) return [];

    return Array.from(workspaceResources.values()).map((res) => ({
      id: res.key,
      key: res.key,
      title: res.title || res.id,
      type: res.type,
      abbreviation: res.abbreviation,
      subject: res.subject,
      language: res.language || 'en',
      languageCode: res.languageCode || res.language || 'en',
      languageName: res.languageName,
      owner: res.owner,
    }));
  }, [workspaceResources]);

  useEffect(() => {
    if (propSelectedResourceKeys !== undefined) {
      setSelectedResources(new Set(propSelectedResourceKeys));
    }
  }, [propSelectedResourceKeys]);

  const updateSelectedResources = (newSelected: Set<string>) => {
    setSelectedResources(newSelected);
    onSelectedResourcesChange?.(Array.from(newSelected));
  };

  const handleResourceClick = (resourceKey: string) => {
    const newSelected = new Set(selectedResources);
    if (newSelected.has(resourceKey)) {
      newSelected.delete(resourceKey);
    } else {
      newSelected.add(resourceKey);
    }
    updateSelectedResources(newSelected);
  };

  const handleDragStart = (e: React.DragEvent, resourceKey: string) => {
    const resourcesToDrag =
      selectedResources.has(resourceKey) && selectedResources.size > 0
        ? Array.from(selectedResources)
        : [resourceKey];

    e.dataTransfer.effectAllowed = 'copy';
    e.dataTransfer.setData('text/plain', JSON.stringify(resourcesToDrag));
    e.dataTransfer.setData('application/resource-keys', JSON.stringify(resourcesToDrag));
    onResourceDragStart?.(resourcesToDrag);
  };

  const handleDragEnd = () => {
    setIsDraggingOverTrash(false);
    onResourceDragEnd?.();
  };

  const handleTrashDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDraggingOverTrash(true);
  };

  const handleTrashDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDraggingOverTrash(false);
  };

  const handleDeleteResource = (resourceKey: string) => {
    const usageCount = getResourceUsageCount(resourceKey);
    const message =
      usageCount > 0
        ? `Remove "${resourceKey}" from collection? It's currently used in ${usageCount} panel(s) and will remain there until manually removed.`
        : `Remove "${resourceKey}" from collection?`;

    if (confirm(message)) {
      removeResourceFromPackage(resourceKey);
      updateSelectedResources(new Set());
    }
  };

  const handleDeleteMultipleResources = (resourceKeys: string[]) => {
    const count = resourceKeys.length;
    if (
      confirm(
        `Remove ${count} resource(s) from collection? Resources in use will remain in panels until manually removed.`,
      )
    ) {
      resourceKeys.forEach((key) => removeResourceFromPackage(key));
      updateSelectedResources(new Set());
    }
  };

  const handleTrashDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDraggingOverTrash(false);

    const resourceKeysJson =
      e.dataTransfer.getData('application/resource-keys') ||
      e.dataTransfer.getData('text/plain');
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

  const handleDeleteSelected = () => {
    if (selectedResources.size === 0) return;
    handleDeleteMultipleResources(Array.from(selectedResources));
  };

  return {
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
  };
}
