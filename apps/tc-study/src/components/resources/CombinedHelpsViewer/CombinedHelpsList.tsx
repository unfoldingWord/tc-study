import type { TranslationWordsLink } from '@bt-synergy/resource-parsers'
import { BookMarked, BookOpen, FileText, LayoutList, Layers, NotebookPen } from 'lucide-react'
import React from 'react'
import { formatVerseRefParts, getBookTitleWithFallback } from '../../../utils/bookNames'
import { parseTWLink } from '../../../features/helps/quoteTokens'
import type { ResourceInfo } from '../../../contexts/types'
import { LoadingSpinner } from '../../../shared/LoadingSpinner'
import { ResourceViewerHeader } from '../common/ResourceViewerHeader'
import { TranslationNoteCard, type NoteWithTokens } from '../TranslationNotesViewer/components/TranslationNoteCard'
import { WordLinkCard } from '../WordsLinksViewer/components'
import type { TokenFilter } from '../WordsLinksViewer/types'
import type { HelpsKindFilter } from './types'
import type { MergedRow } from './useCombinedHelpsMerge'

export interface CombinedHelpsListProps {
  resource: ResourceInfo
  effectiveResource: ResourceInfo
  bookCode?: string
  bookTitleSource: unknown
  targetLanguageDirection: 'ltr' | 'rtl'
  kindFilter: HelpsKindFilter
  setKindFilter: (v: HelpsKindFilter) => void
  /** When set, replaces ResourceViewerHeader so filter adds no extra vertical chrome. */
  filterScopeBar?: React.ReactNode
  noSources: boolean
  depsOk: boolean
  loading: boolean
  tnError?: string | null
  twlError?: string | null
  tnKey: string
  twlKey: string
  resourceKey: string
  mergedGroups: { ref: string; items: MergedRow[] }[]
  selectedNoteId: string | null
  selectedLinkId: string | null
  targetSourceId: string | null | undefined
  helpsScope: 'scripture' | 'obs'
  tokenFilter: TokenFilter | null
  loadingTitles: Set<string>
  twLoadingTitles: Set<string>
  getEntryTitle: (rc: string) => string | null
  getTATitle: (note: NoteWithTokens) => string
  getTWTitle: (link: TranslationWordsLink) => string
  getTWPreview: (link: TranslationWordsLink) => string | null
  onSupportReferenceClick: (supportRef: string) => void
  onEntryLinkClick?: (resourceKey: string, entryId: string) => void
  onNoteQuoteClick: (note: NoteWithTokens) => void
  onNoteSelect: (note: { id: string }) => void
  onTitleClick: (link: TranslationWordsLink) => void
  onLinkQuoteClick: (link: TranslationWordsLink) => void
}

function FilterButton({
  active,
  icon,
  label,
  onClick,
}: {
  active: boolean
  icon: React.ReactNode
  label: string
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={label}
      aria-label={label}
      className={`rounded-full p-chrome-tight transition-colors ${
        active
          ? 'bg-helps text-white'
          : 'border border-helps/30 text-helps-fg bg-surface hover:bg-helps-soft'
      }`}
    >
      {icon}
    </button>
  )
}

export function CombinedHelpsList({
  resource,
  effectiveResource,
  bookCode,
  bookTitleSource,
  targetLanguageDirection,
  kindFilter,
  setKindFilter,
  filterScopeBar,
  noSources,
  depsOk,
  loading,
  tnError,
  twlError,
  tnKey,
  twlKey,
  resourceKey,
  mergedGroups,
  selectedNoteId,
  selectedLinkId,
  targetSourceId,
  helpsScope,
  tokenFilter,
  loadingTitles,
  twLoadingTitles,
  getEntryTitle,
  getTATitle,
  getTWTitle,
  getTWPreview,
  onSupportReferenceClick,
  onEntryLinkClick,
  onNoteQuoteClick,
  onNoteSelect,
  onTitleClick,
  onLinkQuoteClick,
}: CombinedHelpsListProps) {
  return (
    <div className="flex-1 overflow-y-auto bg-canvas" dir={targetLanguageDirection}>
      {filterScopeBar ?? (
        <ResourceViewerHeader
          title={resource.title}
          icon={Layers}
          direction={targetLanguageDirection}
          actions={
            <div className="flex items-center gap-1">
              <FilterButton
                active={kindFilter === 'all'}
                icon={<LayoutList className="w-3.5 h-3.5" />}
                label="All"
                onClick={() => setKindFilter('all')}
              />
              <FilterButton
                active={kindFilter === 'notes'}
                icon={<NotebookPen className="w-3.5 h-3.5" />}
                label="Notes"
                onClick={() => setKindFilter('notes')}
              />
              <FilterButton
                active={kindFilter === 'twl'}
                icon={<BookMarked className="w-3.5 h-3.5" />}
                label="Word Links"
                onClick={() => setKindFilter('twl')}
              />
            </div>
          }
        />
      )}
      <div className="p-content">
        {noSources ? (
          <div className="text-center py-8 text-fg-muted text-sm">
            <FileText className="w-8 h-8 mx-auto mb-2 text-fg-muted opacity-50" />
            <p>No Translation Notes or Word Links found for this language.</p>
          </div>
        ) : !depsOk ? (
          <LoadingSpinner
            centered
            label="Loading dependencies"
            className="text-helps"
            containerClassName="py-8"
          />
        ) : loading ? (
          <LoadingSpinner
            centered
            label="Loading helps"
            className="text-helps"
            containerClassName="py-8"
          />
        ) : (
          <>
            {tnError && tnKey ? <p className="text-chrome text-danger mb-stack">{tnError}</p> : null}
            {twlError && twlKey ? <p className="text-chrome text-danger mb-stack">{twlError}</p> : null}
            {mergedGroups.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-8 text-fg-muted">
                <BookOpen className="w-10 h-10 mb-2 opacity-70" />
                <p className="text-sm">No entries for this passage.</p>
              </div>
            ) : (
              <div className="space-y-stack-lg">
                {mergedGroups.map((group) => {
                  const resolved = getBookTitleWithFallback(
                    effectiveResource,
                    bookTitleSource as never,
                    bookCode || 'gen'
                  )
                  return (
                    <div key={group.ref} className="space-y-stack">
                      <div
                        className="flex items-center gap-chrome-tight px-chrome py-chrome-tight bg-chip-verse rounded-md"
                        dir={targetLanguageDirection}
                      >
                        <BookOpen className="w-3.5 h-3.5 text-chip-verse-fg" />
                        <h3 className="text-chrome font-semibold text-fg-secondary">
                          {(() => {
                            const { bookPart, numberPart } = formatVerseRefParts(
                              resolved,
                              group.ref,
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
                        <span className="ml-auto px-1.5 py-0.5 bg-helps-soft text-chip-verse-fg rounded-full text-micro font-medium">
                          {group.items.length}
                        </span>
                      </div>

                      {group.items.map((item, idx) => {
                        if (item.kind === 'tn') {
                          const note = item.note
                          const entryTitle = note.supportReference?.startsWith('rc://')
                            ? getEntryTitle(note.supportReference)
                            : null
                          const taTitle = entryTitle ?? getTATitle(note as NoteWithTokens)
                          const isLoadingTitle = note.supportReference
                            ? loadingTitles.has(
                                note.supportReference.match(/rc:\/\/\*\/ta\/man\/(.+)/)?.[1] || ''
                              )
                            : false
                          return (
                            <div key={`tn-${note.id}-${idx}`}>
                              <TranslationNoteCard
                                note={note as NoteWithTokens}
                                isSelected={selectedNoteId === note.id}
                                onSupportReferenceClick={onSupportReferenceClick}
                                onEntryLinkClick={onEntryLinkClick}
                                onQuoteClick={onNoteQuoteClick}
                                onClick={onNoteSelect}
                                targetResourceId={targetSourceId || undefined}
                                resourceKey={tnKey || resourceKey}
                                languageDirection={targetLanguageDirection}
                                taTitle={taTitle}
                                isLoadingTATitle={isLoadingTitle}
                                getEntryTitle={getEntryTitle}
                                obsMode={helpsScope === 'obs'}
                              />
                            </div>
                          )
                        }
                        const link = item.link
                        const twInfo = parseTWLink(link.twLink)
                        const twTitle = getTWTitle(link)
                        const twPreview = getTWPreview(link)
                        const isLoadingTwTitle = twLoadingTitles.has(`${twInfo.category}/${twInfo.term}`)
                        return (
                          <div key={`twl-${link.id}-${idx}`}>
                            <WordLinkCard
                              link={link}
                              isSelected={selectedLinkId === link.id}
                              twTitle={twTitle}
                              isLoadingTitle={isLoadingTwTitle}
                              twPreview={twPreview}
                              onTitleClick={onTitleClick}
                              onQuoteClick={onLinkQuoteClick}
                              tokenFilter={tokenFilter}
                              targetResourceId={targetSourceId}
                              languageDirection={targetLanguageDirection}
                              obsMode={helpsScope === 'obs'}
                            />
                          </div>
                        )
                      })}
                    </div>
                  )
                })}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
