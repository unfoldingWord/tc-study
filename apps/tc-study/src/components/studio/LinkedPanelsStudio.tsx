/**
 * LinkedPanelsStudio - Studio screen using linked-panels library
 * Provides resource interactivity and inter-panel communication
 */

import { LinkedPanelsContainer } from '@bt-synergy/resource-panels'
import { useCallback, useState, type DragEvent, type MouseEvent, type RefObject, type TouchEvent } from 'react'
import { EntryResourceModal } from '../common/EntryResourceModal'
import { TabDnDProvider, useTabDnD } from '../../features/dnd/TabDnDContext'
import { useStudioDnD } from '../../features/studio/useStudioDnD'
import { usePanelResize } from '../../features/studio/usePanelResize'
import { useStudioCollectionLoad } from '../../features/studio/useStudioCollectionLoad'
import { useStudioPanelConfig } from '../../features/studio/useStudioPanelConfig'
import { moveResourceBetweenPanels } from '../../features/workspace/resourceMutations'
import { useStudioResources } from '../../hooks'
import { useWorkspaceStore } from '../../lib/stores/workspaceStore'
import { PanelResizeDivider } from '../shared/PanelResizeDivider'
import { ResourceLibrarySidebar, ResourceWizardPanel } from './ResourceLibrarySidebar'
import { StudioLinkedPanel } from './StudioLinkedPanel'
import { StudioNavBarSlot, StudioNavToggle, type StudioNavState } from './StudioNavChrome'

function StudioPanelsArea(props: {
  panel1Width: number
  isResizingPanels: boolean
  resizeContainerRef: RefObject<HTMLDivElement | null>
  handlePanelDividerMouseDown: (e: MouseEvent) => void
  handlePanelDividerTouchStart: (e: TouchEvent) => void
  panel1: { name?: string } | undefined
  panel2: { name?: string } | undefined
  panel1Resources: ReturnType<typeof useStudioResources>
  panel2Resources: ReturnType<typeof useStudioResources>
  openResourceWizard: (panelId: 'panel-1' | 'panel-2') => void
  sharedSidebarProps: {
    dragOverPanel: 'panel-1' | 'panel-2' | null
    selectedResourceKey: string | null
    selectedResourceKeys: string[]
    onPanelDrop: (e: DragEvent, panelId: 'panel-1' | 'panel-2') => void
    onPanelDragOver: (e: DragEvent, panelId: 'panel-1' | 'panel-2') => void
    onPanelDragLeave: () => void
    onPanelClick: (panelId: 'panel-1' | 'panel-2') => void
  }
  getResourceLabel: (id: string) => string
}) {
  const { activeId, activeLabel, hoverPanelId, dropIndex } = useTabDnD()
  const {
    panel1Width,
    isResizingPanels,
    resizeContainerRef,
    handlePanelDividerMouseDown,
    handlePanelDividerTouchStart,
    panel1,
    panel2,
    panel1Resources,
    panel2Resources,
    openResourceWizard,
    sharedSidebarProps,
    getResourceLabel,
  } = props

  const sharedPanelProps = {
    ...sharedSidebarProps,
    hoverPanelId,
    crossPanelDropIndex: dropIndex,
    activeId,
    getResourceLabel: (id: string) =>
      id === activeId && activeLabel ? activeLabel : getResourceLabel(id),
  }

  return (
    <div
      ref={resizeContainerRef}
      className="h-full flex flex-col md:flex-row overflow-hidden panels-resize-container relative"
    >
      <StudioLinkedPanel
        panelId="panel-1"
        colorScheme="blue"
        flexBasis={`${panel1Width}%`}
        panelName={panel1?.name}
        panelResources={panel1Resources}
        otherPanelId="panel-2"
        onAddResource={() => openResourceWizard('panel-1')}
        {...sharedPanelProps}
      />
      <PanelResizeDivider
        isResizing={isResizingPanels}
        onMouseDown={handlePanelDividerMouseDown}
        onTouchStart={handlePanelDividerTouchStart}
      />
      <StudioLinkedPanel
        panelId="panel-2"
        colorScheme="purple"
        flexBasis={`${100 - panel1Width}%`}
        panelName={panel2?.name}
        panelResources={panel2Resources}
        otherPanelId="panel-1"
        onAddResource={() => openResourceWizard('panel-2')}
        {...sharedPanelProps}
      />
    </div>
  )
}

export function LinkedPanelsStudio() {
  const [showWizard, setShowWizard] = useState(false)
  const [navState, setNavState] = useState<StudioNavState>('compact')
  const [targetPanel, setTargetPanel] = useState<'panel-1' | 'panel-2' | null>(null)

  const currentPackage = useWorkspaceStore((s) => s.currentPackage)
  const panel1Resources = useStudioResources('panel-1')
  const panel2Resources = useStudioResources('panel-2')

  const {
    resizeContainerRef,
    panel1Width,
    isResizingPanels,
    handlePanelDividerMouseDown,
    handlePanelDividerTouchStart,
  } = usePanelResize()

  const { activeCollection } = useStudioCollectionLoad()

  const panels = currentPackage?.panels || []
  const panel1 = panels.find((p) => p.id === 'panel-1')
  const panel2 = panels.find((p) => p.id === 'panel-2')
  const panel1ResourceKeys = panel1?.resourceKeys || []
  const panel2ResourceKeys = panel2?.resourceKeys || []

  const handleCloseWizard = useCallback(() => {
    setTargetPanel(null)
    setShowWizard(false)
  }, [])

  const openResourceWizard = useCallback((panelId: 'panel-1' | 'panel-2') => {
    setTargetPanel(panelId)
    setShowWizard(true)
  }, [])

  const {
    dragOverPanel,
    selectedResourceKey,
    setSelectedResourceKey,
    selectedResourceKeys,
    setSelectedResourceKeys,
    getResourceLabel,
    handleSidebarDragStart,
    handleSidebarDragEnd,
    handlePanelDrop,
    handlePanelClick,
    handlePanelDragOver,
    handlePanelDragLeave,
  } = useStudioDnD({
    panel1Resources,
    panel2Resources,
    panel1ResourceKeys,
    panel2ResourceKeys,
  })

  const { panelConfig, plugins, handleOpenEntry, loadedResources } = useStudioPanelConfig({
    panel1ResourceKeys: panel1Resources.resourceKeys,
    panel2ResourceKeys: panel2Resources.resourceKeys,
    panel1ActiveIndex: panel1Resources.activeIndex,
    panel2ActiveIndex: panel2Resources.activeIndex,
  })

  const sharedSidebarProps = {
    dragOverPanel,
    selectedResourceKey,
    selectedResourceKeys,
    onPanelDrop: handlePanelDrop,
    onPanelDragOver: handlePanelDragOver,
    onPanelDragLeave: handlePanelDragLeave,
    onPanelClick: handlePanelClick,
  }

  return (
    <TabDnDProvider
      panel1Keys={panel1Resources.resourceKeys}
      panel2Keys={panel2Resources.resourceKeys}
      getLabel={getResourceLabel}
      onReorder={(resourceKey, panelId, newIndex) => {
        const resources = panelId === 'panel-1' ? panel1Resources : panel2Resources
        resources.reorderResource(resourceKey, newIndex)
      }}
      onMove={(resourceKey, from, to, insertIndex) => {
        moveResourceBetweenPanels(resourceKey, from, to, insertIndex)
      }}
    >
      <div className="h-full flex flex-col overflow-hidden">
        <div className="flex-1 overflow-hidden flex">
          <ResourceLibrarySidebar
            onResourceDragStart={handleSidebarDragStart}
            onResourceDragEnd={handleSidebarDragEnd}
            onResourceSelect={setSelectedResourceKey}
            onSelectedResourcesChange={setSelectedResourceKeys}
            selectedResourceKey={selectedResourceKey}
            selectedResourceKeys={selectedResourceKeys}
            showWizard={showWizard}
            onShowWizardChange={setShowWizard}
            activeCollection={activeCollection ?? undefined}
          />

          <div className="flex-1 overflow-hidden relative flex flex-col">
            <StudioNavToggle
              navState={navState}
              onShow={() => setNavState('compact')}
              onHide={() => setNavState('dismissed')}
            />

            <LinkedPanelsContainer config={panelConfig} plugins={plugins}>
              {showWizard ? (
                <ResourceWizardPanel
                  show={showWizard}
                  onClose={handleCloseWizard}
                  targetPanel={targetPanel}
                />
              ) : (
                <>
                  {selectedResourceKey && (
                    <div className="absolute top-12 left-1/2 -translate-x-1/2 z-10 px-4 py-2 bg-blue-500 text-white rounded-lg shadow-lg flex items-center gap-2 pointer-events-none">
                      <span className="text-sm font-medium">
                        Click a panel to add{' '}
                        {loadedResources[selectedResourceKey]?.title || selectedResourceKey}
                      </span>
                    </div>
                  )}

                  <div className="flex-1 overflow-hidden">
                    <StudioPanelsArea
                      panel1Width={panel1Width}
                      isResizingPanels={isResizingPanels}
                      resizeContainerRef={resizeContainerRef}
                      handlePanelDividerMouseDown={handlePanelDividerMouseDown}
                      handlePanelDividerTouchStart={handlePanelDividerTouchStart}
                      panel1={panel1}
                      panel2={panel2}
                      panel1Resources={panel1Resources}
                      panel2Resources={panel2Resources}
                      openResourceWizard={openResourceWizard}
                      sharedSidebarProps={sharedSidebarProps}
                      getResourceLabel={getResourceLabel}
                    />
                  </div>
                </>
              )}
              <EntryResourceModal onEntryLinkClick={handleOpenEntry} />
            </LinkedPanelsContainer>
          </div>
        </div>

        <StudioNavBarSlot visible={navState === 'compact'} />
      </div>
    </TabDnDProvider>
  )
}
