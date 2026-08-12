/**
 * Panel Assignment Step
 * 
 * Final step in the resource addition wizard.
 * Allows users to assign selected resources to Panel 1 or Panel 2
 * with drag-and-drop and reordering.
 */

import { useState } from 'react'
import type { ResourceInfo } from '../../contexts/types'
import { useWorkspaceStore } from '../../lib/stores/workspaceStore'
import { useWizardStore } from '../../lib/stores/wizardStore'
import {
  assignResourceToPanel,
  removeResourceFromPanel,
} from '../../features/workspace/resourceMutations'
import { Layers, GripVertical, X, Plus, Monitor } from 'lucide-react'

export function PanelAssignmentStep() {
  const [draggedResource, setDraggedResource] = useState<string | null>(null)
  const [dragOverPanel, setDragOverPanel] = useState<'panel-1' | 'panel-2' | null>(null)
  
  const selectedResourceKeys = useWizardStore((state) => state.selectedResourceKeys)
  const availableResources = useWizardStore((state) => state.availableResources)
  const currentPackage = useWorkspaceStore((state) => state.currentPackage)
  
  const setActiveResourceInPanel = useWorkspaceStore((state) => state.setActiveResourceInPanel)
  
  if (!currentPackage) {
    return <div className="text-center py-12 text-fg-secondary">No workspace package loaded</div>
  }
  
  // Get panel configs (dynamic panels)
  const panel1 = currentPackage.panels.find(p => p.id === 'panel-1')
  const panel2 = currentPackage.panels.find(p => p.id === 'panel-2')
  
  // Get selected resources that aren't assigned yet, excluding workspace resources
  const unassignedResources = Array.from(selectedResourceKeys)
    .filter(key => {
      const resource = availableResources.get(key)
      const isInWorkspace = resource?.isInWorkspace
      
      // Skip resources that are already in the workspace collection
      if (isInWorkspace) {
        return false
      }
      const inPanel1 = panel1?.resourceKeys.includes(key) || false
      const inPanel2 = panel2?.resourceKeys.includes(key) || false
      return !inPanel1 && !inPanel2
    })
    .map(key => ({
      key,
      info: availableResources.get(key)
    }))
    .filter(r => r.info)
  
  // Get resources for each panel, excluding workspace resources
  const panel1Resources = (panel1?.resourceKeys || [])
    .map(key => ({
      key,
      info: availableResources.get(key)
    }))
    .filter((r): r is { key: string; info: ResourceInfo } => {
      if (!r.info) return false
      return !r.info.isInWorkspace
    })
    
  const panel2Resources = (panel2?.resourceKeys || [])
    .map(key => ({
      key,
      info: availableResources.get(key)
    }))
    .filter((r): r is { key: string; info: ResourceInfo } => {
      if (!r.info) return false
      return !r.info.isInWorkspace
    })
  
  // Drag handlers
  const handleDragStart = (resourceKey: string) => {
    setDraggedResource(resourceKey)
  }
  
  const handleDragEnd = () => {
    setDraggedResource(null)
    setDragOverPanel(null)
  }
  
  const handleDragOver = (e: React.DragEvent, panelId: 'panel-1' | 'panel-2') => {
    e.preventDefault()
    setDragOverPanel(panelId)
  }
  
  const handleDragLeave = () => {
    setDragOverPanel(null)
  }
  
  const handleDrop = (e: React.DragEvent, panelId: 'panel-1' | 'panel-2') => {
    e.preventDefault()
    if (draggedResource) {
      assignResourceToPanel(draggedResource, panelId)
      setDraggedResource(null)
      setDragOverPanel(null)
    }
  }
  
  const handleRemove = (resourceKey: string, panelId: 'panel-1' | 'panel-2') => {
    removeResourceFromPanel(resourceKey, panelId)
  }
  
  const handleSetActive = (panelId: 'panel-1' | 'panel-2', index: number) => {
    setActiveResourceInPanel(panelId, index)
  }
  
  const ResourceCard = ({ 
    resourceKey, 
    resource, 
    isDragging = false,
    panelId,
    index,
    isActive
  }: { 
    resourceKey: string
    resource: ResourceInfo
    isDragging?: boolean
    panelId?: 'panel-1' | 'panel-2'
    index?: number
    isActive?: boolean
  }) => (
    <div
      draggable
      onDragStart={() => handleDragStart(resourceKey)}
      onDragEnd={handleDragEnd}
      className={`
        p-3 bg-surface border-2 rounded-lg cursor-move transition-all
        ${isDragging ? 'opacity-50 border-accent' : 'border-border hover:border-accent'}
        ${isActive ? 'ring-2 ring-accent border-accent' : ''}
      `}
    >
      <div className="flex items-start gap-2">
        <GripVertical className="w-4 h-4 text-fg-muted flex-shrink-0 mt-0.5" />
        <div className="flex-1 min-w-0">
          <div className="font-medium text-fg text-sm truncate">
            {resource.title}
          </div>
          <div className="text-xs text-fg-secondary">
            {resource.owner} • {resource.language.toUpperCase()}
          </div>
        </div>
        {panelId && index !== undefined && (
          <div className="flex items-center gap-1">
            <input
              type="radio"
              checked={isActive}
              onChange={() => handleSetActive(panelId, index)}
              className="w-4 h-4 text-accent"
              title="Set as active"
            />
            <button
              onClick={() => handleRemove(resourceKey, panelId)}
              className="p-1 hover:bg-danger-soft rounded text-danger"
              title="Remove from panel"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        )}
      </div>
    </div>
  )
  
  const PanelDropZone = ({ 
    panelId, 
    resources, 
    activeIndex 
  }: { 
    panelId: 'panel-1' | 'panel-2'
    resources: Array<{ key: string; info: ResourceInfo }>
    activeIndex: number
  }) => (
    <div className="flex flex-col h-full">
      {/* Panel Header */}
      <div className="bg-muted border-2 border-border border-b-0 rounded-t-lg px-4 py-3">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold text-fg flex items-center gap-2">
            <Monitor className="w-5 h-5 text-fg-secondary" />
            {panelId === 'panel-1' ? 'Panel 1' : 'Panel 2'}
          </h3>
          <span className="text-sm text-fg-secondary bg-surface px-2 py-1 rounded border border-border">
            {resources.length} resource(s)
          </span>
        </div>
      </div>
      
      {/* Panel Content Area */}
      <div
        onDragOver={(e) => handleDragOver(e, panelId)}
        onDragLeave={handleDragLeave}
        onDrop={(e) => handleDrop(e, panelId)}
        className={`
          flex-1 p-4 border-2 rounded-b-lg min-h-[400px] transition-all bg-surface
          ${dragOverPanel === panelId ? 'border-accent bg-accent-soft' : 'border-border'}
        `}
      >
        {resources.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-fg-muted">
            <Plus className="w-12 h-12 mb-2" />
            <p className="text-sm">Drag resources here</p>
            <p className="text-xs mt-1">This panel is empty</p>
          </div>
        ) : (
          <div className="space-y-2">
            {resources.map(({ key, info }, index) => (
              <ResourceCard
                key={key}
                resourceKey={key}
                resource={info}
                panelId={panelId}
                index={index}
                isActive={index === activeIndex}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  )
  
  return (
    <div>
      {/* Header */}
      <div className="mb-6">
        <h2 className="text-2xl font-bold text-fg mb-2">Assign to Panels</h2>
        <p className="text-fg-secondary">
          Drag resources to Panel 1 or Panel 2 below. The panels are displayed side-by-side as they will appear in the studio.
        </p>
      </div>
      
      {/* Instructions */}
      <div className="mb-6 p-4 bg-accent-soft border border-accent rounded-lg">
        <div className="flex items-start gap-3">
          <Layers className="w-5 h-5 text-accent flex-shrink-0 mt-0.5" />
          <div className="text-sm text-accent-fg">
            <p className="font-medium mb-1">How to assign:</p>
            <ul className="list-disc list-inside space-y-1 text-accent-fg">
              <li>Drag unassigned resources to a panel</li>
              <li>Click the radio button to set which resource shows first</li>
              <li>Click X to remove a resource from a panel</li>
              <li>Resources can be in one panel at a time</li>
            </ul>
          </div>
        </div>
      </div>
      
      {/* Unassigned Resources */}
      {unassignedResources.length > 0 && (
        <div className="mb-6">
          <h3 className="font-semibold text-fg mb-3">
            Unassigned Resources ({unassignedResources.length})
          </h3>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
            {unassignedResources.map(({ key, info }) =>
              info ? (
                <ResourceCard
                  key={key}
                  resourceKey={key}
                  resource={info}
                  isDragging={draggedResource === key}
                />
              ) : null
            )}
          </div>
        </div>
      )}
      
      {/* Panels - Side by side on medium screens and up */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <PanelDropZone
          panelId="panel-1"
          resources={panel1Resources}
          activeIndex={panel1?.activeIndex || 0}
        />
        <PanelDropZone
          panelId="panel-2"
          resources={panel2Resources}
          activeIndex={panel2?.activeIndex || 0}
        />
      </div>
      
      {/* Summary */}
      <div className="mt-6 p-4 bg-muted border border-border rounded-lg">
        <div className="flex items-center justify-between flex-wrap gap-4 text-sm">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-fg">Summary:</span>
          </div>
          <div className="flex items-center gap-6">
            <div className="flex items-center gap-2">
              <span className="text-fg-secondary">New Resources:</span>
              <span className="px-2 py-1 bg-accent-soft text-accent-fg font-medium rounded">
                {Array.from(selectedResourceKeys).filter(key => {
                  const resource = availableResources.get(key)
                  return !resource?.isInWorkspace
                }).length}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-fg-secondary">Panel 1:</span>
              <span className="px-2 py-1 bg-accent-soft text-accent-fg font-medium rounded">
                {panel1Resources.length}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-fg-secondary">Panel 2:</span>
              <span className="px-2 py-1 bg-panel-2-soft text-panel-2-fg font-medium rounded">
                {panel2Resources.length}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
