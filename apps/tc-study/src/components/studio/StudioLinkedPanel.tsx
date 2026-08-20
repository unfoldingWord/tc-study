import type { ReactNode } from 'react'
import type { ResourceInfo } from '../../contexts/types'
import { LinkedPanel } from '@bt-synergy/resource-panels'
import { useSwipeGesture } from '../../hooks'
import { DroppablePanel } from './DroppablePanel'
import { EmptyPanelState } from './EmptyPanelState'
import { PanelHeader } from './PanelHeader'

type PanelId = 'panel-1' | 'panel-2'
type ColorScheme = 'blue' | 'purple'

export interface StudioPanelResources {
  resources: ResourceInfo[]
  resourceKeys: string[]
  activeIndex: number
  activeResource: ResourceInfo | undefined
  hasNext: boolean
  hasPrevious: boolean
  goToNext: () => void
  goToPrevious: () => void
  goToIndex: (index: number) => void
  removeResource: () => void
  moveResource: (resourceKey: string, targetPanelId: string) => void
}

interface StudioLinkedPanelProps {
  panelId: PanelId
  colorScheme: ColorScheme
  flexBasis: string
  panelName?: string
  panelResources: StudioPanelResources
  otherPanelId: PanelId
  dragOverPanel: PanelId | null
  selectedResourceKey: string | null
  selectedResourceKeys: string[]
  hoverPanelId: string | null
  crossPanelDropIndex: number | null
  activeId: string | null
  getResourceLabel: (id: string) => string
  onPanelDrop: (e: React.DragEvent, panelId: PanelId) => void
  onPanelDragOver: (e: React.DragEvent, panelId: PanelId) => void
  onPanelDragLeave: () => void
  onPanelClick: (panelId: PanelId) => void
  onAddResource: () => void
}

const dragOverRing: Record<ColorScheme, string> = {
  blue: 'bg-blue-50 ring-2 ring-inset ring-blue-400',
  purple: 'bg-purple-50 ring-2 ring-inset ring-purple-400',
}

const selectHoverRing: Record<ColorScheme, string> = {
  blue: 'cursor-pointer hover:bg-blue-50 hover:ring-2 hover:ring-inset hover:ring-blue-300',
  purple: 'cursor-pointer hover:bg-purple-50 hover:ring-2 hover:ring-inset hover:ring-purple-300',
}

type StudioPanelBodyProps = Omit<
  StudioLinkedPanelProps,
  'flexBasis' | 'dragOverPanel' | 'selectedResourceKey' | 'selectedResourceKeys' | 'onPanelDrop' | 'onPanelDragOver' | 'onPanelDragLeave' | 'onPanelClick'
> & {
  current: { index: number; resource?: { component?: ReactNode } | null }
  navigate: {
    next: () => void
    previous: () => void
    toIndex: (index: number) => void
  }
}

function StudioPanelBody({
  panelId,
  colorScheme,
  panelName,
  panelResources,
  otherPanelId,
  hoverPanelId,
  crossPanelDropIndex,
  activeId,
  getResourceLabel,
  onAddResource,
  current,
  navigate,
}: StudioPanelBodyProps) {
  const swipeHandlers = useSwipeGesture({
    onSwipeLeft: () => {
      if (panelResources.hasNext) {
        panelResources.goToNext()
        navigate.next()
      }
    },
    onSwipeRight: () => {
      if (panelResources.hasPrevious) {
        panelResources.goToPrevious()
        navigate.previous()
      }
    },
    minSwipeDistance: 50,
  })
  return (
    <div className="h-full flex flex-col">
      <PanelHeader
        panelId={panelId}
        resources={panelResources.resources}
        currentIndex={current.index}
        currentResource={panelResources.activeResource}
        onIndexChange={(newIndex) => {
          navigate.toIndex(newIndex)
          panelResources.goToIndex(newIndex)
        }}
        onRemove={() => panelResources.removeResource()}
        onMoveToOtherPanel={
          panelResources.activeResource && panelResources.resourceKeys.length > 0
            ? () => {
                const key = panelResources.resourceKeys[panelResources.activeIndex]
                if (key) panelResources.moveResource(key, otherPanelId)
              }
            : undefined
        }
        colorScheme={colorScheme}
        showDropPlaceholder={hoverPanelId === panelId}
        placeholderLabel={activeId ? getResourceLabel(activeId) : ''}
        placeholderIndex={hoverPanelId === panelId ? crossPanelDropIndex : null}
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
        {current.resource?.component ? (
          current.resource.component
        ) : (
          <EmptyPanelState
            panelId={panelId}
            panelName={panelName}
            onAddResource={onAddResource}
          />
        )}
      </div>
    </div>
  )
}

export function StudioLinkedPanel({
  panelId,
  colorScheme,
  flexBasis,
  panelName,
  panelResources,
  otherPanelId,
  dragOverPanel,
  selectedResourceKey,
  selectedResourceKeys,
  hoverPanelId,
  crossPanelDropIndex,
  activeId,
  getResourceLabel,
  onPanelDrop,
  onPanelDragOver,
  onPanelDragLeave,
  onPanelClick,
  onAddResource,
}: StudioLinkedPanelProps) {
  const hasSelection = !!(selectedResourceKey || selectedResourceKeys.length > 0)

  return (
    <DroppablePanel
      id={`${panelId}-droppable`}
      className={`min-h-0 overflow-hidden transition-all ${
        dragOverPanel === panelId
          ? dragOverRing[colorScheme]
          : selectedResourceKey
            ? selectHoverRing[colorScheme]
            : ''
      }`}
      style={{ flexBasis }}
      colorScheme={colorScheme}
    >
      <div
        className="h-full"
        onDragEnter={(e) => e.preventDefault()}
        onDrop={(e) => onPanelDrop(e, panelId)}
        onDragOver={(e) => onPanelDragOver(e, panelId)}
        onDragLeave={onPanelDragLeave}
        onClick={() => hasSelection && onPanelClick(panelId)}
      >
        <LinkedPanel id={panelId}>
          {({ current, navigate }) => (
            <StudioPanelBody
              panelId={panelId}
              colorScheme={colorScheme}
              panelName={panelName}
              panelResources={panelResources}
              otherPanelId={otherPanelId}
              hoverPanelId={hoverPanelId}
              crossPanelDropIndex={crossPanelDropIndex}
              activeId={activeId}
              getResourceLabel={getResourceLabel}
              onAddResource={onAddResource}
              current={current}
              navigate={navigate}
            />
          )}
        </LinkedPanel>
      </div>
    </DroppablePanel>
  )
}
