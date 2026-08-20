/**
 * One Read panel: droppable shell, header tabs, swipe navigation, content/empty.
 */

import { LinkedPanel } from '@bt-synergy/resource-panels'
import type { ReactNode } from 'react'
import type { ResourceInfo } from '../../contexts/types'
import { useSwipeGesture } from '../../hooks'
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
  filteredKeys: string[]
  filteredResources: ResourceInfo[]
  panelResources: StudioPanelApi
  isLoadingResources: boolean
  showDropPlaceholder: boolean
  placeholderLabel: string
  placeholderIndex: number | undefined
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
  current,
  navigate,
}: Omit<ReadLinkedPanelProps, 'flexBasisPercent'> & {
  current: { index: number; resource?: { component?: ReactNode } | null }
  navigate: {
    next: () => void
    previous: () => void
    toIndex: (index: number) => void
  }
}) {
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
      />

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
          isLoadingResources ? (
            <LoadingSpinner
              centered
              label="Loading resources"
              containerClassName="h-full"
            />
          ) : (
            <EmptyPanelState
              panelId={panelId}
              message="Select a language to load resources"
            />
          )
        )}
      </div>
    </div>
  )
}

export function ReadLinkedPanel(props: ReadLinkedPanelProps) {
  const { panelId, colorScheme, flexBasisPercent, ...bodyProps } = props

  return (
    <DroppablePanel
      id={`${panelId}-droppable`}
      className="min-h-0 overflow-hidden"
      style={{ flexBasis: `${flexBasisPercent}%` }}
      colorScheme={colorScheme}
    >
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
    </DroppablePanel>
  )
}
