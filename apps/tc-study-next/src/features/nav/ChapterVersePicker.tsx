import { ArrowLeft, BookOpen } from 'lucide-react'
import type { RefObject } from 'react'
import type { ResourceInfo } from '../../contexts/types'
import { getBookTitle, getBookTitleStatic } from '../../utils/bookNames'
import { ApplyFooter } from './ApplyFooter'
import {
  isVerseSelected,
  type VerseEntry,
} from './verseSelectionUtils'

interface ChapterVersePickerProps {
  selectedBook: string
  bookTitleSource: ResourceInfo | null | undefined
  chapters: number[]
  versesByChapter: Record<number, VerseEntry[]>
  startVerse: string | null
  endVerse: string | null
  selectionCount: number
  startVerseRef: RefObject<HTMLButtonElement | null>
  onBack: () => void
  onChapterClick: (chapter: number) => void
  onVerseClick: (verseKey: string) => void
  onApply: () => void
}

export function ChapterVersePicker({
  selectedBook,
  bookTitleSource,
  chapters,
  versesByChapter,
  startVerse,
  endVerse,
  selectionCount,
  startVerseRef,
  onBack,
  onChapterClick,
  onVerseClick,
  onApply,
}: ChapterVersePickerProps) {
  const title = (() => {
    const n = getBookTitle(bookTitleSource, selectedBook)
    return n !== selectedBook.toUpperCase() ? n : getBookTitleStatic(selectedBook) || n
  })()

  return (
    <>
      <div className="flex-1 flex flex-col min-h-0">
        <div className="px-6 py-3 flex items-center justify-between border-b border-border bg-muted flex-shrink-0">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onBack}
              className="flex items-center gap-1 text-accent hover:text-accent-fg p-1.5 hover:bg-accent-soft rounded transition-colors"
              title="Change book"
              aria-label="Change book"
            >
              <ArrowLeft className="w-4 h-4" />
            </button>
            <BookOpen className="w-4 h-4 text-fg-secondary" />
          </div>
          <div className="text-sm text-fg-secondary flex items-center gap-2">
            <strong>{title}</strong>
            <span className="px-2 py-0.5 bg-muted text-fg-secondary rounded text-xs font-medium">
              {selectionCount}
            </span>
          </div>
        </div>

        <div className="flex-1 overflow-auto p-6">
          <div className="space-y-6">
            {chapters.map((chapter) => (
              <div key={chapter}>
                <button
                  type="button"
                  onClick={() => onChapterClick(chapter)}
                  className="mb-3 px-3 py-1.5 bg-muted hover:bg-muted rounded-lg font-bold text-fg-secondary text-sm transition-colors"
                  title={`${chapter}`}
                  aria-label={`Chapter ${chapter}`}
                >
                  {chapter}
                </button>

                <div className="flex flex-wrap gap-1">
                  {versesByChapter[chapter]?.map((v) => {
                    const selected = isVerseSelected(v.key, startVerse, endVerse)
                    const isStart = v.key === startVerse
                    const isEnd = v.key === endVerse

                    return (
                      <button
                        key={v.key}
                        ref={isStart ? startVerseRef : null}
                        type="button"
                        onClick={() => onVerseClick(v.key)}
                        className={`
                          w-8 h-8 text-xs font-medium rounded transition-all
                          ${
                            isStart || isEnd
                              ? 'bg-accent text-white ring-2 ring-accent font-bold'
                              : selected
                                ? 'bg-blue-400 text-white'
                                : 'bg-muted text-fg-secondary hover:bg-muted'
                          }
                        `}
                      >
                        {v.verse}
                      </button>
                    )
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
      <ApplyFooter onApply={onApply} disabled={!startVerse} />
    </>
  )
}
