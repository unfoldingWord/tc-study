/**
 * Simplified Read View — dual-mode panels, mobile-first layout.
 */

import { LinkedPanelsContainer } from '@bt-synergy/resource-panels'
import { useCallback, useEffect, useMemo, useState } from 'react'
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
import { TabDnDProvider } from '../../features/dnd/TabDnDContext'
import { resolvePaneDirection } from '../../features/read/paneDirection'
import { defaultLayoutForViewport } from '../../features/read/readPanelLayout'
import { useReadPanelStore } from '../../features/read/readPanelStore'
import { textModeMismatchFromCache } from '../../features/read/textModeMismatch'
import { useFilteredReadPanelKeys } from '../../features/read/useFilteredReadPanelKeys'
import { useIsNarrowViewport } from '../../features/read/useIsNarrowViewport'
import { useReadCollectionExport } from '../../features/read/useReadCollectionExport'
import { useReadGatewayBookCatalog } from '../../features/read/useReadGatewayBookCatalog'
import { useReadLanguageBootstrap } from '../../features/read/useReadLanguageBootstrap'
import { useReadLinkedPanelsConfig } from '../../features/read/useReadLinkedPanelsConfig'
import { useReadPanelDnD } from '../../features/read/useReadPanelDnD'
import { useReadPanelLayout } from '../../features/read/useReadPanelLayout'
import { useReadUrlSync } from '../../features/read/useReadUrlSync'
import { useSyncOriginalLanguageTabs } from '../../features/read/useSyncOriginalLanguageTabs'
import { createStudioPluginRegistry } from '../../features/studio/createStudioPluginRegistry'
import { moveResourceBetweenPanels } from '../../features/workspace/resourceMutations'
import { useWizardStore } from '../../lib/stores/wizardStore'
import { NavigationBar } from '../studio/NavigationBar'
import { DownloadIndicator } from './DownloadIndicator'
import { ExportProgressToast } from './ExportProgressToast'
import { ReadPanelsArea } from './ReadPanelsArea'
import {
  type PartialRouteHint,
  type ReadRouteTail,
} from '../../utils/readRoutes'

interface SimplifiedReadViewProps {
  initialLanguage?: string
  requireLanguageInUrl?: boolean
  readRouteTail?: ReadRouteTail | null
  partialRouteHint?: PartialRouteHint
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
  const isNarrow = useIsNarrowViewport()
  const panels = useReadPanelStore((s) => s.panels)
  const layout = useReadPanelStore((s) => s.layout)
  const layoutUserChosen = useReadPanelStore((s) => s.layoutUserChosen)
  const setLayout = useReadPanelStore((s) => s.setLayout)

  useEffect(() => {
    if (layoutUserChosen) return
    const next = defaultLayoutForViewport(isNarrow, layout, false)
    if (next !== layout) setLayout(next, false)
  }, [isNarrow, layout, layoutUserChosen, setLayout])

  const {
    packageStore,
    isLoadingResources,
    isLoadingByPanel,
    currentLanguageCode,
    isCollectionFullyCached,
    shouldAutoOpenLanguagePicker,
    isLanguagePickerRequired,
    handleLanguageSelected,
    handlePanelLanguageSelected,
    handlePanelModeSwitch,
    handleSwitchTextMode,
    handleNavigatorScopeCommitted,
    isBackgroundDownloading,
    downloadStats,
  } = useReadLanguageBootstrap({ initialLanguage, requireLanguageInUrl })

  useReadGatewayBookCatalog(currentLanguageCode)
  useSyncOriginalLanguageTabs(currentNavRef.book)

  const availableLanguages = useWizardStore((s) => s.availableLanguages)
  const p1Dir = resolvePaneDirection({
    languageCode: panels['panel-1'].languageCode,
    availableLanguages,
  })
  const p2Dir = resolvePaneDirection({
    languageCode: panels['panel-2'].languageCode,
    availableLanguages,
  })

  const subjects =
    typeof resourceTypeRegistry.getSupportedSubjects === 'function'
      ? resourceTypeRegistry.getSupportedSubjects()
      : []
  const panel1Mismatch = useMemo(() => {
    if (panels['panel-1'].mode !== 'scripture' || !panels['panel-1'].languageCode) return null
    return textModeMismatchFromCache({
      languageCode: panels['panel-1'].languageCode,
      navigationScope,
      supportedSubjects: subjects,
    })
  }, [panels, navigationScope, subjects])
  const panel2Mismatch = useMemo(() => {
    if (panels['panel-2'].mode !== 'scripture' || !panels['panel-2'].languageCode) return null
    return textModeMismatchFromCache({
      languageCode: panels['panel-2'].languageCode,
      navigationScope,
      supportedSubjects: subjects,
    })
  }, [panels, navigationScope, subjects])

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
    collapsedPanelId,
    expandPanel,
    restoreCollapsed,
  } = useReadPanelLayout()

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
    panel1Mode: panels['panel-1'].mode,
    panel2Mode: panels['panel-2'].mode,
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

  const needsBootstrap =
    !panels['panel-1'].languageCode && !panels['panel-2'].languageCode
  const showBootstrapPicker = needsBootstrap

  return (
    <TabDnDProvider
      panel1Keys={filteredPanel1Keys}
      panel2Keys={filteredPanel2Keys}
      getLabel={getResourceLabel}
      onReorder={(resourceKey, panelId, paintedIndex) => {
        const painted = panelId === 'panel-1' ? filteredPanel1Keys : filteredPanel2Keys
        const resources = panelId === 'panel-1' ? panel1Resources : panel2Resources
        const storeKeys = resources.rawResourceKeys
        const clamped = paintedIndex >= painted.length ? painted.length - 1 : paintedIndex
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
          <div className="bg-surface/90 backdrop-blur-md border-border-subtle border-t md:border-t-0 md:border-b px-chrome py-chrome-tight overflow-visible">
            <NavigationBar
              isCompact={true}
              onToggleCompact={undefined}
              showLanguagePicker={showBootstrapPicker}
              onLanguageSelected={handleLanguageSelected}
              autoOpenLanguagePicker={shouldAutoOpenLanguagePicker}
              languagePickerRequired={false}
              onNavigationScopeCommitted={handleNavigatorScopeCommitted}
              downloadIndicator={
                <DownloadIndicator
                  isDownloading={isBackgroundDownloading}
                  progress={downloadStats.progress ?? undefined}
                  error={downloadStats.error}
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
              panels={panels}
              layout={layout}
              isNarrow={isNarrow}
              panel1Width={panel1Width}
              collapsedPanelId={collapsedPanelId}
              isResizingPanels={isResizingPanels}
              resizeContainerRef={resizeContainerRef}
              handlePanelDividerMouseDown={handlePanelDividerMouseDown}
              handlePanelDividerTouchStart={handlePanelDividerTouchStart}
              expandPanel={expandPanel}
              restoreCollapsed={restoreCollapsed}
              filteredPanel1Keys={filteredPanel1Keys}
              filteredPanel2Keys={filteredPanel2Keys}
              filteredPanel1Resources={filteredPanel1Resources}
              filteredPanel2Resources={filteredPanel2Resources}
              panel1Resources={panel1Resources}
              panel2Resources={panel2Resources}
              isLoadingByPanel={isLoadingByPanel}
              onEntryLinkClick={handleOpenEntry}
              p1Dir={p1Dir}
              p2Dir={p2Dir}
              onPanelLanguageSelected={handlePanelLanguageSelected}
              onPanelModeSwitch={handlePanelModeSwitch}
              panel1Mismatch={panel1Mismatch}
              panel2Mismatch={panel2Mismatch}
              onSwitchTextMode={handleSwitchTextMode}
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
