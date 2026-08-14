/**
 * One Read panel: droppable shell, header tabs, swipe navigation, content/empty.
 */

import { LinkedPanel } from '@bt-synergy/resource-panels'
import { useMemo, useState, type CSSProperties, type ReactNode } from 'react'
import { useNavigationScope } from '../../contexts'
import type { ResourceInfo } from '../../contexts/types'
import { HelpsLanguageActionsProvider } from '../../features/helps/HelpsLanguageActionsContext'
import { helpsFlagForNavigationScope } from '../../features/read/helpsLanguagePolicy'
import type { ReadLayoutMode } from '../../features/read/readPanelPersistence'
import type { ReadPanelId, ReadPanelMode } from '../../features/read/readPanelModel'
import type { TextModeMismatchView } from '../../features/read/textModeMismatch'
import { useSwipeGesture } from '../../hooks'
import { DroppablePanel } from '../studio/DroppablePanel'
import { EmptyPanelState } from '../studio/EmptyPanelState'
import { LoadingSpinner } from '../../shared/LoadingSpinner'
import { ReadCrossPanelReopen } from './ReadCrossPanelReopen'
import { ReadPanelHeader } from './ReadPanelHeader'

type StudioPanelApi = {
  resourceKeys: string[]
  hasNext: boolean
  hasPrevious: boolean
  goToNext: () => void
  goToPrevious: () => void
  goToIndex: (index: number) => void
  removeResource: () => void
  moveResource: (key: string, targetPanelId: string) => void
}

interface ReadLinkedPanelProps {
  panelId: ReadPanelId
  otherPanelId: ReadPanelId
  colorScheme: 'blue' | 'purple'
  mountStyle: CSSProperties
  dir: 'ltr' | 'rtl'
  mode: ReadPanelMode
  onModeSwitch: (mode: ReadPanelMode) => void
  onLanguageSelected: (languageCode: string) => void
  filteredKeys: string[]
  filteredResources: ResourceInfo[]
  panelResources: StudioPanelApi
  isLoadingResources: boolean
  /** Raw catalog fetch for this panel (not gated on membership). */
  catalogLoading?: boolean
  showDropPlaceholder: boolean
  placeholderLabel: string
  placeholderIndex: number | undefined
  layout: ReadLayoutMode
  collapsedPanelId: ReadPanelId | null
  onReopenCollapsed: (panelId: ReadPanelId) => void
  textModeMismatch?: TextModeMismatchView | null
  onSwitchTextMode?: (scope: 'scripture' | 'obs') => void
}

function ReadPanelBody({
  panelId,
  otherPanelId: _otherPanelId,
  colorScheme,
  filteredKeys,
  filteredResources,
  panelResources,
  isLoadingResources,
  catalogLoading = false,
  showDropPlaceholder,
  placeholderLabel,
  placeholderIndex,
  mode,
  onModeSwitch,
  onLanguageSelected,
  layout,
  collapsedPanelId,
  onReopenCollapsed,
  textModeMismatch,
  onSwitchTextMode,
  current,
  navigate,
}: Omit<ReadLinkedPanelProps, 'mountStyle' | 'dir'> & {
  current: { index: number; resource?: { component?: ReactNode } | null }
  navigate: {
    next: () => void
    previous: () => void
    toIndex: (index: number) => void
  }
}) {
  const [pickerOpen, setPickerOpen] = useState(false)
  const navigationScope = useNavigationScope()
  const helpsFlag = helpsFlagForNavigationScope(navigationScope)
  const isHelps = mode === 'helps'
  const helpsLanguageActions = useMemo(
    () =>
      isHelps
        ? {
            openHelpsPicker: () => setPickerOpen(true),
            selectHelpsLanguage: onLanguageSelected,
            selectedLanguageCode: null,
            isCatalogLoading: catalogLoading,
          }
        : null,
    [isHelps, onLanguageSelected, catalogLoading]
  )
  const scriptureMismatch = mode === 'scripture' ? textModeMismatch : null
  const mismatchScope = scriptureMismatch?.switchScope
  const mismatchAction =
    scriptureMismatch?.actionLabel && mismatchScope && onSwitchTextMode
      ? () => onSwitchTextMode(mismatchScope)
      : undefined
  const swipeHandlers = useSwipeGesture({
    onSwipeLeft: () => {
      if (current.index < filteredKeys.length - 1) {
        const nextIndex = current.index + 1
        navigate.toIndex(nextIndex)
        const key = filteredKeys[nextIndex]
        const storeIdx = key ? panelResources.resourceKeys.indexOf(key) : -1
        if (storeIdx >= 0) panelResources.goToIndex(storeIdx)
      }
    },
    onSwipeRight: () => {
      if (current.index > 0) {
        const prevIndex = current.index - 1
        navigate.toIndex(prevIndex)
        const key = filteredKeys[prevIndex]
        const storeIdx = key ? panelResources.resourceKeys.indexOf(key) : -1
        if (storeIdx >= 0) panelResources.goToIndex(storeIdx)
      }
    },
    minSwipeDistance: 50,
  })
  const sourceResourceId = filteredKeys[current.index]

  return (
    <HelpsLanguageActionsProvider value={helpsLanguageActions}>
    <div className="h-full flex flex-col">
      {sourceResourceId ? (
        <ReadCrossPanelReopen
          sourceResourceId={sourceResourceId}
          sourcePanelId={panelId}
          layout={layout}
          collapsedPanelId={collapsedPanelId}
          onReopen={onReopenCollapsed}
        />
      ) : null}
      <ReadPanelHeader
        panelId={panelId}
        resources={filteredResources}
        currentIndex={current.index}
        onIndexChange={(newIndex) => {
          navigate.toIndex(newIndex)
          const filteredKey = filteredKeys[newIndex]
          const unfilteredIdx = filteredKey
            ? panelResources.resourceKeys.indexOf(filteredKey)
            : -1
          if (unfilteredIdx >= 0) panelResources.goToIndex(unfilteredIdx)
        }}
        colorScheme={colorScheme}
        mode={mode}
        onModeSwitch={onModeSwitch}
        onLanguageSelected={onLanguageSelected}
        languageListMode={isHelps ? 'helps' : 'text'}
        helpsFlag={isHelps ? helpsFlag : undefined}
        languagePickerOpen={pickerOpen}
        onLanguagePickerOpenChange={setPickerOpen}
        showDropPlaceholder={showDropPlaceholder}
        placeholderLabel={placeholderLabel}
        placeholderIndex={placeholderIndex}
      />

      <div
        ref={swipeHandlers.ref}
        className="flex-1 min-h-0 overflow-auto bg-surface"
        onTouchStart={swipeHandlers.onTouchStart}
        onTouchMove={swipeHandlers.onTouchMove}
        onTouchEnd={swipeHandlers.onTouchEnd}
        onMouseDown={swipeHandlers.onMouseDown}
        onMouseMove={swipeHandlers.onMouseMove}
        onMouseUp={swipeHandlers.onMouseUp}
        onMouseLeave={swipeHandlers.onMouseLeave}
      >
        {current.resource?.component || (
          isLoadingResources ? (
            <LoadingSpinner
              centered
              label="Loading resources"
              containerClassName="h-full"
            />
          ) : (
            <EmptyPanelState
              panelId={panelId}
              message={
                scriptureMismatch?.message ?? 'Select a language to load resources'
              }
              onMessageClick={isHelps ? () => setPickerOpen(true) : undefined}
              actionLabel={scriptureMismatch?.actionLabel ?? undefined}
              actionShortLabel={scriptureMismatch?.actionShortLabel ?? undefined}
              emptyKind={scriptureMismatch?.kind}
              onAction={mismatchAction}
            />
          )
        )}
      </div>
    </div>
    </HelpsLanguageActionsProvider>
  )
}

export function ReadLinkedPanel(props: ReadLinkedPanelProps) {
  const { panelId, colorScheme, mountStyle, dir, ...bodyProps } = props

  return (
    <DroppablePanel
      id={`${panelId}-droppable`}
      className="min-h-0 overflow-hidden"
      style={mountStyle}
      colorScheme={colorScheme}
    >
      <div className="h-full min-h-0 overflow-hidden" dir={dir}>
        <LinkedPanel id={panelId}>
          {({ current, navigate }) => (
            <ReadPanelBody
              {...bodyProps}
              panelId={panelId}
              colorScheme={colorScheme}
              current={current}
              navigate={navigate}
            />
          )}
        </LinkedPanel>
      </div>
    </DroppablePanel>
  )
}
