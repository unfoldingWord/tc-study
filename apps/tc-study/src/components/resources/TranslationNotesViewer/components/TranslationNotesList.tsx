import { BookOpen, FileText } from 'lucide-react'
import { formatVerseRefParts, getBookTitleWithFallback } from '../../../../utils/bookNames'
import { LoadingSpinner } from '../../../../shared/LoadingSpinner'
import { ResourceViewerHeader } from '../../common/ResourceViewerHeader'
import { TranslationNoteCard, type NoteWithTokens } from './TranslationNoteCard'
import type { ResourceInfo } from '../../../../contexts/types'

export interface TranslationNotesListProps {
  resource: ResourceInfo
  effectiveResource: ResourceInfo
  bookCode?: string
  bookTitleSource: unknown
  targetLanguageDirection: 'ltr' | 'rtl'
  loading: boolean
  error: string | null | undefined
  notesByVerse: Record<string, NoteWithTokens[]>
  selectedNoteId: string | null
  targetSourceId: string | null | undefined
  resourceKey: string
  isObs: boolean
  loadingTitles: Set<string>
  getTATitle: (note: NoteWithTokens) => string
  getEntryTitle: (rcLink: string) => string | null
  onSupportReferenceClick: (supportRef: string) => void
  onEntryLinkClick?: (resourceKey: string, entryId: string) => void
  onQuoteClick: (note: NoteWithTokens) => void
  onNoteSelect: (note: { id: string }) => void
}

export function TranslationNotesList({
  resource,
  effectiveResource,
  bookCode,
  bookTitleSource,
  targetLanguageDirection,
  loading,
  error,
  notesByVerse,
  selectedNoteId,
  targetSourceId,
  resourceKey,
  isObs,
  loadingTitles,
  getTATitle,
  getEntryTitle,
  onSupportReferenceClick,
  onEntryLinkClick,
  onQuoteClick,
  onNoteSelect,
}: TranslationNotesListProps) {
  return (
    <div className="flex-1 overflow-y-auto bg-canvas" dir={targetLanguageDirection}>
      <ResourceViewerHeader title={resource.title} icon={FileText} direction={targetLanguageDirection} />
      <div className="p-4">
        {loading ? (
          <LoadingSpinner
            centered
            label="Loading content"
            className="text-amber-500"
            containerClassName="py-12"
          />
        ) : error ? (
          <div className="text-center py-12 text-gray-500">
            <BookOpen className="w-12 h-12 mx-auto mb-4 text-gray-300" />
            <p className="text-sm">{error}</p>
          </div>
        ) : Object.keys(notesByVerse).length === 0 ? (
          <div className="flex items-center justify-center h-full" title="No notes for this passage">
            <BookOpen className="w-16 h-16 text-gray-300 opacity-60" />
          </div>
        ) : (
          <div className="space-y-4">
            {Object.entries(notesByVerse).map(([verse, verseNotes]) => {
              const resolved = getBookTitleWithFallback(
                effectiveResource,
                bookTitleSource as never,
                bookCode ?? ''
              )
              return (
                <div key={verse} className="space-y-3">
                  <div
                    className="flex items-center gap-2 px-2.5 py-1.5 bg-gradient-to-r from-gray-50 to-gray-100/50 rounded-lg"
                    dir={targetLanguageDirection}
                  >
                    <BookOpen className="w-3.5 h-3.5 text-amber-500" />
                    <h3 className="text-xs font-semibold text-gray-700">
                      {(() => {
                        const { bookPart, numberPart } = formatVerseRefParts(
                          resolved,
                          verse,
                          targetLanguageDirection === 'rtl'
                        )
                        return targetLanguageDirection === 'rtl' ? (
                          <span className="inline-flex flex-row-reverse gap-1" dir="rtl">
                            <span>{numberPart}</span>
                            <span>{bookPart}</span>
                          </span>
                        ) : (
                          <span className="inline-flex gap-1" dir="ltr">
                            <span>{bookPart}</span>
                            <span>{numberPart}</span>
                          </span>
                        )
                      })()}
                    </h3>
                    <span className="ml-auto px-2 py-0.5 bg-amber-100/50 text-amber-700 rounded-full text-[10px] font-medium">
                      {verseNotes.length}
                    </span>
                  </div>

                  {verseNotes.map((note, idx) => {
                    const entryTitle = note.supportReference?.startsWith('rc://')
                      ? getEntryTitle(note.supportReference)
                      : null
                    const taTitle = entryTitle ?? getTATitle(note)
                    const isLoadingTitle = note.supportReference
                      ? loadingTitles.has(note.supportReference.match(/rc:\/\/\*\/ta\/man\/(.+)/)?.[1] || '')
                      : false

                    return (
                      <TranslationNoteCard
                        key={note.id || `${verse}-${idx}`}
                        note={note}
                        isSelected={selectedNoteId === note.id}
                        onSupportReferenceClick={onSupportReferenceClick}
                        onEntryLinkClick={onEntryLinkClick}
                        onQuoteClick={onQuoteClick}
                        onClick={onNoteSelect}
                        targetResourceId={targetSourceId || undefined}
                        resourceKey={resourceKey}
                        languageDirection={targetLanguageDirection}
                        taTitle={taTitle ?? undefined}
                        isLoadingTATitle={isLoadingTitle}
                        getEntryTitle={getEntryTitle}
                        obsMode={isObs}
                      />
                    )
                  })}
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
