/**
 * LinkedPanelsStudio - Studio screen using linked-panels library
 * Provides resource interactivity and inter-panel communication
 * Supports reading, audio recording, and translation drafting
 */

import {
    LinkedPanel,
    LinkedPanelsContainer,
    createDefaultPluginRegistry,
    type LinkedPanelsConfig,
} from 'linked-panels'
import { ChevronDown, ChevronUp } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useCatalogManager, useViewerRegistry, type ResourceInfo } from '../../contexts'
import { useAppStore } from '../../contexts/AppContext'
// import type { PassageSet } from '../../contexts/types'
import { usePackageStore } from '../../lib/stores'
import { useWorkspaceStore } from '../../lib/stores/workspaceStore'
import { entryLinkClickPlugin, linkClickPlugin, scriptureContentRequestPlugin, scriptureContentResponsePlugin, scriptureTokensBroadcastPlugin, tokenClickPlugin } from '../../plugins/messageTypePlugins'
import { useStudyStore } from '../../store/studyStore'
import { FallbackViewer } from '../resources'
import { EntryResourceModal } from '../common/EntryResourceModal'
// import { AddResourceWizard } from '../wizard' // Temporarily inlined
// import { AnchorSelector } from './AnchorSelector'
import { getBaseResourceKey, useResourceManagement, useStudioResources, useSwipeGesture } from '../../hooks'
import { EmptyPanelState } from './EmptyPanelState'
import { NavigationBar } from './NavigationBar'
import { PanelHeader } from './PanelHeader'
import { DroppablePanel } from './DroppablePanel'
import { ResourceLibrarySidebar, ResourceWizardPanel } from './ResourceLibrarySidebar'
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
  pointerWithin,
  type DragEndEvent,
  type DragStartEvent,
  type DragOverEvent,
} from '@dnd-kit/core'

export function LinkedPanelsStudio() {
  // Wizard state
  const [showWizard, setShowWizard] = useState(false);
  const loadedResources = useAppStore((s) => s.loadedResources)
  const catalogManager = useCatalogManager()
  const viewerRegistry = useViewerRegistry()
  
  // Use study store for modal management with history
  const openModal = useStudyStore((s: any) => s.openModal)
  
  // Use workspace store for panel management
  const currentPackage = useWorkspaceStore((s) => s.currentPackage)
  const assignResourceToPanel = useWorkspaceStore((s) => s.assignResourceToPanel)
  const setActiveResourceInPanel = useWorkspaceStore((s) => s.setActiveResourceInPanel)
  const getPanel = useWorkspaceStore((s) => s.getPanel)
  
  // Shared resource management (DRY principle)
  const { addResource } = useResourceManagement()
  
  // Resource management hooks for both panels
  const panel1Resources = useStudioResources('panel-1')
  const panel2Resources = useStudioResources('panel-2')
  
  // Drag and drop state (for sidebar drags)
  const [_draggedResource, setDraggedResource] = useState<{
    resourceId: string | string[]  // Can be single or multiple
    sourcePanelId: string | 'sidebar'
  } | null>(null)
  
  // Track which panel is being dragged over (for sidebar visual feedback)
  const [dragOverPanel, setDragOverPanel] = useState<'panel-1' | 'panel-2' | null>(null)
  const resizeContainerRef = useRef<HTMLDivElement>(null)
  
  // Selection state (click-to-select mode)
  const [selectedResourceKey, setSelectedResourceKey] = useState<string | null>(null)
  const [selectedResourceKeys, setSelectedResourceKeys] = useState<string[]>([])
  
  // Studio navigation state: 'dismissed' (hidden) or 'compact' (minimal)
  const [navState, setNavState] = useState<'dismissed' | 'compact'>('compact')
  
  // Panel split state (percentage for panel 1)
  const [panel1Width, setPanel1Width] = useState(50) // Default 50/50 split
  const [isResizingPanels, setIsResizingPanels] = useState(false)
  const [resizeStartLayout, setResizeStartLayout] = useState<'vertical' | 'horizontal'>('horizontal')
  
  // DnD state
  const [activeId, setActiveId] = useState<string | null>(null)
  /** Track which panel (if any) is being hovered over during cross-panel tab drag */
  const [hoverPanelId, setHoverPanelId] = useState<string | null>(null)
  /** Track the index where the placeholder should appear during cross-panel drag */
  const [crossPanelDropIndex, setCrossPanelDropIndex] = useState<number | null>(null)
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 5 },
    }),
    useSensor(TouchSensor, {
      activationConstraint: { delay: 100, tolerance: 5 },
    })
  )
  
  // Handle panel resize - capture layout at start (mouse and touch)
  const handlePanelDividerMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    
    // Detect layout at the moment of mousedown
    const container = document.querySelector('.panels-resize-container')
    if (container) {
      const style = window.getComputedStyle(container)
      const isVertical = style.flexDirection === 'column'
      setResizeStartLayout(isVertical ? 'vertical' : 'horizontal')
    }
    
    setIsResizingPanels(true)
  }, [])
  
  const handlePanelDividerTouchStart = useCallback((e: React.TouchEvent) => {
    e.preventDefault()
    
    // Detect layout at the moment of touchstart
    const container = document.querySelector('.panels-resize-container')
    if (container) {
      const style = window.getComputedStyle(container)
      const isVertical = style.flexDirection === 'column'
      setResizeStartLayout(isVertical ? 'vertical' : 'horizontal')
    }
    
    setIsResizingPanels(true)
  }, [])
  
  // Detect layout orientation
  const [isVerticalLayout, setIsVerticalLayout] = useState(false)
  
  useEffect(() => {
    const checkLayout = () => {
      const container = document.querySelector('.panels-resize-container')
      if (!container) return
      
      const style = window.getComputedStyle(container)
      const isVertical = style.flexDirection === 'column'
      setIsVerticalLayout(isVertical)
    }
    
    checkLayout()
    window.addEventListener('resize', checkLayout)
    return () => window.removeEventListener('resize', checkLayout)
  }, [])
  
  // Handle mouse and touch move during panel resize
  useEffect(() => {
    if (!isResizingPanels) return
    
    const isVertical = resizeStartLayout === 'vertical'
    const container = document.querySelector('.panels-resize-container')
    if (!container) return
    
    // Cache the container rect once at the start
    const containerRect = container.getBoundingClientRect()
    
    const handleMove = (clientX: number, clientY: number) => {
      let percentage: number
      if (isVertical) {
        // Vertical layout: use Y position relative to container
        const offsetY = clientY - containerRect.top
        percentage = (offsetY / containerRect.height) * 100
      } else {
        // Horizontal layout: use X position relative to container
        const offsetX = clientX - containerRect.left
        percentage = (offsetX / containerRect.width) * 100
      }
      
      // Clamp between 10% and 90%
      const clampedPercentage = Math.max(10, Math.min(90, percentage))
      
      setPanel1Width(clampedPercentage)
    }
    
    const handleMouseMove = (e: MouseEvent) => {
      handleMove(e.clientX, e.clientY)
    }
    
    const handleTouchMove = (e: TouchEvent) => {
      if (e.touches.length > 0) {
        handleMove(e.touches[0].clientX, e.touches[0].clientY)
      }
    }
    
    const handleEnd = () => {
      setIsResizingPanels(false)
    }
    
    document.addEventListener('mousemove', handleMouseMove)
    document.addEventListener('mouseup', handleEnd)
    document.addEventListener('touchmove', handleTouchMove, { passive: false })
    document.addEventListener('touchend', handleEnd)
    document.body.style.cursor = isVertical ? 'ns-resize' : 'ew-resize'
    document.body.style.userSelect = 'none'
    document.body.style.touchAction = 'none'
    
    return () => {
      document.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('mouseup', handleEnd)
      document.removeEventListener('touchmove', handleTouchMove)
      document.removeEventListener('touchend', handleEnd)
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
      document.body.style.touchAction = ''
    }
  }, [isResizingPanels, resizeStartLayout])
  
  const handleCloseWizard = useCallback(() => {
    setTargetPanel(null)
    setShowWizard(false)
  }, [])
  
  // Get active package from package store
  const activePackageId = usePackageStore((s: any) => s.activePackageId)
  const packages = usePackageStore((s: any) => s.packages)
  const loadPackages = usePackageStore((s: any) => s.loadPackages)
  
  // Auto-load active collection on mount
  useEffect(() => {
    loadPackages()
  }, [loadPackages])
  
  useEffect(() => {
    if (activePackageId && packages.length > 0) {
      const activeCollection = packages.find((p: any) => p.id === activePackageId)
      if (activeCollection && activeCollection.manifest) {
        console.log('📦 Auto-loading collection:', activeCollection.manifest.metadata?.title || activeCollection.id)
        // TODO: Load collection resources into workspace
      }
    }
  }, [activePackageId, packages])
  
  // Get panel data from workspace (dynamic panels)
  const panels = currentPackage?.panels || []
  const panel1 = panels.find((p) => p.id === 'panel-1')
  const panel2 = panels.find((p) => p.id === 'panel-2')
  
  const panel1ResourceKeys = panel1?.resourceKeys || []
  const panel2ResourceKeys = panel2?.resourceKeys || []

  // Open resource wizard - track which panel is being edited (for future use)
  const [_targetPanel, setTargetPanel] = useState<'panel-1' | 'panel-2' | null>(null)
  const openResourceWizard = useCallback((panelId: 'panel-1' | 'panel-2') => {
    setTargetPanel(panelId)
    setShowWizard(true)
  }, [])

  // Create plugin registry for linked-panels
  // Note: resource-panels wraps linked-panels, so we still need to register
  // signal types as plugins for linked-panels validation
  const plugins = useMemo(() => {
    const pluginRegistry = createDefaultPluginRegistry()
    
    // Register signal plugins for resource-panels communication
    pluginRegistry.register(tokenClickPlugin)
    pluginRegistry.register(linkClickPlugin)
    pluginRegistry.register(entryLinkClickPlugin)
    pluginRegistry.register(scriptureTokensBroadcastPlugin)
    // Keep deprecated request/response plugins for backward compatibility
    pluginRegistry.register(scriptureContentRequestPlugin)
    pluginRegistry.register(scriptureContentResponsePlugin)
    
    console.log('✅ Registered signal plugins for @bt-synergy/resource-panels')
    return pluginRegistry
  }, [])

  // dnd-kit drag handlers
  const handleDndDragStart = useCallback((event: DragStartEvent) => {
    setActiveId(String(event.active.id))
    setHoverPanelId(null)
    setCrossPanelDropIndex(null)
  }, [])

  const handleDndDragOver = useCallback(
    (event: DragOverEvent) => {
      const { active, over } = event
      if (!over) {
        setHoverPanelId(null)
        setCrossPanelDropIndex(null)
        return
      }

      const activeKey = String(active.id)
      const overKey = String(over.id)

      // Find which panel owns the active item
      const panel1Keys = panel1Resources.resourceKeys
      const panel2Keys = panel2Resources.resourceKeys
      const activePanel = panel1Keys.includes(activeKey) ? 'panel-1' : panel2Keys.includes(activeKey) ? 'panel-2' : null

      // Check if hovering over a droppable panel or a tab in another panel
      let targetPanelId: string | null = null
      let dropIndex: number | null = null
      
      if (overKey === 'panel-1-droppable') {
        targetPanelId = 'panel-1'
        // Dropping on the panel container itself - append to end
        dropIndex = panel1Keys.length
      } else if (overKey === 'panel-2-droppable') {
        targetPanelId = 'panel-2'
        // Dropping on the panel container itself - append to end
        dropIndex = panel2Keys.length
      } else if (panel1Keys.includes(overKey)) {
        targetPanelId = 'panel-1'
        // Dropping on a specific tab - insert at that position
        dropIndex = panel1Keys.indexOf(overKey)
      } else if (panel2Keys.includes(overKey)) {
        targetPanelId = 'panel-2'
        // Dropping on a specific tab - insert at that position
        dropIndex = panel2Keys.indexOf(overKey)
      }

      // Only show placeholder when dragging to a different panel
      if (activePanel && targetPanelId && activePanel !== targetPanelId) {
        setHoverPanelId(targetPanelId)
        setCrossPanelDropIndex(dropIndex)
      } else {
        setHoverPanelId(null)
        setCrossPanelDropIndex(null)
      }
    },
    [panel1Resources.resourceKeys, panel2Resources.resourceKeys]
  )

  const handleDndDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event
      setActiveId(null)
      setHoverPanelId(null)
      setCrossPanelDropIndex(null)

      if (!over) return

      const activeKey = String(active.id)
      const overKey = String(over.id)

      // Find which panels contain the active and over items
      const panel1Keys = panel1Resources.resourceKeys
      const panel2Keys = panel2Resources.resourceKeys

      const activePanel = panel1Keys.includes(activeKey) ? 'panel-1' : panel2Keys.includes(activeKey) ? 'panel-2' : null
      
      // Check if dropped on a panel droppable (not a tab)
      const isDroppedOnPanel = overKey === 'panel-1-droppable' || overKey === 'panel-2-droppable'
      
      if (isDroppedOnPanel) {
        // Dropped on a panel container - move to that panel
        const targetPanelId = overKey === 'panel-1-droppable' ? 'panel-1' : 'panel-2'
        
        if (activePanel && activePanel !== targetPanelId) {
          // Move to end of target panel
          const moveResourceBetweenPanels = useWorkspaceStore.getState().moveResourceBetweenPanels
          moveResourceBetweenPanels(activeKey, activePanel, targetPanelId)
        }
        return
      }
      
      // Dropped on a tab - check which panel owns it
      const overPanel = panel1Keys.includes(overKey) ? 'panel-1' : panel2Keys.includes(overKey) ? 'panel-2' : null

      if (!activePanel || !overPanel) return

      if (activePanel === overPanel) {
        // Reorder within the same panel
        const keys = activePanel === 'panel-1' ? panel1Keys : panel2Keys
        const oldIndex = keys.indexOf(activeKey)
        const newIndex = keys.indexOf(overKey)

        if (oldIndex !== newIndex) {
          const resources = activePanel === 'panel-1' ? panel1Resources : panel2Resources
          resources.reorderResource(activeKey, newIndex)
        }
      } else {
        // Move between panels to a specific position
        const targetKeys = overPanel === 'panel-1' ? panel1Keys : panel2Keys
        const insertIndex = targetKeys.indexOf(overKey)
        
        const moveResourceBetweenPanels = useWorkspaceStore.getState().moveResourceBetweenPanels
        moveResourceBetweenPanels(activeKey, activePanel, overPanel, insertIndex)
      }
    },
    [panel1Resources, panel2Resources]
  )

  // Helper to get resource label for DragOverlay
  const getResourceLabel = useCallback((resourceKey: string) => {
    const resource = loadedResources[resourceKey]
    if (!resource) return resourceKey.split('/').pop()?.toUpperCase() || 'N/A'
    
    const parts = resourceKey.split('/')
    const lastPart = parts[parts.length - 1] || ''
    if (lastPart) return lastPart.toUpperCase()
    
    const title = resource.title || ''
    if (title.includes('Greek New Testament')) return 'UGNT'
    if (title.includes('Hebrew Old Testament')) return 'UHB'
    if (title.includes('Literal Text')) return 'ULT'
    if (title.includes('Simplified Text')) return 'UST'
    if (title.includes('Translation Notes')) return 'UTN'
    if (title.includes('Translation Words')) return 'UTW'
    if (title.includes('Translation Questions')) return 'UTQ'
    if (title.includes('Translation Academy')) return 'UTA'
    
    return lastPart.substring(0, 4).toUpperCase()
  }, [loadedResources])

  const handleSidebarDragEnd = useCallback(() => {
    setDraggedResource(null)
    setDragOverPanel(null)
  }, [])
  
  // Handle drag from sidebar
  const handleSidebarDragStart = useCallback((resourceKeys: string[]) => {
    setDraggedResource({ resourceId: resourceKeys.length === 1 ? resourceKeys[0] : resourceKeys, sourcePanelId: 'sidebar' })
    console.log('📚 Sidebar drag started:', resourceKeys.length > 1 ? `${resourceKeys.length} resources` : resourceKeys[0])
  }, [])
  
  // Handle drop onto panel from sidebar
  const handlePanelDrop = useCallback(async (e: React.DragEvent, targetPanelId: 'panel-1' | 'panel-2') => {
    e.preventDefault()
    setDragOverPanel(null)

    // Sidebar add: try to get multiple resource keys first
    const resourceKeysJson = e.dataTransfer.getData('application/resource-keys') || e.dataTransfer.getData('text/plain')
    let resourceKeys: string[] = []
    
    try {
      resourceKeys = JSON.parse(resourceKeysJson)
      if (!Array.isArray(resourceKeys)) {
        resourceKeys = [resourceKeysJson]
      }
    } catch {
      // Fallback for old single-resource format
      const singleKey = e.dataTransfer.getData('application/resource-key') || resourceKeysJson
      if (singleKey) {
        resourceKeys = [singleKey]
      }
    }
    
    if (resourceKeys.length === 0 || !resourceKeys[0]) {
      console.warn('⚠️ No resource keys in drop data')
      return
    }
    
    console.log(`🎯 Dropping ${resourceKeys.length === 1 ? resourceKeys[0] : `${resourceKeys.length} resources`} from sidebar onto ${targetPanelId}`)
    
    // Process each resource key
    for (const resourceKey of resourceKeys) {
      const targetResourceKeys = targetPanelId === 'panel-1' ? panel1ResourceKeys : panel2ResourceKeys
      
      // Check if this resource is already in the target panel (prevent duplicates in same panel)
      const baseResourceKey = getBaseResourceKey(resourceKey)
      const alreadyInPanel = targetResourceKeys.some(key => getBaseResourceKey(key) === baseResourceKey)
      
      if (alreadyInPanel) {
        console.log(`ℹ️ Resource ${baseResourceKey} already exists in ${targetPanelId}, skipping`)
        continue
      }
      
      // Fetch metadata from catalog to get accurate type and structure (always, to support multiple instances)
      let resourceInfo: ResourceInfo
      
      try {
        const metadata = await catalogManager.getResourceMetadata(resourceKey)
      
        if (metadata) {
          // Convert ResourceType enum to string
          let typeString = 'unknown'
          if (typeof metadata.type === 'string') {
            typeString = metadata.type
          } else if (metadata.type) {
            typeString = String(metadata.type)
          }
          
          // Map subject to category
          const category = metadata.subject?.toLowerCase().includes('bible') 
            ? 'scripture' 
            : metadata.subject?.toLowerCase().includes('words')
            ? 'words'
            : metadata.subject?.toLowerCase().includes('notes')
            ? 'notes'
            : metadata.subject?.toLowerCase().includes('questions')
            ? 'questions'
            : typeString
          
          resourceInfo = {
            id: resourceKey,
            key: resourceKey,
            title: metadata.title || resourceKey,
            type: typeString,
            category: category,
            format: metadata.format || 'markdown',
            language: metadata.language || 'en',
            owner: metadata.owner || 'unknown',
            server: metadata.server || 'git.door43.org',
            subject: metadata.subject,
            contentStructure: metadata.contentStructure || 'book',
            resourceId: metadata.resourceId,
            location: metadata.locations?.[0]?.type || 'network', // First location type or default to network
            ingredients: metadata.contentMetadata?.ingredients, // ⭐ Include ingredients for on-demand downloading
            version: metadata.version,
            metadata: metadata, // ⭐ Store full metadata for viewers that need it (e.g., TranslationWordsViewer)
            // TOC will be populated by loader when content is fetched
          }
          
          console.log(`📦 Created ResourceInfo from catalog metadata:`, resourceInfo)
        } else {
          // Fallback: metadata not found, use basic info
          console.warn(`⚠️ Metadata not found for ${resourceKey}, using fallback`)
          resourceInfo = {
            id: resourceKey,
            key: resourceKey,
            title: resourceKey.split('/').pop() || resourceKey,
            type: 'unknown',
            category: 'unknown',
            format: 'markdown',
            language: 'en',
            owner: resourceKey.split('/')[0] || 'unknown',
          }
        }
      } catch (error) {
        console.error(`❌ Failed to fetch metadata for ${resourceKey}:`, error)
        // Fallback on error
        resourceInfo = {
          id: resourceKey,
          key: resourceKey,
          title: resourceKey.split('/').pop() || resourceKey,
          type: 'unknown',
          category: 'unknown',
          format: 'markdown',
          language: 'en',
          owner: resourceKey.split('/')[0] || 'unknown',
        }
      }
      
      // Add to workspace and app (DRY: single function handles both)
      // Allow multiple instances so the same resource can be added to multiple panels
      const instanceId = addResource(resourceInfo, true)
      
      // Assign instance to panel (use the generated instance ID, not the base key)
      assignResourceToPanel(instanceId, targetPanelId)
      
      // Navigate to the last added resource
      const newIndex = targetResourceKeys.length
      if (resourceKeys.indexOf(resourceKey) === resourceKeys.length - 1) {
        // Only set active for the last resource
        setActiveResourceInPanel(targetPanelId, newIndex)
      }
      
      console.log(`✅ Resource instance ${instanceId} added to ${targetPanelId} via drag-drop at index ${newIndex}`)
    }
    
    // Clear selection and drag state after drop
    setDraggedResource(null)
    setSelectedResourceKey(null)
    setSelectedResourceKeys([])
  }, [catalogManager, addResource, assignResourceToPanel, setActiveResourceInPanel, panel1ResourceKeys, panel2ResourceKeys])
  
  // Handle click-to-add resource to panel
  const handlePanelClick = useCallback(async (targetPanelId: 'panel-1' | 'panel-2') => {
    // Use multi-select if available, otherwise fall back to single select
    const resourceKeys = selectedResourceKeys.length > 0 ? selectedResourceKeys : (selectedResourceKey ? [selectedResourceKey] : [])
    
    if (resourceKeys.length === 0) {
      return // No resources selected
    }
    
    console.log(`🖱️ Panel ${targetPanelId} clicked with ${resourceKeys.length === 1 ? 'selected resource' : `${resourceKeys.length} selected resources`}:`, resourceKeys)
    
    // Process each selected resource
    for (const resourceKey of resourceKeys) {
      const targetResourceKeys = targetPanelId === 'panel-1' ? panel1ResourceKeys : panel2ResourceKeys
      
      // Check if this resource is already in the target panel (prevent duplicates in same panel)
      const baseResourceKey = getBaseResourceKey(resourceKey)
      const alreadyInPanel = targetResourceKeys.some(key => getBaseResourceKey(key) === baseResourceKey)
      
      if (alreadyInPanel) {
        console.log(`ℹ️ Resource ${baseResourceKey} already exists in ${targetPanelId}, skipping`)
        continue
      }
      
      // Fetch metadata from catalog to get accurate type and structure
      let resourceInfo: ResourceInfo
      
      try {
        const metadata = await catalogManager.getResourceMetadata(resourceKey)
      
      if (metadata) {
        // Convert ResourceType enum to string
        let typeString = 'unknown'
        if (typeof metadata.type === 'string') {
          typeString = metadata.type
        } else if (metadata.type) {
          typeString = String(metadata.type)
        }
        
        // Map subject to category
        const category = metadata.subject?.toLowerCase().includes('bible') 
          ? 'scripture' 
          : metadata.subject?.toLowerCase().includes('words')
          ? 'words'
          : metadata.subject?.toLowerCase().includes('notes')
          ? 'notes'
          : metadata.subject?.toLowerCase().includes('questions')
          ? 'questions'
          : typeString
        
        resourceInfo = {
          id: resourceKey,
          key: resourceKey,
          title: metadata.title || resourceKey,
          type: typeString,
          category: category,
          format: metadata.format || 'markdown',
          language: metadata.language || 'en',
          owner: metadata.owner || 'unknown',
          server: metadata.server || 'git.door43.org',
          subject: metadata.subject,
          contentStructure: metadata.contentStructure || 'book',
        }
        
        console.log(`📦 Created ResourceInfo from catalog metadata:`, resourceInfo)
      } else {
        // Fallback: metadata not found, use basic info
        console.warn(`⚠️ Metadata not found for ${resourceKey}, using fallback`)
        resourceInfo = {
          id: resourceKey,
          key: resourceKey,
          title: resourceKey.split('/').pop() || resourceKey,
          type: 'unknown',
          category: 'unknown',
          format: 'markdown',
          language: 'en',
          owner: resourceKey.split('/')[0] || 'unknown',
        }
      }
    } catch (error) {
      console.error(`❌ Failed to fetch metadata for ${resourceKey}:`, error)
      // Fallback on error
      resourceInfo = {
        id: resourceKey,
        key: resourceKey,
        title: resourceKey.split('/').pop() || resourceKey,
        type: 'unknown',
        category: 'unknown',
        format: 'markdown',
        language: 'en',
        owner: resourceKey.split('/')[0] || 'unknown',
      }
    }
      
      // Add to workspace and app (DRY: single function handles both)
      // Allow multiple instances so the same resource can be added to multiple panels
      const instanceId = addResource(resourceInfo, true)
      
      // Assign instance to panel (use the generated instance ID, not the base key)
      assignResourceToPanel(instanceId, targetPanelId)
      
      // Navigate to the last added resource
      const newIndex = targetResourceKeys.length
      if (resourceKeys.indexOf(resourceKey) === resourceKeys.length - 1) {
        // Only set active for the last resource
        setActiveResourceInPanel(targetPanelId, newIndex)
      }
      
      console.log(`✅ Resource instance ${instanceId} added to ${targetPanelId} via click at index ${newIndex}`)
    }
    
    // Clear selection after adding all resources
    setSelectedResourceKey(null)
    setSelectedResourceKeys([])
  }, [selectedResourceKey, selectedResourceKeys, catalogManager, addResource, assignResourceToPanel, setActiveResourceInPanel, panel1ResourceKeys, panel2ResourceKeys, panel1Resources.moveResource, panel2Resources.moveResource])
  
  // Handle drag over panel (for sidebar visual feedback)
  const handlePanelDragOver = useCallback((e: React.DragEvent, panelId: 'panel-1' | 'panel-2') => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'copy'
    setDragOverPanel(panelId)
  }, [])
  
  const handlePanelDragLeave = useCallback(() => {
    setDragOverPanel(null)
  }, [])

  // Get scripture resources for anchor selector
  const scriptureResources = useMemo(() => {
    return Object.values(loadedResources)
      .filter((r) => r.category === 'scripture' || r.type === 'scripture')
      .map((r) => ({ id: r.id, title: r.title }))
  }, [loadedResources])

  // Handle opening entry-organized resources in modal
  // Format: resourceKey#entryId (e.g., "unfoldingWord/en_tw#bible/kt/grace")
  const handleOpenEntry = useCallback((resourceId: string, entryId?: string) => {
    const resourceKey = entryId ? `${resourceId}#${entryId}` : resourceId
    openModal(resourceKey)
  }, [openModal])

  // Generate resource components dynamically using ViewerRegistry
  // ✅ Now uses ViewerRegistry for dynamic component resolution
  const generateResourceComponent = useCallback((resource: any) => {
    const isAnchor = resource.id === scriptureResources[0]?.id // First scripture is anchor
    
    // Use resource.key (the resourceKey) for loading content, not resource.title
    const resourceKey = resource.key || resource.id
    console.log(`🔧 Generating component for resource:`, {
      id: resource.id,
      key: resource.key,
      title: resource.title,
      resourceKey,
      type: resource.type,
      category: resource.category,
      contentStructure: resource.contentStructure,
    })
    
    // Try to get viewer from ViewerRegistry using resource metadata
    // The viewer's canHandle function checks:
    // 1. metadata.type === resourceType id (e.g., 'scripture')
    // 2. metadata.subject in subjects array (e.g., 'Bible', 'Aligned Bible')
    // 3. aliases match
    const resourceMetadata = {
      type: resource.type, // This should be 'scripture', 'words', etc.
      subject: resource.subject, // Original subject from metadata (e.g., 'Bible', 'Aligned Bible')
      resourceId: resource.id,
      key: resourceKey,
      title: resource.title,
      language: resource.language,
      owner: resource.owner,
    } as any // Type assertion needed since we're creating a partial metadata object
    
    // Try to get viewer using metadata
    let ViewerComponent = viewerRegistry.getViewer(resourceMetadata)
    
    // Fallback: if not found by metadata, try by type directly
    if (!ViewerComponent && resource.type) {
      ViewerComponent = viewerRegistry.getViewerByType(resource.type)
    }
    
    if (ViewerComponent) {
      // Viewer found - render it with appropriate props
      // Build props object with common props first
      const viewerProps: any = {
        resourceId: resource.id,
        resourceKey: resourceKey,
      }
      
      // Add type-specific props
      if (resource.type === 'scripture' || resource.category === 'scripture') {
        // ScriptureViewer needs additional props
        viewerProps.server = resource.server
        viewerProps.owner = resource.owner
        viewerProps.language = resource.language
        viewerProps.isAnchor = isAnchor
      } else if (resource.type === 'words' || resource.category === 'words') {
        // TranslationWordsViewer needs metadata and onEntryLinkClick
        viewerProps.metadata = resource.metadata || resource // Use stored metadata or resource as fallback
        viewerProps.onEntryLinkClick = handleOpenEntry
      } else if (resource.type === 'words-links' || resource.category === 'words-links' || resource.type === 'twl') {
        // WordsLinksViewer needs onEntryLinkClick
        viewerProps.onEntryLinkClick = handleOpenEntry
      }
      
      return <ViewerComponent {...viewerProps} />
    } else {
      // No viewer found - use FallbackViewer
      console.warn(`⚠️ No viewer found for resource type: ${resource.type}, category: ${resource.category}`)
      return (
        <FallbackViewer
          resourceId={resource.id}
          resourceKey={resourceKey}
          resourceType={resource.type}
        />
      )
    }
  }, [scriptureResources, handleOpenEntry, viewerRegistry])

  // Configure linked panels dynamically
  const panelConfig: LinkedPanelsConfig = useMemo(() => {
    // Get all unique resource IDs from both panels
    const allResourceIds = [...new Set([...panel1ResourceKeys, ...panel2ResourceKeys])]
    
    console.log('🔧 Building panel config:')
    console.log('   Panel 1 resource keys:', panel1ResourceKeys)
    console.log('   Panel 2 resource keys:', panel2ResourceKeys)
    console.log('   All resource IDs:', allResourceIds)
    console.log('   LoadedResources keys:', Object.keys(loadedResources))
    console.log('   LoadedResources:', loadedResources)
    
    // Build resources array from loadedResources
    const resources = allResourceIds
      .map((id) => {
        const resource = loadedResources[id]
        if (!resource) {
          console.warn(`⚠️ Resource ${id} not found in loadedResources`)
          return null
        }
        
        console.log(`✅ Found resource ${id} in loadedResources:`, resource)
        
        return {
          id: resource.id,
          title: resource.title,
          description: `${resource.type} resource`,
          category: resource.category || resource.type,
          component: generateResourceComponent(resource),
        }
      })
      .filter(Boolean) as any[]

    console.log('📦 Final panel config resources:', resources.length)

    return {
      resources,
      panels: {
        'panel-1': {
          resourceIds: panel1ResourceKeys,
          initialIndex: panel1Resources.activeIndex,
        },
        'panel-2': {
          resourceIds: panel2ResourceKeys,
          initialIndex: panel2Resources.activeIndex,
        },
      },
    }
  }, [panel1ResourceKeys, panel2ResourceKeys, panel1Resources.activeIndex, panel2Resources.activeIndex, loadedResources, generateResourceComponent])

  const activeCollection = activePackageId ? packages.find((p: any) => p.id === activePackageId) : null

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={pointerWithin}
      onDragStart={handleDndDragStart}
      onDragOver={handleDndDragOver}
      onDragEnd={handleDndDragEnd}
    >
      <div className="h-full flex flex-col overflow-hidden">
        {/* Studio Navigation Bar - Show only in compact mode */}
      {navState === 'compact' && (
        <div className="flex-shrink-0 flex items-center bg-white border-b border-gray-200 px-2 py-1.5">
          <NavigationBar 
            isCompact={true}
            onToggleCompact={undefined}
          />
        </div>
      )}

      {/* Anchor Resource Selector - Only show if there are scripture resources */}
      {/* {scriptureResources.length > 0 && (
        <AnchorSelector scriptureResources={scriptureResources} />
      )} */}

      {/* Old toolbar removed - resource management is now inline on panel headers */}

      {/* Main Content Area with Sidebar */}
      <div className="flex-1 overflow-hidden flex">
        {/* Resource Library Sidebar */}
        <ResourceLibrarySidebar 
          onResourceDragStart={handleSidebarDragStart}
          onResourceDragEnd={handleSidebarDragEnd}
          onResourceSelect={setSelectedResourceKey}
          onSelectedResourcesChange={setSelectedResourceKeys}
          selectedResourceKey={selectedResourceKey}
          selectedResourceKeys={selectedResourceKeys}
          showWizard={showWizard}
          onShowWizardChange={setShowWizard}
          activeCollection={activeCollection}
        />
        
        {/* Linked Panels Container or Wizard */}
        <div className="flex-1 overflow-hidden relative flex flex-col">
          {/* Navigation Toggle Stripe - Always visible */}
          {navState === 'dismissed' ? (
            /* Show stripe when navigation is hidden */
            <button
              onClick={() => setNavState('compact')}
              className="flex-shrink-0 w-full bg-gray-50 hover:bg-gray-100 transition-colors cursor-pointer flex items-center justify-center py-0.5 z-10"
              title="Show navigation"
              aria-label="Show navigation"
            >
              <ChevronDown className="w-3 h-3 text-gray-300 hover:text-gray-400 transition-colors" />
            </button>
          ) : (
            /* Show collapse stripe when navigation is visible */
            <button
              onClick={() => setNavState('dismissed')}
              className="flex-shrink-0 w-full bg-gray-50 hover:bg-gray-100 transition-colors cursor-pointer flex items-center justify-center py-0.5 z-10"
              title="Hide navigation"
              aria-label="Hide navigation"
            >
              <ChevronUp className="w-3 h-3 text-gray-300 hover:text-gray-400 transition-colors" />
            </button>
          )}
          
          {/* Conditionally render either the wizard or the panels */}
          {showWizard ? (
            <ResourceWizardPanel 
              show={showWizard}
              onClose={handleCloseWizard}
            />
          ) : (
            <>
          
          {/* Selected resource indicator */}
          {selectedResourceKey && (
            <div className="absolute top-12 left-1/2 -translate-x-1/2 z-10 px-4 py-2 bg-blue-500 text-white rounded-lg shadow-lg flex items-center gap-2 pointer-events-none">
              <span className="text-sm font-medium">
                Click a panel to add {loadedResources[selectedResourceKey]?.title || selectedResourceKey}
              </span>
            </div>
          )}
          
          <div className="flex-1 overflow-hidden">
            <LinkedPanelsContainer config={panelConfig} plugins={plugins}>
            <div
              ref={resizeContainerRef}
              className="h-full flex flex-col md:flex-row overflow-hidden panels-resize-container relative"
            >
              {/* Panel 1 */}
              <DroppablePanel
                id="panel-1-droppable"
                className={`min-h-0 overflow-hidden transition-all ${
                  dragOverPanel === 'panel-1' 
                    ? 'bg-blue-50 ring-2 ring-inset ring-blue-400' 
                    : selectedResourceKey 
                    ? 'cursor-pointer hover:bg-blue-50 hover:ring-2 hover:ring-inset hover:ring-blue-300' 
                    : ''
                }`}
                style={{ flexBasis: `${panel1Width}%` }}
                colorScheme="blue"
              >
              <div 
                className="h-full"
                onDragEnter={(e) => e.preventDefault()}
                onDrop={(e) => handlePanelDrop(e, 'panel-1')}
                onDragOver={(e) => handlePanelDragOver(e, 'panel-1')}
                onDragLeave={handlePanelDragLeave}
                onClick={() => (selectedResourceKey || selectedResourceKeys.length > 0) && handlePanelClick('panel-1')}
              >
                <LinkedPanel id="panel-1">
                {({ current, navigate }) => {
                  // Swipe gesture handlers for this panel
                  const swipeHandlers = useSwipeGesture({
                    onSwipeLeft: () => {
                      if (panel1Resources.hasNext) {
                        panel1Resources.goToNext()
                        navigate.next()
                      }
                    },
                    onSwipeRight: () => {
                      if (panel1Resources.hasPrevious) {
                        panel1Resources.goToPrevious()
                        navigate.previous()
                      }
                    },
                    minSwipeDistance: 50,
                  })
                  
                  return (
                  <div className="h-full flex flex-col">
                    <PanelHeader
                      panelNumber={1}
                      panelId="panel-1"
                      resources={panel1Resources.resources}
                      currentIndex={current.index}
                      currentResource={panel1Resources.activeResource}
                      onIndexChange={(newIndex) => {
                        navigate.toIndex(newIndex)
                        panel1Resources.goToIndex(newIndex)
                      }}
                      onRemove={() => panel1Resources.removeResource()}
                      onMoveToOtherPanel={
                        panel1Resources.activeResource && panel1Resources.resourceKeys.length > 0
                          ? () => {
                              const key = panel1Resources.resourceKeys[panel1Resources.activeIndex]
                              if (key) panel1Resources.moveResource(key, 'panel-2')
                            }
                          : undefined
                      }
                      colorScheme="blue"
                      showDropPlaceholder={hoverPanelId === 'panel-1'}
                      placeholderLabel={activeId ? getResourceLabel(activeId) : ''}
                      placeholderIndex={hoverPanelId === 'panel-1' ? crossPanelDropIndex : null}
                    />

                    {/* Panel Content */}
                    <div 
                      ref={swipeHandlers.ref}
                      className="flex-1 min-h-0 overflow-auto"
                      onTouchStart={swipeHandlers.onTouchStart}
                      onTouchMove={swipeHandlers.onTouchMove}
                      onTouchEnd={swipeHandlers.onTouchEnd}
                      onMouseDown={swipeHandlers.onMouseDown}
                      onMouseMove={swipeHandlers.onMouseMove}
                      onMouseUp={swipeHandlers.onMouseUp}
                      onMouseLeave={swipeHandlers.onMouseLeave}
                    >
                      {current.resource?.component || (
                        <EmptyPanelState
                          panelId="panel-1"
                          panelName={panel1?.name}
                          onAddResource={() => openResourceWizard('panel-1')}
                        />
                          )}
                    </div>
                  </div>
                  )
                }}
              </LinkedPanel>
            </div>
            </DroppablePanel>

              {/* Resize Divider */}
              <div
                onMouseDown={handlePanelDividerMouseDown}
                onTouchStart={handlePanelDividerTouchStart}
                className={`flex-shrink-0 transition-colors relative flex items-center justify-center ${
                  isResizingPanels ? 'bg-blue-500' : 'bg-gray-300 hover:bg-blue-400'
                } md:w-1.5 md:h-full md:cursor-ew-resize w-full h-1.5 cursor-ns-resize`}
                title="Drag to resize panels"
                aria-label="Resize panels"
              >
                {/* Touch-friendly hitbox - adapts to orientation */}
                <div className="absolute md:left-1/2 md:-translate-x-1/2 md:top-0 md:w-4 md:h-full top-1/2 -translate-y-1/2 left-0 w-full h-4" />
                
                {/* Visual grip indicator - dots adapt to orientation */}
                <div className="absolute flex gap-1 pointer-events-none md:flex-col md:left-1/2 md:-translate-x-1/2 md:top-1/2 md:-translate-y-1/2 flex-row top-1/2 -translate-y-1/2 left-1/2 -translate-x-1/2">
                  <div className={`w-1 h-1 rounded-full transition-colors ${
                    isResizingPanels ? 'bg-white' : 'bg-gray-500'
                  }`} />
                  <div className={`w-1 h-1 rounded-full transition-colors ${
                    isResizingPanels ? 'bg-white' : 'bg-gray-500'
                  }`} />
                  <div className={`w-1 h-1 rounded-full transition-colors ${
                    isResizingPanels ? 'bg-white' : 'bg-gray-500'
                  }`} />
                </div>
              </div>

              {/* Panel 2 */}
              <DroppablePanel
                id="panel-2-droppable"
                className={`min-h-0 overflow-hidden transition-all ${
                  dragOverPanel === 'panel-2' 
                    ? 'bg-purple-50 ring-2 ring-inset ring-purple-400' 
                    : selectedResourceKey 
                    ? 'cursor-pointer hover:bg-purple-50 hover:ring-2 hover:ring-inset hover:ring-purple-300' 
                    : ''
                }`}
                style={{ flexBasis: `${100 - panel1Width}%` }}
                colorScheme="purple"
              >
              <div 
                className="h-full"
                onDragEnter={(e) => e.preventDefault()}
                onDrop={(e) => handlePanelDrop(e, 'panel-2')}
                onDragOver={(e) => handlePanelDragOver(e, 'panel-2')}
                onDragLeave={handlePanelDragLeave}
                onClick={() => (selectedResourceKey || selectedResourceKeys.length > 0) && handlePanelClick('panel-2')}
              >
                <LinkedPanel id="panel-2">
                {({ current, navigate }) => {
                  // Swipe gesture handlers for this panel
                  const swipeHandlers = useSwipeGesture({
                    onSwipeLeft: () => {
                      if (panel2Resources.hasNext) {
                        panel2Resources.goToNext()
                        navigate.next()
                      }
                    },
                    onSwipeRight: () => {
                      if (panel2Resources.hasPrevious) {
                        panel2Resources.goToPrevious()
                        navigate.previous()
                      }
                    },
                    minSwipeDistance: 50,
                  })
                  
                  return (
                  <div className="h-full flex flex-col">
                    <PanelHeader
                      panelNumber={2}
                      panelId="panel-2"
                      resources={panel2Resources.resources}
                      currentIndex={current.index}
                      currentResource={panel2Resources.activeResource}
                      onIndexChange={(newIndex) => {
                        navigate.toIndex(newIndex)
                        panel2Resources.goToIndex(newIndex)
                      }}
                      onRemove={() => panel2Resources.removeResource()}
                      onMoveToOtherPanel={
                        panel2Resources.activeResource && panel2Resources.resourceKeys.length > 0
                          ? () => {
                              const key = panel2Resources.resourceKeys[panel2Resources.activeIndex]
                              if (key) panel2Resources.moveResource(key, 'panel-1')
                            }
                          : undefined
                      }
                      colorScheme="purple"
                      showDropPlaceholder={hoverPanelId === 'panel-2'}
                      placeholderLabel={activeId ? getResourceLabel(activeId) : ''}
                      placeholderIndex={hoverPanelId === 'panel-2' ? crossPanelDropIndex : null}
                    />

                    {/* Panel Content */}
                    <div 
                      ref={swipeHandlers.ref}
                      className="flex-1 min-h-0 overflow-auto"
                      onTouchStart={swipeHandlers.onTouchStart}
                      onTouchMove={swipeHandlers.onTouchMove}
                      onTouchEnd={swipeHandlers.onTouchEnd}
                      onMouseDown={swipeHandlers.onMouseDown}
                      onMouseMove={swipeHandlers.onMouseMove}
                      onMouseUp={swipeHandlers.onMouseUp}
                      onMouseLeave={swipeHandlers.onMouseLeave}
                    >
                      {current.resource?.component || (
                        <EmptyPanelState
                          panelId="panel-2"
                          panelName={panel2?.name}
                          onAddResource={() => openResourceWizard('panel-2')}
                        />
                          )}
                    </div>
                  </div>
                  )
                }}
              </LinkedPanel>
              </div>
            </DroppablePanel>
            </div>
          </LinkedPanelsContainer>
          </div>
          </>
          )}
        </div>
      </div>

      {/* Entry Resource Modal with History */}
      <EntryResourceModal onEntryLinkClick={handleOpenEntry} />
      
      {/* DragOverlay for ghost preview */}
      <DragOverlay>
        {activeId ? (
          <div className="px-2 py-1.5 text-xs font-medium bg-blue-100 text-blue-800 border-2 border-blue-300 rounded shadow-lg opacity-90">
            {getResourceLabel(activeId)}
          </div>
        ) : null}
      </DragOverlay>
    </div>
    </DndContext>
  )
}

