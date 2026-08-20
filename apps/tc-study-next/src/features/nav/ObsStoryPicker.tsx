import type { RefObject } from 'react'
import type { BCVReference } from '../../contexts'
import { ApplyFooter } from './ApplyFooter'

interface ObsStoryPickerProps {
  obsStoryIds: number[]
  selectedObsStory: number | null
  currentRef: BCVReference
  selectedObsStoryRef: RefObject<HTMLButtonElement | null>
  onSelectStory: (storyNum: number) => void
  onApply: () => void
}

export function ObsStoryPicker({
  obsStoryIds,
  selectedObsStory,
  currentRef,
  selectedObsStoryRef,
  onSelectStory,
  onApply,
}: ObsStoryPickerProps) {
  return (
    <>
      <div className="flex-1 overflow-auto p-4">
        <div className="grid grid-cols-5 sm:grid-cols-6 md:grid-cols-8 gap-2">
          {obsStoryIds.map((storyNum) => {
            const isViewerRef = currentRef.book === 'obs' && currentRef.chapter === storyNum
            const isChosen = selectedObsStory === storyNum
            const isHighlighted = isChosen || (selectedObsStory == null && isViewerRef)
            return (
              <button
                key={storyNum}
                ref={isHighlighted ? selectedObsStoryRef : null}
                type="button"
                onClick={() => onSelectStory(storyNum)}
                className={`
                  p-2 rounded-lg border text-sm font-medium transition-all
                  ${
                    isHighlighted
                      ? 'border-accent bg-accent-soft text-accent-fg'
                      : 'border-border hover:border-accent hover:bg-muted text-fg'
                  }
                `}
              >
                {storyNum}
              </button>
            )
          })}
        </div>
      </div>
      <ApplyFooter onApply={onApply} disabled={selectedObsStory == null} />
    </>
  )
}
