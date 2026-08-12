import { BookMarked } from 'lucide-react'
import type { RefObject } from 'react'
import type { BCVReference } from '../../contexts'
import { ApplyFooter } from './ApplyFooter'
import {
  getObsSelectionCount,
  isObsFrameSelected,
  type ObsRangePos,
} from './obsRangeUtils'

interface ObsFrameRangePickerProps {
  obsStoryIds: number[]
  frameCountByStory: Record<string, number>
  loadingStories: Set<number>
  currentRef: BCVReference
  obsRangeStart: ObsRangePos | null
  obsRangeEnd: ObsRangePos | null
  selectedObsStoryRef: RefObject<HTMLButtonElement | null>
  startVerseRef: RefObject<HTMLButtonElement | null>
  onStoryHeaderClick: (storyNum: number, frameCount: number) => void
  onFrameClick: (story: number, frame: number) => void
  onApply: () => void
}

export function ObsFrameRangePicker({
  obsStoryIds,
  frameCountByStory,
  loadingStories,
  currentRef,
  obsRangeStart,
  obsRangeEnd,
  selectedObsStoryRef,
  startVerseRef,
  onStoryHeaderClick,
  onFrameClick,
  onApply,
}: ObsFrameRangePickerProps) {
  const selectionCount = getObsSelectionCount(obsRangeStart, obsRangeEnd, frameCountByStory)

  return (
    <>
      <div className="flex-1 flex flex-col min-h-0">
        <div className="px-6 py-3 flex items-center justify-between border-b border-border bg-muted flex-shrink-0">
          <div className="flex items-center gap-2">
            <BookMarked className="w-4 h-4 text-fg-secondary" />
          </div>
          <div className="flex items-center gap-2 text-sm text-fg-secondary">
            <span className="px-2 py-0.5 bg-muted text-fg-secondary rounded text-xs font-medium">
              {selectionCount}
            </span>
          </div>
        </div>

        <div className="flex-1 overflow-auto p-6">
          <div className="space-y-6">
            {obsStoryIds.map((storyNum) => {
              const frameCount = frameCountByStory[String(storyNum)] ?? 0
              const isLoading = loadingStories.has(storyNum)
              const isCurrentStory = currentRef.book === 'obs' && currentRef.chapter === storyNum

              return (
                <div key={storyNum}>
                  <button
                    type="button"
                    ref={isCurrentStory ? selectedObsStoryRef : null}
                    onClick={() => onStoryHeaderClick(storyNum, frameCount)}
                    className="mb-3 px-3 py-1.5 bg-muted hover:bg-muted rounded-lg font-bold text-fg-secondary text-sm transition-colors"
                    title={`Story ${storyNum}`}
                    aria-label={`Story ${storyNum}`}
                  >
                    {storyNum}
                  </button>

                  {isLoading && (
                    <span className="text-xs text-fg-muted ml-2">Loading…</span>
                  )}

                  {!isLoading && frameCount === 0 && (
                    <span className="text-xs text-fg-muted italic ml-1">
                      tap story number to load
                    </span>
                  )}

                  {frameCount > 0 && (
                    <div className="flex flex-wrap gap-1">
                      {Array.from({ length: frameCount }, (_, i) => i + 1).map((frameNum) => {
                        const isSelected = isObsFrameSelected(
                          storyNum,
                          frameNum,
                          obsRangeStart,
                          obsRangeEnd
                        )
                        const isStartFrame =
                          obsRangeStart?.story === storyNum && obsRangeStart.frame === frameNum
                        const isEndFrame =
                          obsRangeEnd?.story === storyNum && obsRangeEnd.frame === frameNum
                        const isCurFrame = isCurrentStory && currentRef.verse === frameNum

                        return (
                          <button
                            key={frameNum}
                            ref={isStartFrame ? startVerseRef : null}
                            type="button"
                            onClick={() => onFrameClick(storyNum, frameNum)}
                            className={`
                              w-8 h-8 text-xs font-medium rounded transition-all
                              ${
                                isStartFrame || isEndFrame
                                  ? 'bg-accent text-white ring-2 ring-accent font-bold'
                                  : isSelected
                                    ? 'bg-blue-400 text-white'
                                    : isCurFrame
                                      ? 'bg-surface text-accent-fg ring-2 ring-accent font-bold'
                                      : 'bg-muted text-fg-secondary hover:bg-muted'
                              }
                            `}
                          >
                            {frameNum}
                          </button>
                        )
                      })}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      </div>
      <ApplyFooter onApply={onApply} disabled={!obsRangeStart} />
    </>
  )
}
