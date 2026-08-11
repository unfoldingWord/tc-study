import type { TranslatorSection } from '@bt-synergy/usfm-processor'
import { AlertCircle, ArrowLeft, BookOpen, Check } from 'lucide-react'
import type { RefObject } from 'react'
import type { ResourceInfo } from '../../contexts/types'
import { getBookTitle } from '../../utils/bookNames'
import { ApplyFooter } from './ApplyFooter'

interface SectionPickerProps {
  selectedBook: string
  bookTitleSource: ResourceInfo | null | undefined
  sections: TranslatorSection[]
  pickedSectionIdx: number | null
  currentSectionRef: RefObject<HTMLButtonElement | null>
  onBack: () => void
  onPickSection: (idx: number) => void
  onApply: () => void
}

export function SectionPicker({
  selectedBook,
  bookTitleSource,
  sections,
  pickedSectionIdx,
  currentSectionRef,
  onBack,
  onPickSection,
  onApply,
}: SectionPickerProps) {
  return (
    <>
      <div className="flex-1 flex flex-col min-h-0">
        <div className="px-6 py-3 flex items-center justify-between border-b border-gray-200 bg-gray-50 flex-shrink-0">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onBack}
              className="flex items-center gap-1 text-blue-600 hover:text-blue-700 p-1.5 hover:bg-blue-50 rounded transition-colors"
              title="Change book"
              aria-label="Change book"
            >
              <ArrowLeft className="w-4 h-4" />
            </button>
            <BookOpen className="w-4 h-4 text-gray-500" />
          </div>
          <div className="text-sm text-gray-600 flex items-center gap-2">
            <strong>{getBookTitle(bookTitleSource, selectedBook)}</strong>
            {pickedSectionIdx != null && pickedSectionIdx >= 0 && (
              <span className="px-2 py-0.5 bg-gray-100 text-gray-700 rounded text-xs font-medium">
                {pickedSectionIdx + 1} / {sections.length}
              </span>
            )}
          </div>
        </div>

        {sections.length === 0 ? (
          <div className="flex-1 flex items-center justify-center">
            <AlertCircle className="w-12 h-12 text-gray-300" />
          </div>
        ) : (
          <div className="flex-1 overflow-auto p-6">
            <div className="space-y-1.5">
              {sections.map((section, idx) => {
                const startRef = `${section.start.chapter}:${section.start.verse}`
                const endRef =
                  section.end.chapter !== section.start.chapter
                    ? `${section.end.chapter}:${section.end.verse}`
                    : section.end.verse.toString()
                const isPicked = idx === pickedSectionIdx

                return (
                  <button
                    key={idx}
                    ref={isPicked ? currentSectionRef : null}
                    type="button"
                    onClick={() => onPickSection(idx)}
                    className={`
                      w-full text-left p-2.5 border rounded-lg transition-colors flex items-center gap-3
                      ${
                        isPicked
                          ? 'border-blue-500 bg-blue-50'
                          : 'border-gray-200 hover:border-blue-400 hover:bg-blue-50'
                      }
                    `}
                  >
                    <div
                      className={`
                        flex-shrink-0 w-6 h-6 rounded flex items-center justify-center font-bold text-xs
                        ${isPicked ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-700'}
                      `}
                    >
                      {idx + 1}
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-gray-900 truncate">{`Section ${idx + 1}`}</div>
                      <div className="text-sm text-gray-600 mt-0.5 font-medium">
                        {startRef} - {endRef}
                      </div>
                    </div>

                    {isPicked && <Check className="w-5 h-5 text-blue-600 flex-shrink-0" />}
                  </button>
                )
              })}
            </div>
          </div>
        )}
      </div>
      <ApplyFooter
        onApply={onApply}
        disabled={pickedSectionIdx == null || sections.length === 0}
      />
    </>
  )
}
