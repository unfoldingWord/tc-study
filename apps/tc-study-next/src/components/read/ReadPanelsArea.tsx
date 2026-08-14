import { useTabDnD } from '../../features/dnd/TabDnDContext'
import {
  collapsedDividerArrowDir,
  dividerCollapsedPanelId,
  panelStayMountedStyle,
} from '../../features/read/readPanelLayout'
import { useReadPanelCollapse } from '../../features/read/useReadPanelCollapse'
import type { ReadLayoutMode } from '../../features/read/readPanelPersistence'
import type { ReadPanelId, ReadPanelMode, ReadPanelModels } from '../../features/read/readPanelModel'
import type { TextModeMismatchView } from '../../features/read/textModeMismatch'
import { isPanelCatalogSpinner } from '../../features/read/panelCatalogLoading'
import { useFilteredReadPanelKeys } from '../../features/read/useFilteredReadPanelKeys'
import { useStudioResources } from '../../hooks'
import { EntryResourceModal } from '../common/EntryResourceModal'
import { PanelResizeDivider } from '../shared/PanelResizeDivider'
import { ReadLinkedPanel } from './ReadLinkedPanel'
import type { MouseEvent, RefObject } from 'react'

interface ReadPanelsAreaProps {
  panels: ReadPanelModels
  layout: ReadLayoutMode
  isNarrow: boolean
  panel1Width: number
  collapsedPanelId: ReadPanelId | null
  isResizingPanels: boolean
  resizeContainerRef: RefObject<HTMLDivElement | null>
  handlePanelDividerMouseDown: (e: MouseEvent) => void
  handlePanelDividerTouchStart: () => void
  expandPanel: (panelId: ReadPanelId) => void
  restoreCollapsed: () => void
  filteredPanel1Keys: string[]
  filteredPanel2Keys: string[]
  filteredPanel1Resources: ReturnType<typeof useFilteredReadPanelKeys>['filteredPanel1Resources']
  filteredPanel2Resources: ReturnType<typeof useFilteredReadPanelKeys>['filteredPanel2Resources']
  panel1Resources: ReturnType<typeof useStudioResources>
  panel2Resources: ReturnType<typeof useStudioResources>
  isLoadingByPanel: Record<ReadPanelId, boolean>
  onEntryLinkClick: (resourceId: string, entryId?: string) => void
  p1Dir: 'ltr' | 'rtl'
  p2Dir: 'ltr' | 'rtl'
  onPanelLanguageSelected: (panelId: ReadPanelId, languageCode: string) => void
  onPanelModeSwitch: (panelId: ReadPanelId, mode: ReadPanelMode) => void
  panel1Mismatch: TextModeMismatchView | null
  panel2Mismatch: TextModeMismatchView | null
  onSwitchTextMode: (scope: 'scripture' | 'obs') => void
}

export function ReadPanelsArea(props: ReadPanelsAreaProps) {
  const { activeId, activeLabel, hoverPanelId, dropIndex } = useTabDnD()
  const dragLabel = activeId && activeLabel ? activeLabel : ''
  const {
    panels,
    layout,
    isNarrow,
    panel1Width,
    collapsedPanelId,
    isResizingPanels,
    resizeContainerRef,
    handlePanelDividerMouseDown,
    handlePanelDividerTouchStart,
    expandPanel,
    restoreCollapsed,
    filteredPanel1Keys,
    filteredPanel2Keys,
    filteredPanel1Resources,
    filteredPanel2Resources,
    panel1Resources,
    panel2Resources,
    isLoadingByPanel,
    onPanelLanguageSelected,
    onPanelModeSwitch,
    p1Dir,
    p2Dir,
    panel1Mismatch,
    panel2Mismatch,
    onSwitchTextMode,
  } = props

  const parkedId = dividerCollapsedPanelId({ layout, collapsedPanelId })
  const collapsedArrow = parkedId
    ? collapsedDividerArrowDir({ collapsedPanelId: parkedId, stacked: isNarrow })
    : null
  const collapseAnim = useReadPanelCollapse({
    collapsedPanelId,
    layout,
    isNarrow,
    isResizingPanels,
    panel1Width,
  })

  return (
    <div
      ref={resizeContainerRef}
      className="h-full min-h-0 overflow-hidden panels-resize-container relative flex flex-col md:flex-row"
      data-panel-1-language={panels['panel-1'].languageCode ?? ''}
      data-panel-2-language={panels['panel-2'].languageCode ?? ''}
      data-panel-1-mode={panels['panel-1'].mode}
      data-panel-2-mode={panels['panel-2'].mode}
    >
      <ReadLinkedPanel
        panelId="panel-1"
        otherPanelId="panel-2"
        colorScheme="blue"
        mountStyle={{
          ...panelStayMountedStyle({
            layout,
            panelId: 'panel-1',
            collapsedPanelId,
            panel1Percent: panel1Width,
          }),
          ...collapseAnim.styleFor('panel-1'),
        }}
        dir={p1Dir}
        mode={panels['panel-1'].mode}
        onModeSwitch={(mode) => onPanelModeSwitch('panel-1', mode)}
        onLanguageSelected={(code) => onPanelLanguageSelected('panel-1', code)}
        filteredKeys={filteredPanel1Keys}
        filteredResources={filteredPanel1Resources}
        panelResources={panel1Resources}
        isLoadingResources={isPanelCatalogSpinner({
          catalogLoading: isLoadingByPanel['panel-1'],
          hasMembership: filteredPanel1Keys.length > 0,
        })}
        catalogLoading={isLoadingByPanel['panel-1']}
        showDropPlaceholder={hoverPanelId === 'panel-1'}
        placeholderLabel={dragLabel}
        placeholderIndex={hoverPanelId === 'panel-1' ? dropIndex ?? undefined : undefined}
        layout={layout}
        collapsedPanelId={collapsedPanelId}
        onReopenCollapsed={expandPanel}
        textModeMismatch={panel1Mismatch}
        onSwitchTextMode={onSwitchTextMode}
      />

      {/* Parked pane is out of flow; this strip stays in the visible flex row. */}
      <PanelResizeDivider
        isResizing={isResizingPanels}
        onMouseDown={handlePanelDividerMouseDown}
        onTouchStart={handlePanelDividerTouchStart}
        collapsedArrow={collapsedArrow}
        onRestoreCollapsed={restoreCollapsed}
      />

      <ReadLinkedPanel
        panelId="panel-2"
        otherPanelId="panel-1"
        colorScheme="purple"
        mountStyle={{
          ...panelStayMountedStyle({
            layout,
            panelId: 'panel-2',
            collapsedPanelId,
            panel1Percent: panel1Width,
          }),
          ...collapseAnim.styleFor('panel-2'),
        }}
        dir={p2Dir}
        mode={panels['panel-2'].mode}
        onModeSwitch={(mode) => onPanelModeSwitch('panel-2', mode)}
        onLanguageSelected={(code) => onPanelLanguageSelected('panel-2', code)}
        filteredKeys={filteredPanel2Keys}
        filteredResources={filteredPanel2Resources}
        panelResources={panel2Resources}
        isLoadingResources={isPanelCatalogSpinner({
          catalogLoading: isLoadingByPanel['panel-2'],
          hasMembership: filteredPanel2Keys.length > 0,
        })}
        catalogLoading={isLoadingByPanel['panel-2']}
        showDropPlaceholder={hoverPanelId === 'panel-2'}
        placeholderLabel={dragLabel}
        placeholderIndex={hoverPanelId === 'panel-2' ? dropIndex ?? undefined : undefined}
        layout={layout}
        collapsedPanelId={collapsedPanelId}
        onReopenCollapsed={expandPanel}
        textModeMismatch={panel2Mismatch}
        onSwitchTextMode={onSwitchTextMode}
      />

      <EntryResourceModal onEntryLinkClick={props.onEntryLinkClick} />
    </div>
  )
}
