/**
 * Simplified Read View
 * 
 * A simplified version of the Studio for reading resources
 * - No sidebar, no drag-and-drop
 * - Language picker to auto-load all tc-ready resources
 * - Two-panel layout with navigation (same as Studio)
 */

import {
    DndContext,
    DragOverlay,
    PointerSensor,
    TouchSensor,
    pointerWithin,
    useSensor,
    useSensors,
    type DragEndEvent,
    type DragOverEvent,
    type DragStartEvent,
} from '@dnd-kit/core'
import {
    LinkedPanel,
    LinkedPanelsContainer,
    createDefaultPluginRegistry,
    type LinkedPanelsConfig,
} from 'linked-panels'
import { CheckCircle2, Loader2, Package, XCircle } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ResourceType, ResourceFormat } from '@bt-synergy/resource-catalog'
import { useCacheAdapter, useCatalogManager, useCompletenessChecker, useResourceTypeRegistry, useViewerRegistry } from '../../contexts'
import { useAppStore } from '../../contexts/AppContext'
import type { ResourceInfo } from '../../contexts/types'
import { useBackgroundDownload, useCatalogBackgroundDownload, useResourceManagement, useStudioResources, useSwipeGesture } from '../../hooks'
import { createResourceMetadata, mapSubjectToResourceType, mapContentFormat } from '../../lib/services/ResourceMetadataFactory'
import { usePackageStore } from '../../lib/stores/packageStore'
import { useWorkspaceStore } from '../../lib/stores/workspaceStore'
import {
    entryLinkClickPlugin,
    linkClickPlugin,
    scriptureContentRequestPlugin,
    scriptureContentResponsePlugin,
    scriptureTokensBroadcastPlugin,
    tokenClickPlugin
} from '../../plugins/messageTypePlugins'
import { useStudyStore } from '../../store/studyStore'
import type { ExportWorkerMessage, ExportWorkerResponse } from '../../workers/collectionExport.worker'
import { CollectionImportDialog } from '../collections/CollectionImportDialog'
import { EntryResourceModal } from '../common/EntryResourceModal'
import { FallbackViewer } from '../resources'
import { DroppablePanel } from '../studio/DroppablePanel'
import { EmptyPanelState } from '../studio/EmptyPanelState'
import { GlobalSignalBridge } from '../studio/GlobalSignalBridge'
import { NavigationBar } from '../studio/NavigationBar'
import { PanelHeader } from '../studio/PanelHeader'
import { DownloadIndicator } from './DownloadIndicator'

interface SimplifiedReadViewProps {
  initialLanguage?: string
}

export function SimplifiedReadView({ initialLanguage }: SimplifiedReadViewProps = {}) {
  const navigate = useNavigate()
  const catalogManager = useCatalogManager()
  const cacheAdapter = useCacheAdapter()
  const viewerRegistry = useViewerRegistry()
  const resourceTypeRegistry = useResourceTypeRegistry()
  const loadedResources = useAppStore((s) => s.loadedResources)
  const completenessChecker = useCompletenessChecker()
  const packageStore = usePackageStore()
  
  // Use workspace store for panel management
  const assignResourceToPanel = useWorkspaceStore((s) => s.assignResourceToPanel)
  const setActiveResourceInPanel = useWorkspaceStore((s) => s.setActiveResourceInPanel)
  const getPanel = useWorkspaceStore((s) => s.getPanel)
  const removeResourceFromPanel = useWorkspaceStore((s) => s.removeResourceFromPanel)
  
  // Use resource management hook for adding resources
  const { addResource } = useResourceManagement()
  
  // Resource management hooks for both panels
  const panel1Resources = useStudioResources('panel-1')
  const panel2Resources = useStudioResources('panel-2')
  
  // Navigation state
  const [navState, setNavState] = useState<'dismissed' | 'compact'>('compact')
  
  // Panel split state (percentage for panel 1)
  const [panel1Width, setPanel1Width] = useState(50)
  const [isResizingPanels, setIsResizingPanels] = useState(false)
  const [resizeStartLayout, setResizeStartLayout] = useState<'vertical' | 'horizontal'>('horizontal')
  const resizeContainerRef = useRef<HTMLDivElement>(null)
  
  // Loading state
  const [isLoadingResources, setIsLoadingResources] = useState(false)
  
  // Expected resources from catalog search (for deterministic background download waiting)
  const [expectedResources, setExpectedResources] = useState<string[]>([])
  
  // Track metadata updates to trigger background download check
  // Increments each time metadata is added to catalog in Phase 2
  const [metadataUpdateCounter, setMetadataUpdateCounter] = useState(0)
  
  // Debug: Log metadata updates
  useEffect(() => {
    if (metadataUpdateCounter > 0) {
      console.log(`[BG-DL] 📊 Metadata update #${metadataUpdateCounter} - triggering background download check`)
    }
  }, [metadataUpdateCounter])
  
  // Language picker state - auto-open if no resources loaded
  const [shouldAutoOpenLanguagePicker, setShouldAutoOpenLanguagePicker] = useState(false)
  const [hasCheckedInitialState, setHasCheckedInitialState] = useState(false)
  
  // Check if we need to auto-open language picker (after initial render)
  useEffect(() => {
    // Don't auto-open if we have a language from URL
    if (hasCheckedInitialState || initialLanguage) return
    
    const hasResources = Object.keys(loadedResources).length > 0
    console.log('[SimplifiedReadView] Auto-open language picker check:', {
      hasResources,
      loadedResourcesCount: Object.keys(loadedResources).length,
      shouldAutoOpen: !hasResources
    })
    
    if (!hasResources) {
      setShouldAutoOpenLanguagePicker(true)
    }
    setHasCheckedInitialState(true)
  }, [loadedResources, hasCheckedInitialState, initialLanguage])
  
  // DnD state
  const [activeId, setActiveId] = useState<string | null>(null)
  /** Track which panel (if any) is being hovered over during cross-panel drag */
  const [hoverPanelId, setHoverPanelId] = useState<string | null>(null)
  /** Track the drop target index for placeholder positioning */
  const [dropTargetIndex, setDropTargetIndex] = useState<number | null>(null)
  
  // Collection dialog state
  const [showLoadDialog, setShowLoadDialog] = useState(false)
  
  // Track current language and collection cache status
  const [currentLanguageCode, setCurrentLanguageCode] = useState<string | null>(initialLanguage || null)
  const [isCollectionFullyCached, setIsCollectionFullyCached] = useState(false)
  
  // Export progress state
  const [exportProgress, setExportProgress] = useState<{
    isExporting: boolean
    current: number
    total: number
    message: string
  }>({
    isExporting: false,
    current: 0,
    total: 0,
    message: ''
  })
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 5 },
    }),
    useSensor(TouchSensor, {
      activationConstraint: { delay: 100, tolerance: 5 },
    })
  )
  
  // Handle panel resize (mouse)
  const handlePanelDividerMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    const container = document.querySelector('.panels-resize-container')
    if (container) {
      const style = window.getComputedStyle(container)
      const isVertical = style.flexDirection === 'column'
      setResizeStartLayout(isVertical ? 'vertical' : 'horizontal')
    }
    setIsResizingPanels(true)
  }, [])
  
  // Handle panel resize (touch)
  const handlePanelDividerTouchStart = useCallback((e: React.TouchEvent) => {
    e.preventDefault()
    const container = document.querySelector('.panels-resize-container')
    if (container) {
      const style = window.getComputedStyle(container)
      const isVertical = style.flexDirection === 'column'
      setResizeStartLayout(isVertical ? 'vertical' : 'horizontal')
    }
    setIsResizingPanels(true)
  }, [])

  // dnd-kit drag handlers
  const handleDragStart = useCallback((event: DragStartEvent) => {
    setActiveId(String(event.active.id))
    setHoverPanelId(null)
    setDropTargetIndex(null)
  }, [])

  const handleDragOver = useCallback(
    (event: DragOverEvent) => {
      const { active, over } = event
      if (!over) {
        setHoverPanelId(null)
        setDropTargetIndex(null)
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
      let targetIndex: number | null = null
      
      if (overKey === 'panel-1-droppable') {
        targetPanelId = 'panel-1'
        targetIndex = null // End of list
      } else if (overKey === 'panel-2-droppable') {
        targetPanelId = 'panel-2'
        targetIndex = null // End of list
      } else if (panel1Keys.includes(overKey)) {
        targetPanelId = 'panel-1'
        targetIndex = panel1Keys.indexOf(overKey)
      } else if (panel2Keys.includes(overKey)) {
        targetPanelId = 'panel-2'
        targetIndex = panel2Keys.indexOf(overKey)
      }

      // Only show placeholder when dragging to a different panel
      if (activePanel && targetPanelId && activePanel !== targetPanelId) {
        setHoverPanelId(targetPanelId)
        setDropTargetIndex(targetIndex)
      } else {
        setHoverPanelId(null)
        setDropTargetIndex(null)
      }
    },
    [panel1Resources.resourceKeys, panel2Resources.resourceKeys]
  )

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event
      setActiveId(null)
      setHoverPanelId(null)
      setDropTargetIndex(null)

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

  useEffect(() => {
    if (!isResizingPanels) return
    
    const handleMouseMove = (e: MouseEvent) => {
      const container = document.querySelector('.panels-resize-container')
      if (!container) return
      
      const rect = container.getBoundingClientRect()
      
      if (resizeStartLayout === 'horizontal') {
        const newPercent = ((e.clientX - rect.left) / rect.width) * 100
        setPanel1Width(Math.max(20, Math.min(80, newPercent)))
      } else {
        const newPercent = ((e.clientY - rect.top) / rect.height) * 100
        setPanel1Width(Math.max(20, Math.min(80, newPercent)))
      }
    }
    
    const handleTouchMove = (e: TouchEvent) => {
      const container = document.querySelector('.panels-resize-container')
      if (!container) return
      
      const rect = container.getBoundingClientRect()
      const touch = e.touches[0]
      
      if (resizeStartLayout === 'horizontal') {
        const newPercent = ((touch.clientX - rect.left) / rect.width) * 100
        setPanel1Width(Math.max(20, Math.min(80, newPercent)))
      } else {
        const newPercent = ((touch.clientY - rect.top) / rect.height) * 100
        setPanel1Width(Math.max(20, Math.min(80, newPercent)))
      }
    }
    
    const handleMouseUp = () => {
      setIsResizingPanels(false)
    }
    
    document.addEventListener('mousemove', handleMouseMove)
    document.addEventListener('touchmove', handleTouchMove)
    document.addEventListener('mouseup', handleMouseUp)
    document.addEventListener('touchend', handleMouseUp)
    
    return () => {
      document.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('touchmove', handleTouchMove)
      document.removeEventListener('mouseup', handleMouseUp)
      document.removeEventListener('touchend', handleMouseUp)
    }
  }, [isResizingPanels, resizeStartLayout])
  
  // Background download control
  const { startDownload, stopDownload, stats: downloadStats, isDownloading: isBackgroundDownloading } = useBackgroundDownload({
    autoStart: false,
    skipExisting: true,
    debug: true
  })
  
  // 🔄 AUTOMATIC BACKGROUND DOWNLOADS
  // Reactively checks catalog when resources load and downloads incomplete ones
  // Triggers automatically when loadedResources changes (reactive!)
  // IMPORTANT: Only enabled AFTER resources finish loading to avoid blocking UI rendering
  // DETERMINISTIC: Passes expectedResources from catalog search for precise waiting
  useCatalogBackgroundDownload({
    catalogManager,
    completenessChecker,
    onStartDownload: startDownload,
    catalogTrigger: `${Object.keys(loadedResources).length}-${metadataUpdateCounter}`, // Reacts to resource count AND metadata changes
    expectedResources, // ✅ List of resources expected from catalog search
    enabled: !isLoadingResources && Object.keys(loadedResources).length > 0, // Wait for UI to be ready
    debug: true,
  })
  
  // Handle language selection - automatically load all tc-ready resources
  const handleLanguageSelected = useCallback(async (languageCode: string) => {
    console.log('📚 Auto-loading all tc-ready resources for language:', languageCode)
    
    // Track current language for collection management
    setCurrentLanguageCode(languageCode)
    
    // 🛑 IMPORTANT: Cancel any ongoing downloads from previous language
    if (isBackgroundDownloading) {
      console.log('🛑 Canceling ongoing downloads (language changed)')
      stopDownload()
    }
    
    // Update URL to reflect selected language
    navigate(`/read/${languageCode}`, { replace: true })
    
    setIsLoadingResources(true)
    
    try {
      // Clear existing panel assignments for this Read view when switching language
      for (const panelId of ['panel-1', 'panel-2'] as const) {
        const panel = getPanel(panelId)
        if (panel) {
          for (const key of [...panel.resourceKeys]) {
            removeResourceFromPanel(key, panelId)
          }
        }
      }

      const { getDoor43ApiClient } = await import('@bt-synergy/door43-api')
      const door43Client = getDoor43ApiClient()
      
      // Search for all tc-ready resources for this language (any owner).
      // Use a high limit so we get all matching resources; API may cap otherwise.
      const searchParams = {
        language: languageCode,
        topic: 'tc-ready',
        stage: 'prod' as const,
        limit: 500,
      }
      const query = new URLSearchParams({
        lang: languageCode,
        topic: 'tc-ready',
        stage: 'prod',
        limit: '500',
      }).toString()
      console.log('🔍 Catalog search request:', searchParams)
      console.log('🔍 Catalog search URL (check Network tab):', `https://git.door43.org/api/v1/catalog/search?${query}`)
      const catalogResults = await door43Client.searchCatalog(searchParams)
      
      console.log(`📦 Catalog search returned ${catalogResults.length} raw results for ${languageCode}`)
      if (catalogResults.length === 0) {
        console.warn(
          '⚠️ No catalog results. The API may not support topic=tc-ready, or use a different topic value. Check the Network tab for the actual request (e.g. /api/v1/catalog/search?lang=...&topic=tc-ready&stage=prod&limit=500).'
        )
      }
      if (catalogResults.length > 0) {
        const first = catalogResults[0]
        console.log('📦 First result keys:', Object.keys(first))
        console.log('📦 First result sample:', {
          name: first.name,
          repo_name: first.repo_name,
          identifier: first.identifier,
          owner: typeof first.owner === 'string' ? first.owner : first.owner?.login ?? first.owner?.username,
          language: first.language ?? first.language_code,
          subject: first.subject,
          hasRepo: !!first.repo,
        })
      }

      const supportedSubjects = resourceTypeRegistry.getSupportedSubjects()
      console.log('📋 Resource type registry supported subjects:', supportedSubjects)
      
      // ✅ Collect expected resource keys from catalog results BEFORE processing
      // This allows deterministic waiting for all resources to load
      const expectedResourceKeys: string[] = []
      for (const entry of catalogResults) {
        const item = entry.repo ? { ...entry, ...entry.repo } : entry
        const repoName = item.name ?? item.repo_name
        if (!repoName || typeof repoName !== 'string') continue
        
        const owner = typeof item.owner === 'string' ? item.owner : (item.owner?.login ?? item.owner?.username ?? entry.owner)
        const ownerStr = typeof owner === 'string' ? owner : (owner?.login ?? owner?.username) ?? 'unknown'
        const language = item.language ?? item.language_code ?? languageCode
        const langStr = typeof language === 'string' ? language : languageCode
        const resourceId = item.identifier ?? (repoName.includes('_') ? repoName.split('_').slice(1).join('_') : repoName)
        const resourceKey = `${ownerStr}/${langStr}/${resourceId}`
        
        const subjectRaw = item.subject ?? ''
        const subject = String((Array.isArray(subjectRaw) ? subjectRaw[0] : subjectRaw) ?? '').trim()
        const type = resourceTypeRegistry.getTypeForSubject(subject)
        
        if (type) {
          expectedResourceKeys.push(resourceKey)
        }
      }
      
      // Add original language resources (UGNT, UHB) to expected list
      const originalLanguageKeys = [
        'unfoldingWord/el-x-koine/ugnt',
        'unfoldingWord/hbo/uhb',
      ]
      expectedResourceKeys.push(...originalLanguageKeys)
      
      console.log(`📋 Expected ${expectedResourceKeys.length} resources (${expectedResourceKeys.length - 2} from catalog + 2 original language):`, expectedResourceKeys)
      setExpectedResources(expectedResourceKeys)
      
      // ✅ PHASE 1: Add resources immediately with basic info (for instant UI)
      console.log(`⚡ Phase 1: Adding ${catalogResults.length} resources immediately to UI...`)
      const loadedResourceKeys: string[] = []
      
      for (const entry of catalogResults) {
        const item = entry.repo ? { ...entry, ...entry.repo } : entry
        const repoName = item.name ?? item.repo_name
        if (!repoName || typeof repoName !== 'string') continue
        
        const owner = typeof item.owner === 'string' ? item.owner : (item.owner?.login ?? item.owner?.username ?? entry.owner)
        const ownerStr = typeof owner === 'string' ? owner : (owner?.login ?? owner?.username) ?? 'unknown'
        const language = item.language ?? item.language_code ?? languageCode
        const langStr = typeof language === 'string' ? language : languageCode
        const resourceId = item.identifier ?? (repoName.includes('_') ? repoName.split('_').slice(1).join('_') : repoName)
        const resourceKey = `${ownerStr}/${langStr}/${resourceId}`
        
        const subjectRaw = item.subject ?? ''
        const subject = String((Array.isArray(subjectRaw) ? subjectRaw[0] : subjectRaw) ?? '').trim()
        const typeId = resourceTypeRegistry.getTypeForSubject(subject)
        
        if (!typeId) {
          console.log('⏭️ Skip: subject not in resource registry', { resourceKey, subject })
          continue
        }
        
        // Map type string ID and format string to enums
        const type = mapSubjectToResourceType(subject)
        const format = mapContentFormat(item.content_format ?? item.format ?? 'usfm')
        
        // Create basic ResourceInfo immediately (no metadata fetch yet)
        const basicResourceInfo: ResourceInfo = {
          id: resourceKey,
          key: resourceKey,
          resourceKey: resourceKey, // Required for createResourceInfo
          title: item.title ?? entry.title ?? resourceKey,
          type,
          category: subject || 'Unknown',
          subject: subject || 'Unknown',
          owner: ownerStr,
          language: langStr,
          languageCode: langStr,
          languageName: item.language_title ?? langStr,
          resourceId: resourceId,
          server: 'git.door43.org',
          format,
          contentStructure: (subject.toLowerCase().includes('bible') ? 'book' : 'entry') as 'book' | 'entry',
          version: item.release?.tag_name ?? '1.0',
          description: item.description ?? item.repo?.description,
          release: item.release ?? item.catalog?.prod,
        }
        
        // Add to workspace immediately
        addResource(basicResourceInfo)
        loadedResourceKeys.push(resourceKey)
        
        // Only assign to panels if resource has a viewer (modal-only resources won't appear as tabs)
        const hasViewer = viewerRegistry.hasViewer(type)
        if (hasViewer) {
          const isScripture = type === 'scripture'
          const panelId = isScripture ? 'panel-1' : 'panel-2'
          const currentPanel = getPanel(panelId)
          const currentIndex = currentPanel?.resourceKeys.length || 0
          assignResourceToPanel(resourceKey, panelId, currentIndex)
          if (currentIndex === 0) {
            setActiveResourceInPanel(panelId, 0)
          }
          console.log(`✅ Immediately added to panel: ${resourceKey} (metadata will load in background)`)
        } else {
          console.log(`✅ Loaded resource (modal-only): ${resourceKey} (no panel viewer)`)
        }
      }
      
      console.log(`⚡ Phase 1 complete: ${loadedResourceKeys.length} resources in UI`)
      
      // ✅ PHASE 2: Fetch metadata in background (simpler - just fetch and save to catalog)
      console.log(`🔄 Phase 2: Fetching metadata for ${catalogResults.length} resources in background...`)
      const metadataPromises = catalogResults.map(async (entry) => {
        const item = entry.repo ? { ...entry, ...entry.repo } : entry
        const repoName = item.name ?? item.repo_name
        if (!repoName || typeof repoName !== 'string') {
          return
        }
        
        const owner = typeof item.owner === 'string' ? item.owner : (item.owner?.login ?? item.owner?.username ?? entry.owner)
        const ownerStr = typeof owner === 'string' ? owner : (owner?.login ?? owner?.username) ?? 'unknown'
        const language = item.language ?? item.language_code ?? languageCode
        const langStr = typeof language === 'string' ? language : languageCode
        const resourceId = item.identifier ?? (repoName.includes('_') ? repoName.split('_').slice(1).join('_') : repoName)
        const resourceKey = `${ownerStr}/${langStr}/${resourceId}`
        
        const subjectRaw = item.subject ?? ''
        const subject = String((Array.isArray(subjectRaw) ? subjectRaw[0] : subjectRaw) ?? '').trim()
        const type = resourceTypeRegistry.getTypeForSubject(subject)
        
        if (!type) return
        
        const release = item.release ?? item.catalog?.prod
        if (!release?.tag_name) return
        
        try {
          const door43Resource = {
            id: resourceId,
            name: repoName,
            title: item.title ?? entry.title ?? resourceKey,
            owner: ownerStr,
            language: langStr,
            language_title: item.language_title,
            subject,
            version: release.tag_name,
            format: item.content_format ?? item.format,
            content_format: item.content_format ?? item.format,
            metadata_url: item.metadata_url ?? entry.metadata_url,
            description: item.description ?? item.repo?.description,
            ingredients: item.ingredients ?? item.repo?.ingredients,
            release,
            server: 'git.door43.org',
            html_url: item.html_url ?? entry.html_url ?? release?.html_url,
          }
          
          const metadata = await createResourceMetadata(door43Resource as any, {
            resourceTypeRegistry,
            getResourceType: () => type,
            catalogAdapter: catalogManager.catalogAdapter,
            debug: false, // Quiet mode for background loading
          })
          
          await catalogManager.addResourceToCatalog(metadata)
          console.log(`📊 Metadata loaded and saved: ${resourceKey}`)
          
          // ⭐ Update the ResourceInfo in loadedResources with full metadata (including ingredients)
          const existingResource = useAppStore.getState().loadedResources[resourceKey]
          if (existingResource) {
            const updatedResource = {
              ...existingResource,
              ...metadata, // Spread full metadata (includes contentMetadata.ingredients)
              // Preserve app-specific fields that might have been set
              id: existingResource.id,
              key: existingResource.key,
              toc: existingResource.toc,
            }
            useAppStore.getState().addResource(updatedResource)
          }
          
          // ✅ Notify background download monitor that metadata changed
          setMetadataUpdateCounter(prev => prev + 1)
        } catch (error) {
          console.warn(`⚠️ Failed to load metadata for ${resourceKey}:`, error)
        }
      })
      
      // Wait for all metadata to complete
      Promise.allSettled(metadataPromises).then(() => {
        console.log(`✅ Phase 2 complete: Catalog metadata loaded for target language resources`)
      })
      
      // ✅ Add original language resources immediately
      console.log('⚡ Adding original language resources immediately to UI...')
      const originalResources = [
        { lang: 'el-x-koine', id: 'ugnt', label: 'UGNT', subject: 'Greek New Testament' },
        { lang: 'hbo', id: 'uhb', label: 'UHB', subject: 'Hebrew Old Testament' },
      ]
      
      for (const orig of originalResources) {
        const resourceKey = `unfoldingWord/${orig.lang}/${orig.id}`
        
        // Create basic ResourceInfo immediately
        const basicResourceInfo: ResourceInfo = {
          id: resourceKey,
          key: resourceKey,
          resourceKey: resourceKey, // Required for createResourceInfo
          title: orig.label,
          type: ResourceType.SCRIPTURE,
          category: 'Bible',
          subject: orig.subject,
          owner: 'unfoldingWord',
          language: orig.lang,
          languageCode: orig.lang,
          languageName: orig.label,
          resourceId: orig.id,
          server: 'git.door43.org',
          format: ResourceFormat.USFM,
          contentStructure: 'book',
          version: '1.0',
        }
        
        // Add to workspace immediately
        addResource(basicResourceInfo)
        loadedResourceKeys.push(resourceKey)
        
        // Add to scripture panel
        const currentPanel = getPanel('panel-1')
        const currentIndex = currentPanel?.resourceKeys.length || 0
        assignResourceToPanel(resourceKey, 'panel-1', currentIndex)
        
        console.log(`✅ Immediately added original: ${resourceKey} (metadata will load in background)`)
      }
      
      // Fetch metadata for original resources in background
      console.log('🔄 Fetching metadata for original language resources in background...')
      const originalMetadataPromises = originalResources.map(async (orig) => {
        const resourceKey = `unfoldingWord/${orig.lang}/${orig.id}`
        try {
          let catalogEntry = await catalogManager.catalogAdapter.get(resourceKey)
          
          if (!catalogEntry) {
            const results = await catalogManager.door43Client.searchCatalog({
              owner: 'unfoldingWord',
              lang: orig.lang,
              subject: orig.subject,
              stage: 'prod',
              limit: 1
            })
            
            if (results && results.length > 0) {
              const door43Resource = results[0]
              const repoName = door43Resource.name ?? door43Resource.repo_name
              const extractedResourceId = repoName?.replace(`${orig.lang}_`, '') || orig.id
              
              const normalizedResource = {
                ...door43Resource,
                id: extractedResourceId,
                language: door43Resource.language || door43Resource.lang
              }
              
              const metadata = await createResourceMetadata(normalizedResource as any, {
                resourceTypeRegistry,
                getResourceType: () => 'scripture',
                catalogAdapter: catalogManager.catalogAdapter,
                debug: true,
              })
              
              await catalogManager.addResourceToCatalog(metadata)
              console.log(`📊 Metadata loaded for original: ${resourceKey}`)
              
              // ⭐ Update the ResourceInfo in loadedResources with full metadata (including ingredients)
              const existingResource = useAppStore.getState().loadedResources[resourceKey]
              if (existingResource) {
                const updatedResource = {
                  ...existingResource,
                  ...metadata, // Spread full metadata (includes contentMetadata.ingredients)
                  // Preserve app-specific fields that might have been set
                  id: existingResource.id,
                  key: existingResource.key,
                  toc: existingResource.toc,
                }
                useAppStore.getState().addResource(updatedResource)
              }
              
              // ✅ Notify background download monitor that metadata changed
              setMetadataUpdateCounter(prev => prev + 1)
            }
          }
        } catch (error) {
          console.warn(`⚠️ Failed to load metadata for ${resourceKey}:`, error)
        }
      })
      
      // Log completion and create collection
      Promise.allSettled([...metadataPromises, ...originalMetadataPromises]).then(async () => {
        console.log(`✅ All metadata loading complete for ${languageCode}`)
        
        // Create a collection with all loaded resources for this language
        try {
          const collectionName = `${languageCode}_tc-helps`
          console.log(`📦 Creating collection: ${collectionName}`)
          
          const { useWorkspaceStore } = await import('../../lib/stores/workspaceStore')
          const workspaceStore = useWorkspaceStore.getState()
          
          await workspaceStore.saveAsCollection(
            collectionName,
            `Translation helps for ${languageCode}`
          )
          
          console.log(`✅ Collection created: ${collectionName}`)
        } catch (error) {
          console.error(`❌ Failed to create collection for ${languageCode}:`, error)
        }
      })
      
    } catch (error) {
      console.error('Error loading resources:', error)
    } finally {
      setIsLoadingResources(false)
    }
  }, [catalogManager, resourceTypeRegistry, assignResourceToPanel, setActiveResourceInPanel, addResource, getPanel, removeResourceFromPanel, navigate, stopDownload, isBackgroundDownloading])
  
  // Auto-load resources if language is provided via URL
  useEffect(() => {
    if (initialLanguage && !hasCheckedInitialState) {
      console.log('[SimplifiedReadView] Auto-loading resources for URL language:', initialLanguage)
      handleLanguageSelected(initialLanguage)
      setHasCheckedInitialState(true)
    }
  }, [initialLanguage, hasCheckedInitialState, handleLanguageSelected])
  
  // Check if current collection is fully cached
  useEffect(() => {
    const checkCollectionCompleteness = async () => {
      if (!currentLanguageCode) {
        setIsCollectionFullyCached(false)
        return
      }
      
      const collectionName = `${currentLanguageCode}_tc-helps`
      
      // Check if collection exists
      const collection = packageStore.packages.find(pkg => pkg.name === collectionName)
      if (!collection || !collection.resources || collection.resources.length === 0) {
        setIsCollectionFullyCached(false)
        return
      }
      
      // Check if all resources in the collection are fully cached
      let allCached = true
      for (const resource of collection.resources) {
        const resourceKey = `${resource.owner}/${resource.language}/${resource.resourceId}`
        const status = await completenessChecker.checkResource(resourceKey)
        
        if (!status.isComplete) {
          allCached = false
          break
        }
      }
      
      setIsCollectionFullyCached(allCached)
    }
    
    // Check immediately
    checkCollectionCompleteness()
    
    // Poll every 5 seconds to detect when downloads complete
    const interval = setInterval(checkCollectionCompleteness, 5000)
    
    return () => clearInterval(interval)
  }, [currentLanguageCode, packageStore.packages, completenessChecker])
  
  // Direct download handler - downloads collection without prompting
  const handleDirectDownloadCollection = useCallback(async () => {
    if (!currentLanguageCode) return
    
    const collectionName = `${currentLanguageCode}_tc-helps`
    const collection = packageStore.packages.find(pkg => pkg.name === collectionName)
    
    if (!collection) {
      console.error(`Collection ${collectionName} not found`)
      return
    }
    
    try {
      console.log(`📦 Starting collection export: ${collectionName}`)
      
      // Set initial progress state
      setExportProgress({
        isExporting: true,
        current: 0,
        total: 100,
        message: 'Initializing export...'
      })
      
      // Create Web Worker for export
      const worker = new Worker(
        new URL('../../workers/collectionExport.worker.ts', import.meta.url),
        { type: 'module' }
      )
      
      // Listen for worker messages
      worker.onmessage = (event: MessageEvent<ExportWorkerResponse>) => {
        const { type, data } = event.data
        
        if (type === 'progress') {
          console.log(`📦 [Export] ${data?.message}`)
          setExportProgress({
            isExporting: true,
            current: data?.progress || 0,
            total: data?.total || 100,
            message: data?.message || 'Exporting...'
          })
        } else if (type === 'complete') {
          console.log(`✅ Collection ${collectionName} exported successfully`)
          
          // Download the blob
          if (data?.blob && data?.filename) {
            const url = URL.createObjectURL(data.blob)
            const a = document.createElement('a')
            a.href = url
            a.download = data.filename
            document.body.appendChild(a)
            a.click()
            document.body.removeChild(a)
            URL.revokeObjectURL(url)
          }
          
          // Show success message briefly
          setExportProgress({
            isExporting: false,
            current: 0,
            total: 0,
            message: 'Export complete!'
          })
          
          // Hide after 2 seconds
          setTimeout(() => {
            setExportProgress({
              isExporting: false,
              current: 0,
              total: 0,
              message: ''
            })
          }, 2000)
          
          worker.terminate()
        } else if (type === 'error') {
          const errorMessage = data?.error || 'Export failed'
          console.error(`❌ Export error: ${errorMessage}`)
          
          // Check if this is an IndexedDB access error (for fallback)
          const isIndexedDBError = errorMessage.includes('IndexedDB') || 
                                   errorMessage.includes('database') ||
                                   errorMessage.includes('Cache store')
          
          let displayMessage = errorMessage
          if (isIndexedDBError) {
            displayMessage = 'Export failed: Unable to access cache in background. ' +
                           'This may be due to browser restrictions or private browsing mode.'
            console.warn('💡 Consider implementing fallback export method')
          }
          
          // Update progress to show error (keep visible longer for errors)
          setExportProgress({
            isExporting: false,
            current: -1, // Use -1 to indicate error state
            total: 0,
            message: displayMessage
          })
          
          // Auto-hide error after 8 seconds for longer messages
          setTimeout(() => {
            setExportProgress({
              isExporting: false,
              current: 0,
              total: 0,
              message: ''
            })
          }, 8000)
          
          worker.terminate()
        }
      }
      
      worker.onerror = (error) => {
        console.error(`❌ Worker error:`, error)
        
        setExportProgress({
          isExporting: false,
          current: 0,
          total: 0,
          message: 'Export failed'
        })
        
        worker.terminate()
      }
      
      // Send configuration to worker (no data!)
      // Worker will read directly from IndexedDB
      const message: ExportWorkerMessage = {
        type: 'export',
        data: {
          collection: {
            id: collection.id,
            name: collection.name,
            version: collection.version,
            description: collection.description,
            resources: collection.resources || [],
            panelLayout: collection.panelLayout || { panels: [] }
          },
          dbConfig: {
            dbName: 'tc-study-cache',
            storeName: 'cache-entries',
            version: 1
          }
        }
      }
      
      console.log(`📦 Sending export configuration to worker`)
      worker.postMessage(message)
      
    } catch (error) {
      console.error(`❌ Failed to start collection export:`, error)
      
      setExportProgress({
        isExporting: false,
        current: 0,
        total: 0,
        message: 'Export failed'
      })
    }
  }, [currentLanguageCode, packageStore.packages])
  
  // Configure linked panels plugins
  const plugins = useMemo(() => {
    const pluginRegistry = createDefaultPluginRegistry()
    
    // Register signal plugins for resource-panels communication
    pluginRegistry.register(tokenClickPlugin)
    pluginRegistry.register(linkClickPlugin)
    pluginRegistry.register(entryLinkClickPlugin)
    pluginRegistry.register(scriptureTokensBroadcastPlugin)
    pluginRegistry.register(scriptureContentRequestPlugin)
    pluginRegistry.register(scriptureContentResponsePlugin)
    
    return pluginRegistry
  }, [])
  
  // Resource keys for each panel (ensure arrays)
  const panel1ResourceKeys = panel1Resources.resourceKeys ?? []
  const panel2ResourceKeys = panel2Resources.resourceKeys ?? []
  
  // Modal management
  const openModal = useStudyStore((s: any) => s.openModal)
  
  // Handle opening entry-organized resources in modal
  const handleOpenEntry = useCallback((resourceId: string, entryId?: string) => {
    const resourceKey = entryId ? `${resourceId}#${entryId}` : resourceId
    openModal(resourceKey)
  }, [openModal])
  
  // Generate resource component dynamically using ViewerRegistry
  const generateResourceComponent = useCallback((resource: any) => {
    const resourceKey = resource.key || resource.id
    
    const resourceMetadata = {
      type: resource.type,
      subject: resource.subject,
      resourceId: resource.id,
      key: resourceKey,
      title: resource.title,
      language: resource.language,
      owner: resource.owner,
    } as any
    
    let ViewerComponent = viewerRegistry.getViewer(resourceMetadata)
    
    if (!ViewerComponent && resource.type) {
      ViewerComponent = viewerRegistry.getViewerByType(resource.type)
    }
    
    if (ViewerComponent) {
      const viewerProps: any = {
        resourceId: resource.id,
        resourceKey: resourceKey,
        // Pass full resource object - top-level fields are source of truth
        resource: resource,
      }
      
      // Add onEntryLinkClick for entry-organized resources
      if (resource.type === 'words' || resource.type === 'words-links' || resource.category === 'words-links' || resource.type === 'twl' || resource.type === 'academy' || resource.type === 'ta' || resource.type === 'tn' || resource.type === 'notes') {
        viewerProps.onEntryLinkClick = handleOpenEntry
      }
      
      return <ViewerComponent {...viewerProps} />
    } else {
      return (
        <FallbackViewer
          resourceId={resource.id}
          resourceKey={resourceKey}
          resourceType={resource.type}
        />
      )
    }
  }, [viewerRegistry, handleOpenEntry])
  
  // Build panel config (matches Studio exactly)
  const panelConfig: LinkedPanelsConfig = useMemo(() => {
    const allResourceIds = [...new Set([...panel1ResourceKeys, ...panel2ResourceKeys])]
    
    const resources = allResourceIds
      .map((id) => {
        const resource = loadedResources[id]
        if (!resource) return null
        
        return {
          id: resource.id,
          title: resource.title,
          description: `${resource.type} resource`,
          category: resource.category || resource.type,
          component: generateResourceComponent(resource),
        }
      })
      .filter(Boolean) as any[]

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

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={pointerWithin}
      onDragStart={handleDragStart}
      onDragOver={handleDragOver}
      onDragEnd={handleDragEnd}
    >
      <div className="h-full flex flex-col overflow-hidden">
      {/* Main Content Area - Two Panels (matches Studio exactly) */}
      <div className="flex-1 overflow-hidden">
        <LinkedPanelsContainer config={panelConfig} plugins={plugins}>
          {/* Bridge global events to panel system */}
          <GlobalSignalBridge />
          
          <div
            ref={resizeContainerRef}
            className="h-full flex flex-col md:flex-row overflow-hidden panels-resize-container relative"
          >
            {/* Panel 1 */}
            <DroppablePanel
              id="panel-1-droppable"
              className="min-h-0 overflow-hidden"
              style={{ flexBasis: `${panel1Width}%` }}
              colorScheme="blue"
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
                        placeholderIndex={hoverPanelId === 'panel-1' ? dropTargetIndex : undefined}
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
                            message="Select a language to load resources"
                          />
                        )}
                      </div>
                    </div>
                  )
                }}
              </LinkedPanel>
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
              {/* Touch-friendly hitbox */}
              <div className="absolute md:left-1/2 md:-translate-x-1/2 md:top-0 md:w-4 md:h-full top-1/2 -translate-y-1/2 left-0 w-full h-4" />
              
              {/* Visual grip indicator */}
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
              className="min-h-0 overflow-hidden"
              style={{ flexBasis: `${100 - panel1Width}%` }}
              colorScheme="purple"
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
                        placeholderIndex={hoverPanelId === 'panel-2' ? dropTargetIndex : undefined}
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
                            message="Select a language to load resources"
                          />
                        )}
                      </div>
                    </div>
                  )
                }}
              </LinkedPanel>
            </DroppablePanel>
            
            {/* Entry Resource Modal with History - positioned relative to panels container */}
            <EntryResourceModal onEntryLinkClick={handleOpenEntry} />
          </div>
        </LinkedPanelsContainer>
      </div>
      
      {/* Navigation Bar with Language Picker - MOVED TO BOTTOM */}
      {navState === 'compact' && (
        <div className="flex-shrink-0 flex flex-col">
          {isLoadingResources && (
            <div 
              className="flex items-center justify-center px-4 py-1.5 bg-blue-50 border-t border-blue-100/50"
              role="status"
              aria-label="Loading resources"
            >
              <Loader2 className="w-4 h-4 animate-spin text-blue-600" />
            </div>
          )}
          <div className="flex items-center bg-white border-t border-gray-100/50 px-2 py-1.5">
            <NavigationBar 
              isCompact={true}
              onToggleCompact={undefined}
              showLanguagePicker={true}
              onLanguageSelected={handleLanguageSelected}
              autoOpenLanguagePicker={shouldAutoOpenLanguagePicker}
              downloadIndicator={
                <DownloadIndicator 
                  isDownloading={isBackgroundDownloading}
                  progress={downloadStats.progress}
                />
              }
              onDownloadCollection={isCollectionFullyCached ? handleDirectDownloadCollection : undefined}
              onLoadCollection={() => setShowLoadDialog(true)}
            />
          </div>
        </div>
      )}
      
      {/* DragOverlay for ghost preview */}
      <DragOverlay>
        {activeId ? (
          <div className="px-2 py-1.5 text-xs font-medium bg-blue-100 text-blue-800 border-2 border-blue-300 rounded shadow-lg opacity-90">
            {getResourceLabel(activeId)}
          </div>
        ) : null}
      </DragOverlay>
      
      {/* Collection Import Dialog */}
      <CollectionImportDialog
        isOpen={showLoadDialog}
        onClose={() => setShowLoadDialog(false)}
      />
      
      {/* Export Progress Toast */}
      {(exportProgress.isExporting || exportProgress.message) && (
        <div className="fixed bottom-4 right-4 z-50 bg-white dark:bg-gray-800 rounded-lg shadow-lg border border-gray-200 dark:border-gray-700 p-3 min-w-[280px] animate-in slide-in-from-bottom-2">
          <div className="flex items-center gap-3">
            {/* Icon */}
            <div className="flex-shrink-0">
              {exportProgress.isExporting ? (
                <Package className="w-6 h-6 text-blue-500 animate-pulse" />
              ) : exportProgress.current === -1 || exportProgress.message.includes('Error') || exportProgress.message.includes('failed') ? (
                <XCircle className="w-6 h-6 text-red-500" />
              ) : (
                <CheckCircle2 className="w-6 h-6 text-green-500" />
              )}
            </div>
            
            {/* Content */}
            <div className="flex-1 min-w-0">
              {/* Active export: show progress */}
              {exportProgress.isExporting && exportProgress.total > 0 ? (
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                      {exportProgress.current} / {exportProgress.total}
                    </span>
                    <span className="text-xs font-semibold text-blue-600 dark:text-blue-400">
                      {Math.round((exportProgress.current / exportProgress.total) * 100)}%
                    </span>
                  </div>
                  <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-1.5 overflow-hidden">
                    <div 
                      className="bg-blue-500 h-full transition-all duration-300 ease-out"
                      style={{ width: `${(exportProgress.current / exportProgress.total) * 100}%` }}
                    />
                  </div>
                </div>
              ) : (
                /* Completed or error: show message */
                <p className={`text-sm font-medium truncate ${
                  exportProgress.current === -1 || exportProgress.message.includes('Error') || exportProgress.message.includes('failed')
                    ? 'text-red-600 dark:text-red-400'
                    : 'text-green-600 dark:text-green-400'
                }`}>
                  {exportProgress.message}
                </p>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
    </DndContext>
  )
}
