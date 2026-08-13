/**
 * One Read panel: droppable shell, header tabs, swipe navigation, content/empty.
 */

import { LinkedPanel } from '@bt-synergy/resource-panels'
import { useMemo, useState, type ReactNode } from 'react'
import { useNavigationScope } from '../../contexts'
import type { ResourceInfo } from '../../contexts/types'
import { HelpsLanguageActionsProvider } from '../../features/helps/HelpsLanguageActionsContext'
import { helpsFlagForNavigationScope } from '../../features/read/helpsLanguagePolicy'
import type { TextModeMismatchView } from '../../features/read/textModeMismatch'
import { useSwipeGesture } from '../../hooks'
import { LanguagePicker } from '../LanguagePicker'
import { DroppablePanel } from '../studio/DroppablePanel'
import { EmptyPanelState } from '../studio/EmptyPanelState'
import { PanelHeader } from '../studio/PanelHeader'
import { LoadingSpinner } from '../../shared/LoadingSpinner'

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
  panelId: 'panel-1' | 'panel-2'
  otherPanelId: 'panel-1' | 'panel-2'
  colorScheme: 'blue' | 'purple'
  flexBasisPercent: number
  /** Per-pane `dir` (text vs helps). Do not set `document.documentElement.dir`. */
  dir: 'ltr' | 'rtl'
  filteredKeys: string[]
  filteredResources: ResourceInfo[]
  panelResources: StudioPanelApi
  isLoadingResources: boolean
  showDropPlaceholder: boolean
  placeholderLabel: string
  placeholderIndex: number | undefined
  /** Panel-2 only: opens helps language picker (does not change `/read/:textLang`). */
  onHelpsLanguageSelected?: (languageCode: string) => void
  /** Full selected helps BCP-47 code for empty copy (`es-419`, not collapsed `es`). */
  helpsLanguageCode?: string | null
  /** Panel-1 only: text language has no content for the current Bible/OBS mode. */
  textModeMismatch?: TextModeMismatchView | null
  onSwitchTextMode?: (scope: 'scripture' | 'obs') => void
}

function ReadPanelBody({
  panelId,
  otherPanelId,
  colorScheme,
  filteredKeys,
  filteredResources,
  panelResources,
  isLoadingResources,
  showDropPlaceholder,
  placeholderLabel,
  placeholderIndex,
  onHelpsLanguageSelected,
  helpsLanguageCode,
  textModeMismatch,
  onSwitchTextMode,
  current,
  navigate,
}: Omit<ReadLinkedPanelProps, 'flexBasisPercent' | 'dir'> & {
  current: { index: number; resource?: { component?: ReactNode } | null }
  navigate: {
    next: () => void
    previous: () => void
    toIndex: (index: number) => void
  }
}) {
  const [helpsPickerOpen, setHelpsPickerOpen] = useState(false)
  const navigationScope = useNavigationScope()
  const helpsFlag = helpsFlagForNavigationScope(navigationScope)
  const showHelpsPicker = panelId === 'panel-2' && !!onHelpsLanguageSelected
  const helpsLanguageActions = useMemo(
    () =>
      showHelpsPicker && onHelpsLanguageSelected
        ? {
            openHelpsPicker: () => setHelpsPickerOpen(true),
            selectHelpsLanguage: onHelpsLanguageSelected,
            selectedLanguageCode: helpsLanguageCode ?? null,
          }
        : null,
    [showHelpsPicker, onHelpsLanguageSelected, helpsLanguageCode]
  )
  const panel1Mismatch = panelId === 'panel-1' ? textModeMismatch : null
  const mismatchScope = panel1Mismatch?.switchScope
  const mismatchAction =
    panel1Mismatch?.actionLabel && mismatchScope && onSwitchTextMode
      ? () => onSwitchTextMode(mismatchScope)
      : undefined
  // Single index owner: LinkedPanel filtered list drives swipe; workspace activeIndex
  // follows by key (do not also advance unfiltered studio indices — that desyncs).
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

  return (
    <HelpsLanguageActionsProvider value={helpsLanguageActions}>
    <div className="h-full flex flex-col">
      <PanelHeader
        panelId={panelId}
        resources={filteredResources}
        currentIndex={current.index}
        currentResource={filteredResources[current.index] ?? null}
        onIndexChange={(newIndex) => {
          navigate.toIndex(newIndex)
          const filteredKey = filteredKeys[newIndex]
          const unfilteredIdx = filteredKey
            ? panelResources.resourceKeys.indexOf(filteredKey)
            : -1
          if (unfilteredIdx >= 0) panelResources.goToIndex(unfilteredIdx)
        }}
        onRemove={() => panelResources.removeResource()}
        onMoveToOtherPanel={
          filteredResources[current.index] && filteredKeys.length > 0
            ? () => {
                const key = filteredKeys[current.index]
                if (key) panelResources.moveResource(key, otherPanelId)
              }
            : undefined
        }
        colorScheme={colorScheme}
        showDropPlaceholder={showDropPlaceholder}
        placeholderLabel={placeholderLabel}
        placeholderIndex={placeholderIndex}
        headerActions={
          showHelpsPicker ? (
            <LanguagePicker
              compact
              listMode="helps"
              helpsFlag={helpsFlag}
              open={helpsPickerOpen}
              onOpenChange={setHelpsPickerOpen}
              onLanguageSelected={onHelpsLanguageSelected}
            />
          ) : undefined
        }
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
                panel1Mismatch?.message ?? 'Select a language to load resources'
              }
              onMessageClick={
                showHelpsPicker ? () => setHelpsPickerOpen(true) : undefined
              }
              actionLabel={panel1Mismatch?.actionLabel ?? undefined}
              actionShortLabel={panel1Mismatch?.actionShortLabel ?? undefined}
              emptyKind={panel1Mismatch?.kind}
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
  const { panelId, colorScheme, flexBasisPercent, dir, ...bodyProps } = props

  return (
    <DroppablePanel
      id={`${panelId}-droppable`}
      className="min-h-0 overflow-hidden"
      style={{ flexBasis: `${flexBasisPercent}%` }}
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
