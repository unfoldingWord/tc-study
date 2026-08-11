/**
 * Simplified Read View
 *
 * A simplified version of the Studio for reading resources
 * - No sidebar
 * - Language picker to auto-load all tc-ready resources
 * - Two-panel layout with tab pointer DnD (same mutations as Studio)
 */

import { LinkedPanelsContainer } from '@bt-synergy/resource-panels'
import {
  useCallback,
  useMemo,
  useState,
  type MouseEvent,
  type RefObject,
  type TouchEvent,
} from 'react'
import {
  useCurrentReference,
  useNavigationScope,
  useResourceTypeRegistry,
  useViewerRegistry,
} from '../../contexts'
import { useAppStore } from '../../contexts/AppContext'
import { useStudioResources } from '../../hooks'
import { useEntryModalStore } from '../../features/entries'
import { CollectionImportDialog } from '../collections/CollectionImportDialog'
import { EntryResourceModal } from '../common/EntryResourceModal'
import { TabDnDProvider, useTabDnD } from '../../features/dnd/TabDnDContext'
import { useFilteredReadPanelKeys } from '../../features/read/useFilteredReadPanelKeys'
import { useReadCollectionExport } from '../../features/read/useReadCollectionExport'
import { useReadGatewayBookCatalog } from '../../features/read/useReadGatewayBookCatalog'
import { useReadLanguageBootstrap } from '../../features/read/useReadLanguageBootstrap'
import { useReadLinkedPanelsConfig } from '../../features/read/useReadLinkedPanelsConfig'
import { useReadPanelDnD } from '../../features/read/useReadPanelDnD'
import { useReadPanelResize } from '../../features/read/useReadPanelResize'
import { useReadUrlSync } from '../../features/read/useReadUrlSync'
import { createStudioPluginRegistry } from '../../features/studio/createStudioPluginRegistry'
import { moveResourceBetweenPanels } from '../../features/workspace/resourceMutations'
import { NavigationBar } from '../studio/NavigationBar'
import { DownloadIndicator } from './DownloadIndicator'
import { ExportProgressToast } from './ExportProgressToast'
import { PanelResizeDivider } from '../shared/PanelResizeDivider'
import { ReadLinkedPanel } from './ReadLinkedPanel'
import {
  type PartialRouteHint,
  type ReadRouteTail,
} from '../../utils/readRoutes'

interface SimplifiedReadViewProps {
  initialLanguage?: string
  /** True when the URL is `/read` without `:languageCode` — language modal opens and cannot be skipped. */
  requireLanguageInUrl?: boolean
  /** Deep link: `/read/{lang}/bible|obs/{navType}/{navRef}` */
  readRouteTail?: ReadRouteTail | null
  /** Partial deep link: `/read/{lang}/bible|obs[/{navType}]` — sets scope (and mode when navType is present) without overriding the current reference. */
  partialRouteHint?: PartialRouteHint
}

function ReadPanelsArea(props: {
  panel1Width: number
  isResizingPanels: boolean
  resizeContainerRef: RefObject<HTMLDivElement | null>
  handlePanelDividerMouseDown: (e: MouseEvent) => void
  handlePanelDividerTouchStart: () => void
  filteredPanel1Keys: string[]
  filteredPanel2Keys: string[]
  filteredPanel1Resources: ReturnType<typeof useFilteredReadPanelKeys>['filteredPanel1Resources']
  filteredPanel2Resources: ReturnType<typeof useFilteredReadPanelKeys>['filteredPanel2Resources']
  panel1Resources: ReturnType<typeof useStudioResources>
  panel2Resources: ReturnType<typeof useStudioResources>
  isLoadingResources: boolean
  onEntryLinkClick: (resourceId: string, entryId?: string) => void
}) {
  const { activeId, activeLabel, hoverPanelId, dropIndex } = useTabDnD()
  const dragLabel =
    activeId && activeLabel
      ? activeLabel
      : ''

  const {
    panel1Width,
    isResizingPanels,
    resizeContainerRef,
    handlePanelDividerMouseDown,
    handlePanelDividerTouchStart,
    filteredPanel1Keys,
    filteredPanel2Keys,
    filteredPanel1Resources,
    filteredPanel2Resources,
    panel1Resources,
    panel2Resources,
    isLoadingResources,
    onEntryLinkClick,
  } = props

  return (
    <div
      ref={resizeContainerRef}
      className="h-full flex flex-col md:flex-row overflow-hidden panels-resize-container relative"
    >
      <ReadLinkedPanel
        panelId="panel-1"
        otherPanelId="panel-2"
        colorScheme="blue"
        flexBasisPercent={panel1Width}
        filteredKeys={filteredPanel1Keys}
        filteredResources={filteredPanel1Resources}
        panelResources={panel1Resources}
        isLoadingResources={isLoadingResources}
        showDropPlaceholder={hoverPanelId === 'panel-1'}
        placeholderLabel={dragLabel}
        placeholderIndex={
          hoverPanelId === 'panel-1' ? dropIndex ?? undefined : undefined
        }
      />

      <PanelResizeDivider
        isResizing={isResizingPanels}
        onMouseDown={handlePanelDividerMouseDown}
        onTouchStart={handlePanelDividerTouchStart}
      />

      <ReadLinkedPanel
        panelId="panel-2"
        otherPanelId="panel-1"
        colorScheme="purple"
        flexBasisPercent={100 - panel1Width}
        filteredKeys={filteredPanel2Keys}
        filteredResources={filteredPanel2Resources}
        panelResources={panel2Resources}
        isLoadingResources={isLoadingResources}
        showDropPlaceholder={hoverPanelId === 'panel-2'}
        placeholderLabel={dragLabel}
        placeholderIndex={
          hoverPanelId === 'panel-2' ? dropIndex ?? undefined : undefined
        }
      />

      <EntryResourceModal onEntryLinkClick={onEntryLinkClick} />
    </div>
  )
}

export function SimplifiedReadView({
  initialLanguage,
  requireLanguageInUrl = false,
  readRouteTail = null,
  partialRouteHint,
}: SimplifiedReadViewProps = {}) {
  const viewerRegistry = useViewerRegistry()
  const resourceTypeRegistry = useResourceTypeRegistry()
  const navigationScope = useNavigationScope()
  const currentNavRef = useCurrentReference()
  const loadedResources = useAppStore((s) => s.loadedResources)

  const {
    packageStore,
    isLoadingResources,
    currentLanguageCode,
    isCollectionFullyCached,
    shouldAutoOpenLanguagePicker,
    isLanguagePickerRequired,
    handleLanguageSelected,
    isBackgroundDownloading,
    downloadStats,
  } = useReadLanguageBootstrap({ initialLanguage, requireLanguageInUrl })

  useReadGatewayBookCatalog(currentLanguageCode)

  useReadUrlSync({
    requireLanguageInUrl,
    readRouteTail,
    partialRouteHint,
    currentLanguageCode,
    isLoadingResources,
  })

  const panel1Resources = useStudioResources('panel-1')
  const panel2Resources = useStudioResources('panel-2')

  const { getResourceLabel } = useReadPanelDnD()

  const {
    panel1Width,
    isResizingPanels,
    resizeContainerRef,
    handlePanelDividerMouseDown,
    handlePanelDividerTouchStart,
  } = useReadPanelResize(50)

  const [showLoadDialog, setShowLoadDialog] = useState(false)

  const { exportProgress, handleDirectDownloadCollection } = useReadCollectionExport(
    currentLanguageCode,
    packageStore.packages
  )

  const plugins = useMemo(() => createStudioPluginRegistry(), [])

  const {
    filteredPanel1Keys,
    filteredPanel2Keys,
    filteredPanel1Resources,
    filteredPanel2Resources,
  } = useFilteredReadPanelKeys({
    panel1ResourceKeys: panel1Resources.resourceKeys ?? [],
    panel2ResourceKeys: panel2Resources.resourceKeys ?? [],
    loadedResources,
    resourceTypeRegistry,
    navigationScope,
    currentBook: currentNavRef.book,
  })

  const openModal = useEntryModalStore((s) => s.openModal)
  const handleOpenEntry = useCallback((resourceId: string, entryId?: string) => {
    const resourceKey = entryId ? `${resourceId}#${entryId}` : resourceId
    openModal(resourceKey)
  }, [openModal])

  const panelConfig = useReadLinkedPanelsConfig({
    filteredPanel1Keys,
    filteredPanel2Keys,
    panel1ResourceKeys: panel1Resources.resourceKeys,
    panel2ResourceKeys: panel2Resources.resourceKeys,
    panel1ActiveIndex: panel1Resources.activeIndex,
    panel2ActiveIndex: panel2Resources.activeIndex,
    viewerRegistry,
    onEntryLinkClick: handleOpenEntry,
  })

  return (
    <TabDnDProvider
      panel1Keys={filteredPanel1Keys}
      panel2Keys={filteredPanel2Keys}
      getLabel={getResourceLabel}
      onReorder={(resourceKey, panelId, paintedIndex) => {
        // Book-filter paint space → store index via neighbor key (not a permanent map module)
        const painted = panelId === 'panel-1' ? filteredPanel1Keys : filteredPanel2Keys
        const resources = panelId === 'panel-1' ? panel1Resources : panel2Resources
        const storeKeys = resources.rawResourceKeys
        const clamped =
          paintedIndex >= painted.length ? painted.length - 1 : paintedIndex
        const targetKey = painted[clamped]
        const storeIndex = targetKey ? storeKeys.indexOf(targetKey) : -1
        if (storeIndex < 0) return
        resources.reorderResource(resourceKey, storeIndex)
      }}
      onMove={(resourceKey, from, to, paintedInsertIndex) => {
        const painted = to === 'panel-1' ? filteredPanel1Keys : filteredPanel2Keys
        const storeKeys =
          to === 'panel-1' ? panel1Resources.rawResourceKeys : panel2Resources.rawResourceKeys
        let storeInsert: number | undefined
        if (paintedInsertIndex !== undefined && paintedInsertIndex < painted.length) {
          const targetKey = painted[paintedInsertIndex]
          const idx = targetKey ? storeKeys.indexOf(targetKey) : -1
          storeInsert = idx >= 0 ? idx : undefined
        }
        moveResourceBetweenPanels(resourceKey, from, to, storeInsert)
      }}
    >
      <div className="h-full flex flex-col overflow-hidden">
        <div className="relative z-30 flex-shrink-0 flex flex-col order-2 md:order-1 overflow-visible">
          <div className="flex items-center bg-white border-gray-100/50 border-t md:border-t-0 md:border-b px-2 py-1.5 overflow-visible">
            <NavigationBar
              isCompact={true}
              onToggleCompact={undefined}
              showLanguagePicker={true}
              onLanguageSelected={handleLanguageSelected}
              autoOpenLanguagePicker={shouldAutoOpenLanguagePicker}
              languagePickerRequired={isLanguagePickerRequired}
              downloadIndicator={
                <DownloadIndicator
                  isDownloading={isBackgroundDownloading}
                  progress={downloadStats.progress ?? undefined}
                />
              }
              onDownloadCollection={
                isCollectionFullyCached ? handleDirectDownloadCollection : undefined
              }
              onLoadCollection={() => setShowLoadDialog(true)}
            />
          </div>
        </div>

        <div className="flex-1 overflow-hidden order-1 md:order-2 min-h-0">
          <LinkedPanelsContainer config={panelConfig} plugins={plugins}>
            <ReadPanelsArea
              panel1Width={panel1Width}
              isResizingPanels={isResizingPanels}
              resizeContainerRef={resizeContainerRef}
              handlePanelDividerMouseDown={handlePanelDividerMouseDown}
              handlePanelDividerTouchStart={handlePanelDividerTouchStart}
              filteredPanel1Keys={filteredPanel1Keys}
              filteredPanel2Keys={filteredPanel2Keys}
              filteredPanel1Resources={filteredPanel1Resources}
              filteredPanel2Resources={filteredPanel2Resources}
              panel1Resources={panel1Resources}
              panel2Resources={panel2Resources}
              isLoadingResources={isLoadingResources}
              onEntryLinkClick={handleOpenEntry}
            />
          </LinkedPanelsContainer>
        </div>

        <CollectionImportDialog
          isOpen={showLoadDialog}
          onClose={() => setShowLoadDialog(false)}
        />

        <ExportProgressToast exportProgress={exportProgress} />
      </div>
    </TabDnDProvider>
  )
}
