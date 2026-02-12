/**
 * EntryResourceModal Component
 * 
 * Reusable modal for displaying entry-organized resources (Translation Words, etc.)
 * with history stack navigation support.
 */

import { AlertCircle, ArrowLeft, ArrowRight, Check, Loader, Minimize2, X } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useAppStore } from '../../contexts/AppContext'
import { useCatalogManager } from '../../contexts/CatalogContext'
import { useEntryViewerRegistry } from '../../contexts/EntryViewerContext'
import { useStudyStore } from '../../store/studyStore'
import { ErrorBoundary } from './ErrorBoundary'

interface EntryResourceModalProps {
  onEntryLinkClick?: (resourceId: string, entryId?: string) => void
}

export function EntryResourceModal({ onEntryLinkClick }: EntryResourceModalProps) {
  const modalState = useStudyStore((s: any) => s.modal)
  const closeModal = useStudyStore((s: any) => s.closeModal)
  const minimizeModal = useStudyStore((s: any) => s.minimizeModal)
  const restoreModal = useStudyStore((s: any) => s.restoreModal)
  const modalGoBack = useStudyStore((s: any) => s.modalGoBack)
  const modalGoForward = useStudyStore((s: any) => s.modalGoForward)
  const canModalGoBack = useStudyStore((s: any) => s.canModalGoBack)
  const canModalGoForward = useStudyStore((s: any) => s.canModalGoForward)
  const openModal = useStudyStore((s: any) => s.openModal)
  const loadedResources = useAppStore((s) => s.loadedResources)
  const catalogManager = useCatalogManager()
  const entryViewerRegistry = useEntryViewerRegistry()
  const navigationStatus = useStudyStore((s: any) => s.modal.navigationStatus)
  
  const [resourceMetadata, setResourceMetadata] = useState<any>(null)
  const [loadingMetadata, setLoadingMetadata] = useState(false)
  const [entryContent, setEntryContent] = useState<any>(null)

  // Extract resourceId and entryId from modalState (safe even if modal is closed)
  const resourceId = modalState.resourceKey ? modalState.resourceKey.split('#')[0] : null
  const entryId = modalState.resourceKey?.includes('#') ? modalState.resourceKey.split('#')[1] : null
  const resource = resourceId ? loadedResources[resourceId] : null
  
  // Reset entry content when entry changes
  useEffect(() => {
    setEntryContent(null)
  }, [resourceId, entryId])

  // Load metadata from catalog when resourceId changes
  useEffect(() => {
    // Reset state when resourceKey changes
    setResourceMetadata(null)
    setLoadingMetadata(false)
    
    if (!modalState.isOpen || !resourceId) {
      return
    }
    
    // If resource is already loaded, use it
    if (resource) {
      console.log('[EntryResourceModal] Using loaded resource:', resourceId)
      return
    }
    
    // Fetch metadata from catalog
    if (!catalogManager) {
      console.warn('[EntryResourceModal] Catalog manager not available')
      return
    }
    
    console.log('[EntryResourceModal] Fetching metadata from catalog:', resourceId)
    setLoadingMetadata(true)
    
    catalogManager.getResourceMetadata(resourceId)
      .then((metadata) => {
        console.log('[EntryResourceModal] Got metadata from catalog:', metadata)
        if (metadata) {
          setResourceMetadata(metadata)
        } else {
          console.warn('[EntryResourceModal] No metadata returned from catalog for:', resourceId)
        }
      })
      .catch((err) => {
        console.error('[EntryResourceModal] Failed to load resource metadata:', err)
      })
      .finally(() => {
        setLoadingMetadata(false)
      })
  }, [modalState.isOpen, resourceId, modalState.resourceKey, resource, catalogManager])
  
  // Debug: Log resource lookup
  useEffect(() => {
    if (modalState.resourceKey) {
      console.log('[EntryResourceModal] Modal state:', {
        resourceKey: modalState.resourceKey,
        resourceId,
        entryId,
        hasResource: !!resource,
        hasMetadata: !!resourceMetadata,
        loadedResourcesKeys: Object.keys(loadedResources),
      })
    }
  }, [modalState.resourceKey, resourceId, entryId, resource, resourceMetadata, loadedResources])

  // Handle opening entry links within the modal
  const handleOpenEntry = (resourceId: string, entryId?: string) => {
    if (onEntryLinkClick) {
      onEntryLinkClick(resourceId, entryId)
    } else {
      // Fallback: use studyStore directly
      const resourceKey = entryId ? `${resourceId}#${entryId}` : resourceId
      openModal(resourceKey)
    }
  }

  // Early return AFTER all hooks
  if (!modalState.isOpen || !modalState.resourceKey) {
    return null
  }

  // If minimized, show floating restore/close button (merged, compact)
  if (modalState.isMinimized) {
    const resourceInfo = resource || (resourceMetadata ? {
      title: resourceMetadata.title || resourceId,
    } : null)
    
    // Prefer loaded entry content (term/title), fallback to entryId, then resource title
    const entryTitle = entryContent?.term || entryContent?.title
    const entryName = entryId ? entryId.split('/').pop() || entryId : null
    const displayTitle = entryTitle || entryName || resourceInfo?.title || 'Entry'
    
    return (
      <div className="absolute bottom-2 right-6 z-50">
        <div className="relative">
          {/* Restore button */}
          <button
            onClick={restoreModal}
            className="relative flex items-center gap-2 pl-4 pr-4 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-full shadow-lg transition-all hover:shadow-xl"
            title="Restore entry modal"
          >
            {/* Navigation status badge */}
            {navigationStatus !== 'idle' && (
              <div className={`absolute -top-2 -left-2 flex items-center justify-center p-1.5 rounded-full shadow-lg ${
                navigationStatus === 'navigating' ? 'bg-blue-100' :
                navigationStatus === 'success' ? 'bg-green-100' :
                navigationStatus === 'warning' ? 'bg-amber-100' :
                'bg-red-100'
              }`}>
                {navigationStatus === 'navigating' && <Loader className="w-3 h-3 text-blue-600 animate-spin" />}
                {navigationStatus === 'success' && <Check className="w-3 h-3 text-green-600" />}
                {navigationStatus === 'warning' && <AlertCircle className="w-3 h-3 text-amber-600" />}
                {navigationStatus === 'error' && <AlertCircle className="w-3 h-3 text-red-600" />}
              </div>
            )}
            
            <span className="text-sm font-medium truncate max-w-[120px]">
              {displayTitle}
            </span>
            <ArrowLeft className="w-4 h-4 rotate-180" />
          </button>
          
          {/* Close button overlay (top-right corner) - using div to avoid nested buttons */}
          <div
            onClick={(e) => {
              e.stopPropagation()
              closeModal()
            }}
            className="absolute -top-1.5 -right-1.5 p-1.5 bg-gray-700 hover:bg-gray-800 rounded-full shadow-md transition-colors cursor-pointer"
            title="Close entry modal"
            role="button"
            aria-label="Close"
            tabIndex={0}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault()
                closeModal()
              }
            }}
          >
            <X className="w-3 h-3 text-white" />
          </div>
        </div>
      </div>
    )
  }

  // Determine resource info - prefer loaded resource, fallback to catalog metadata
  const resourceInfo = resource || (resourceMetadata ? {
    id: resourceId,
    key: resourceId,
    title: resourceMetadata.title || resourceId,
    type: resourceMetadata.type || 'words',
    metadata: resourceMetadata,
  } : null)
  
  // Extract entry term from entryId (format: "bible/kt/grace" -> "grace")
  const entryTerm = entryId ? entryId.split('/').pop() || entryId : null

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50" onClick={(e) => {
      // Close on backdrop click
      if (e.target === e.currentTarget) {
        closeModal()
      }
    }}>
      <div className="bg-white rounded-2xl shadow-2xl max-w-4xl w-full max-h-[90vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
        {/* Icon-based Modal Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 bg-gray-50">
          {/* History Navigation - Compact */}
          <div className="flex items-center gap-1">
            <button
              onClick={modalGoBack}
              disabled={!canModalGoBack()}
              className="p-1.5 hover:bg-white rounded-md transition-colors disabled:opacity-20 disabled:cursor-not-allowed"
              aria-label="Back"
              title="Back"
            >
              <ArrowLeft className="w-4 h-4 text-gray-700" />
            </button>
            <button
              onClick={modalGoForward}
              disabled={!canModalGoForward()}
              className="p-1.5 hover:bg-white rounded-md transition-colors disabled:opacity-20 disabled:cursor-not-allowed"
              aria-label="Forward"
              title="Forward"
            >
              <ArrowRight className="w-4 h-4 text-gray-700" />
            </button>
            
            {/* History position indicator */}
            <span className="ml-2 text-xs text-gray-500 font-mono">
              {modalState.historyIndex + 1}/{modalState.history.length}
            </span>
          </div>

          {/* Resource title - minimal */}
          <div className="flex-1 mx-4 truncate text-center">
            <h2 className="text-sm font-medium text-gray-900 truncate">
              {entryTerm || resourceInfo?.title || resourceId}
            </h2>
          </div>

          {/* Minimize Button */}
          <button
            onClick={minimizeModal}
            className="p-1.5 hover:bg-white rounded-md transition-colors"
            aria-label="Minimize"
            title="Minimize"
          >
            <Minimize2 className="w-4 h-4 text-gray-600" />
          </button>
        </div>

        {/* Modal Content */}
        <div className="flex-1 overflow-auto bg-white min-h-0">
          <ErrorBoundary fallback={
            <div className="p-6 text-red-600 bg-white">
              <p className="font-semibold mb-2">Something went wrong</p>
              <p className="text-sm">Check the browser console for details.</p>
              <p className="text-xs text-gray-500 mt-2">Resource: {resourceId} | Entry: {entryId || 'none'}</p>
            </div>
          }>
            {(() => {
              console.log('[EntryResourceModal] Rendering content:', {
                resourceId,
                entryId,
                hasResourceInfo: !!resourceInfo,
                hasMetadata: !!resourceMetadata,
                loadingMetadata,
              })
              
              // If loading metadata and we don't have it yet, show loader
              if (loadingMetadata && !resourceMetadata) {
                return (
                  <div className="flex items-center justify-center h-full">
                    <Loader className="w-8 h-8 animate-spin text-blue-600" />
                  </div>
                )
              }
              
              // No resource found
              if (!resourceInfo && !resourceMetadata) {
                return (
                  <div className="p-6 text-gray-600">
                    <p>Resource not found: {resourceId}</p>
                    {entryId && <p className="text-sm mt-2">Entry: {entryId}</p>}
                  </div>
                )
              }
              
              // Must have an entryId to display in modal
              if (!entryId) {
                return (
                  <div className="p-6 text-gray-600">
                    <p>No entry specified</p>
                    <p className="text-sm mt-2">Entry Modal requires an entry ID to display</p>
                  </div>
                )
              }
              
              // Use Entry Viewer Registry to get the appropriate viewer
              // ResourceInfo now extends ResourceMetadata, so we use resourceInfo directly
              const metadata = resourceInfo || resourceMetadata
              const EntryViewer = entryViewerRegistry.getEntryViewer({
                type: metadata?.type,
                subject: metadata?.subject,
                resourceId: resourceId,
                owner: metadata?.owner,
                languageCode: metadata?.language, // Use language, not languageCode
              })
              
              if (!EntryViewer) {
                return (
                  <div className="p-6 text-gray-600">
                    <p className="mb-4">No entry viewer registered for this resource type</p>
                    <p className="text-sm text-gray-500">Type: {metadata?.type || 'unknown'}</p>
                    {entryId && <p className="text-sm text-gray-500">Entry: {entryId}</p>}
                    <p className="text-xs text-gray-400 mt-4">
                      Developers: Register an entry viewer using the Entry Viewer Registry
                    </p>
                  </div>
                )
              }
              
              // Render the entry viewer
              // Use resourceKey (with entryId) as key to force re-render on history navigation
              try {
                return (
                  <EntryViewer
                    key={modalState.resourceKey}
                    resourceKey={resourceId}
                    entryId={entryId}
                    metadata={metadata}
                    onEntryLinkClick={handleOpenEntry}
                    onContentLoaded={setEntryContent}
                  />
                )
              } catch (error) {
                console.error('[EntryResourceModal] Error rendering entry viewer:', error)
                return (
                  <div className="p-6 text-red-600 bg-white">
                    <p className="font-semibold mb-2">Error rendering entry viewer</p>
                    <p className="text-sm">{error instanceof Error ? error.message : String(error)}</p>
                    <p className="text-xs text-gray-500 mt-2">Check console for details</p>
                  </div>
                )
              }
            })()}
          </ErrorBoundary>
        </div>
      </div>
    </div>
  )
}
