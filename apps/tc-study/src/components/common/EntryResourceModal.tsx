/**
 * EntryResourceModal Component
 * 
 * Reusable modal for displaying entry-organized resources (Translation Words, etc.)
 * with history stack navigation support.
 */

import { AlertCircle, ArrowLeft, ArrowRight, Check, Minimize2, X } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { useAppStore } from '../../contexts/AppContext'
import { useCatalogManager } from '../../contexts/CatalogContext'
import { useEntryViewerRegistry } from '../../contexts/EntryViewerContext'
import { useEntryModalStore } from '../../features/entries'
import { useWorkspaceStore } from '../../features/workspace/workspaceStore'
import { useWizardStore } from '../../lib/stores/wizardStore'
import { LoadingSpinner } from '../../shared/LoadingSpinner'
import { ResourceInfoButton } from '../resources/common/ResourceInfoButton'
import { buildEntryModalResourceInfo } from './buildEntryModalResourceInfo'
import { ErrorBoundary } from './ErrorBoundary'
import { resolveEntryParentResourceInfo } from './resolveEntryParentResourceInfo'

interface EntryResourceModalProps {
  onEntryLinkClick?: (resourceId: string, entryId?: string) => void
}

export function EntryResourceModal({ onEntryLinkClick }: EntryResourceModalProps) {
  const modalState = useEntryModalStore((s) => s.modal)
  const closeModal = useEntryModalStore((s) => s.closeModal)
  const minimizeModal = useEntryModalStore((s) => s.minimizeModal)
  const restoreModal = useEntryModalStore((s) => s.restoreModal)
  const modalGoBack = useEntryModalStore((s) => s.modalGoBack)
  const modalGoForward = useEntryModalStore((s) => s.modalGoForward)
  const canModalGoBack = useEntryModalStore((s) => s.canModalGoBack)
  const canModalGoForward = useEntryModalStore((s) => s.canModalGoForward)
  const openModal = useEntryModalStore((s) => s.openModal)
  const loadedResources = useAppStore((s) => s.loadedResources)
  const packageResources = useWorkspaceStore((s) => s.currentPackage?.resources)
  const catalogManager = useCatalogManager()
  const entryViewerRegistry = useEntryViewerRegistry()
  const navigationStatus = useEntryModalStore((s) => s.modal.navigationStatus)
  const availableLanguages = useWizardStore((s) => s.availableLanguages)

  const [resourceMetadata, setResourceMetadata] = useState<any>(null)
  const [loadingMetadata, setLoadingMetadata] = useState(false)
  const [entryContent, setEntryContent] = useState<any>(null)

  // Extract resourceId and entryId from modalState (safe even if modal is closed)
  const resourceId = modalState.resourceKey ? modalState.resourceKey.split('#')[0] : undefined
  const entryId = modalState.resourceKey?.includes('#')
    ? modalState.resourceKey.split('#')[1]
    : undefined
  const resource = resourceId ? loadedResources[resourceId] : null

  // RTL: must run before any early return (hooks order)
  const modalDirection = useMemo(() => {
    if (!resourceId) return 'ltr'
    const meta = resource || resourceMetadata
    if (meta?.languageDirection === 'rtl') return 'rtl'
    if (meta?.languageDirection === 'ltr') return 'ltr'
    const lang = meta?.language ?? meta?.languageCode ?? resourceId.split('/')[1]?.split('_')[0] ?? ''
    if (!lang) return 'ltr'
    const entry = availableLanguages.find((l) => l.code === lang)
    return entry?.direction === 'rtl' ? 'rtl' : 'ltr'
  }, [resource, resourceMetadata, resourceId, availableLanguages])

  // Prefer loaded resource; memoize catalog fallback so viewers don't see a new
  // metadata object identity on every parent re-render (e.g. onContentLoaded).
  const resourceInfo = useMemo(
    () => buildEntryModalResourceInfo(resourceId, resource, resourceMetadata),
    [resourceId, resource, resourceMetadata]
  )

  // Parent TW/TA package for ResourceInfo (not the per-article stub / entry id).
  const parentInfoResource = useMemo(
    () =>
      resolveEntryParentResourceInfo(
        resourceId,
        packageResources,
        loadedResources,
        resourceMetadata
      ),
    [resourceId, packageResources, loadedResources, resourceMetadata]
  )
  
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

      return
    }
    
    // Fetch metadata from catalog
    if (!catalogManager) {
      console.warn('[EntryResourceModal] Catalog manager not available')
      return
    }
    

    setLoadingMetadata(true)
    
    catalogManager.getResourceMetadata(resourceId)
      .then((metadata) => {

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
      // intentionally empty
    }
  }, [modalState.resourceKey, resourceId, entryId, resource, resourceMetadata, loadedResources])

  // Handle opening entry links within the modal
  const handleOpenEntry = (resourceId: string, entryId?: string) => {
    if (onEntryLinkClick) {
      onEntryLinkClick(resourceId, entryId)
    } else {
      // Fallback: use entryModalStore directly
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
            className="relative flex items-center gap-2 pl-4 pr-4 py-3 bg-accent hover:bg-accent-hover text-white rounded-full shadow-lg transition-all hover:shadow-xl"
            title="Restore entry modal"
          >
            {/* Navigation status badge */}
            {navigationStatus !== 'idle' && (
              <div className={`absolute -top-2 -left-2 flex items-center justify-center p-1.5 rounded-full shadow-lg ${
                navigationStatus === 'navigating' ? 'bg-accent-soft' :
                navigationStatus === 'success' ? 'bg-accent-soft' :
                navigationStatus === 'warning' ? 'bg-highlight' :
                'bg-danger-soft'
              }`}>
                {navigationStatus === 'navigating' && (
                  <LoadingSpinner size="sm" label="Navigating" className="text-accent" />
                )}
                {navigationStatus === 'success' && <Check className="w-3 h-3 text-accent-fg" />}
                {navigationStatus === 'warning' && <AlertCircle className="w-3 h-3 text-fg" />}
                {navigationStatus === 'error' && <AlertCircle className="w-3 h-3 text-danger" />}
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
            className="absolute -top-1.5 -right-1.5 p-1.5 bg-elevated hover:bg-muted border border-border rounded-full shadow-md transition-colors cursor-pointer"
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
            <X className="w-3 h-3 text-fg" />
          </div>
        </div>
      </div>
    )
  }

  // Extract entry term from entryId (format: "bible/kt/grace" -> "grace")
  const entryTerm = entryId ? entryId.split('/').pop() || entryId : null

  return (
    <div className="fixed inset-0 bg-overlay backdrop-blur-sm flex items-center justify-center z-50" onClick={(e) => {
      // Close on backdrop click
      if (e.target === e.currentTarget) {
        closeModal()
      }
    }}>
      <div className="bg-surface rounded-2xl shadow-2xl max-w-4xl w-full max-h-[90vh] flex flex-col" onClick={(e) => e.stopPropagation()} dir={modalDirection}>
        {/* Icon-based Modal Header - controls in LTR so arrows/icons don't mirror in RTL */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-muted">
          {/* History Navigation - RTL: left arrow=forward, right arrow=back (same as nav bar) */}
          <div className="flex items-center gap-1" dir="ltr">
            <button
              onClick={modalDirection === 'rtl' ? modalGoForward : modalGoBack}
              disabled={modalDirection === 'rtl' ? !canModalGoForward() : !canModalGoBack()}
              className="p-1.5 hover:bg-surface rounded-md transition-colors disabled:opacity-20 disabled:cursor-not-allowed"
              aria-label={modalDirection === 'rtl' ? 'Forward' : 'Back'}
              title={modalDirection === 'rtl' ? 'Forward' : 'Back'}
            >
              <ArrowLeft className="w-4 h-4 text-fg-secondary" />
            </button>
            <button
              onClick={modalDirection === 'rtl' ? modalGoBack : modalGoForward}
              disabled={modalDirection === 'rtl' ? !canModalGoBack() : !canModalGoForward()}
              className="p-1.5 hover:bg-surface rounded-md transition-colors disabled:opacity-20 disabled:cursor-not-allowed"
              aria-label={modalDirection === 'rtl' ? 'Back' : 'Forward'}
              title={modalDirection === 'rtl' ? 'Back' : 'Forward'}
            >
              <ArrowRight className="w-4 h-4 text-fg-secondary" />
            </button>
            
            {/* History position indicator */}
            <span className="ml-2 text-xs text-fg-muted font-mono">
              {modalState.historyIndex + 1}/{modalState.history.length}
            </span>
          </div>

          {/* Resource title - minimal (inherits modal dir for RTL titles) */}
          <div className="flex-1 mx-4 truncate text-center">
            <h2 className="text-sm font-medium text-fg truncate">
              {entryTerm || resourceInfo?.title || resourceId}
            </h2>
          </div>

          {/* Info (parent TW/TA package) + Minimize — LTR chrome cluster */}
          <div className="flex items-center gap-0.5" dir="ltr">
            {parentInfoResource ? <ResourceInfoButton resource={parentInfoResource} /> : null}
            <button
              onClick={minimizeModal}
              className="p-1.5 hover:bg-surface rounded-md transition-colors text-fg-muted hover:text-fg-secondary"
              aria-label="Minimize"
              title="Minimize"
            >
              <Minimize2 className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Modal Content - dir for RTL so entry content flows correctly */}
        <div className="flex-1 overflow-auto bg-surface min-h-0" dir={modalDirection}>
          <ErrorBoundary fallback={
            <div className="p-6 text-danger bg-surface">
              <p className="font-semibold mb-2">Something went wrong</p>
              <p className="text-sm">Check the browser console for details.</p>
              <p className="text-xs text-fg-muted mt-2">Resource: {resourceId} | Entry: {entryId || 'none'}</p>
            </div>
          }>
            {(() => {

              
              // If loading metadata and we don't have it yet, show loader
              if (loadingMetadata && !resourceMetadata) {
                return (
                  <LoadingSpinner
                    centered
                    label="Loading resource"
                    className="text-accent"
                    containerClassName="h-full"
                  />
                )
              }
              
              // No resource found
              if (!resourceInfo && !resourceMetadata) {
                return (
                  <div className="p-6 text-fg-secondary">
                    <p>Resource not found: {resourceId}</p>
                    {entryId && <p className="text-sm mt-2">Entry: {entryId}</p>}
                  </div>
                )
              }
              
              // Must have resource + entry to display in modal
              if (!resourceId || !entryId) {
                return (
                  <div className="p-6 text-fg-secondary">
                    <p>No entry specified</p>
                    <p className="text-sm mt-2">Entry Modal requires an entry ID to display</p>
                  </div>
                )
              }

              const resolvedResourceId = resourceId
              const resolvedEntryId = entryId
              
              // Use Entry Viewer Registry to get the appropriate viewer
              // ResourceInfo now extends ResourceMetadata, so we use resourceInfo directly
              const metadata = resourceInfo || resourceMetadata
              const EntryViewer = entryViewerRegistry.getEntryViewer({
                type: metadata?.type,
                subject: metadata?.subject,
                resourceId: resolvedResourceId,
                owner: metadata?.owner,
                languageCode: metadata?.language, // Use language, not languageCode
              })
              
              if (!EntryViewer) {
                return (
                  <div className="p-6 text-fg-secondary">
                    <p className="mb-4">No entry viewer registered for this resource type</p>
                    <p className="text-sm text-fg-muted">Type: {metadata?.type || 'unknown'}</p>
                    <p className="text-sm text-fg-muted">Entry: {resolvedEntryId}</p>
                    <p className="text-xs text-fg-muted mt-4">
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
                    resourceKey={resolvedResourceId}
                    entryId={resolvedEntryId}
                    metadata={metadata}
                    direction={modalDirection}
                    onEntryLinkClick={handleOpenEntry}
                    onContentLoaded={setEntryContent}
                  />
                )
              } catch (error) {
                console.error('[EntryResourceModal] Error rendering entry viewer:', error)
                return (
                  <div className="p-6 text-danger bg-surface">
                    <p className="font-semibold mb-2">Error rendering entry viewer</p>
                    <p className="text-sm">{error instanceof Error ? error.message : String(error)}</p>
                    <p className="text-xs text-fg-muted mt-2">Check console for details</p>
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
