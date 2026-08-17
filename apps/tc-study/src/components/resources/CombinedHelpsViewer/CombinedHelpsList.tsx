import type { TranslationWordsLink } from '@bt-synergy/resource-parsers'
import { BookOpen, CircleHelp } from 'lucide-react'
import React, { useLayoutEffect, useRef } from 'react'
import { formatVerseRefParts, getBookTitleWithFallback } from '../../../utils/bookNames'
import { parseTWLink } from '../../../features/helps/quoteTokens'
import type { ResourceInfo } from '../../../contexts/types'
import { LoadingSpinner } from '../../../shared/LoadingSpinner'
import { ResourceViewerHeader } from '../common/ResourceViewerHeader'
import { TranslationNoteCard, type NoteWithTokens } from '../TranslationNotesViewer/components/TranslationNoteCard'
import { WordLinkCard } from '../WordsLinksViewer/components'
import type { TokenFilter } from '../WordsLinksViewer/types'
import {
  HELPS_LIST_PANEL,
  HELPS_VERSE_COUNT,
  HELPS_VERSE_HEADER,
  HELPS_VERSE_HEADER_ICON,
} from '../helpsCardStyles'
import {
  explainedHelpsEmptyKind,
  resolveHelpsEmptyView,
  resolveHelpsListEmptyReason,
} from '../../../features/helps/helpsEmptyCopy'
import type { LanguageListNameFields } from '../../../features/read/languageListDisplayName'
import { HelpsKindFilterMenu } from './HelpsKindFilterMenu'
import { HelpsSourcesMenu } from './HelpsSourcesMenu'
import { CombinedHelpsEmptyState } from './CombinedHelpsEmptyState'
import { helpsFilterIdentity, scrollHelpsToTop } from './scrollHelpsToTop'
import { isHelpsCardSelected, type HelpsCardSelection } from './helpsCardSelection'
import type { HelpsKindFilter, ObsQuoteFilter, VerseFilterState } from './types'
import type { MergedRow } from './useCombinedHelpsMerge'

export interface CombinedHelpsListProps {
  resource: ResourceInfo
  effectiveResource: ResourceInfo
  bookCode?: string
  bookTitleSource: unknown
  languageDirection: 'ltr' | 'rtl'
  kindFilter: HelpsKindFilter
  setKindFilter: (v: HelpsKindFilter) => void
  /** Inline filter chip for header actions (no extra chrome row). */
  filterScopeBar?: React.ReactNode
  helpsLanguageCode: string
  helpsLanguageName: string | LanguageListNameFields
  passageLabel: string
  noSources: boolean
  loading: boolean
  tnError?: string | null
  twlError?: string | null
  tnKey: string
  twlKey: string
  resourceKey: string
  mergedGroups: { ref: string; items: MergedRow[] }[]
  selectedHelpsCard: HelpsCardSelection
  targetSourceId: string | null | undefined
  helpsScope: 'scripture' | 'obs'
  tokenFilter: TokenFilter | null
  verseFilter: VerseFilterState | null
  obsQuoteFilter: ObsQuoteFilter | null
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

export function CombinedHelpsList({
  resource,
  effectiveResource,
  bookCode,
  bookTitleSource,
  languageDirection,
  kindFilter,
  setKindFilter,
  filterScopeBar,
  helpsLanguageCode,
  helpsLanguageName,
  passageLabel,
  noSources,
  loading,
  tnError,
  twlError,
  tnKey,
  twlKey,
  resourceKey,
  mergedGroups,
  selectedHelpsCard,
  targetSourceId,
  helpsScope,
  tokenFilter,
  verseFilter,
  obsQuoteFilter,
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
  const listPanelRef = useRef<HTMLDivElement>(null)
  const filterIdentity = helpsFilterIdentity({ tokenFilter, verseFilter, obsQuoteFilter })
  useLayoutEffect(() => {
    scrollHelpsToTop(listPanelRef.current)
  }, [filterIdentity])

  const emptyReason = resolveHelpsListEmptyReason({
    noSources,
    loading,
    depsOk: true,
    mergedEmpty: mergedGroups.length === 0,
    hasLoadError: !!(tnError && tnKey) || !!(twlError && twlKey),
    hasActiveFilter: !!filterScopeBar,
  })
  const emptyKind = explainedHelpsEmptyKind(emptyReason)
  const explainedEmpty = emptyKind
    ? resolveHelpsEmptyView({
        kind: emptyKind,
        languageCode: helpsLanguageCode,
        languageName: helpsLanguageName,
        passageLabel,
      })
    : null

  return (
    <div ref={listPanelRef} className={HELPS_LIST_PANEL} dir={languageDirection}>
      <ResourceViewerHeader
        title={resource.title}
        icon={CircleHelp}
        direction={languageDirection}
        actions={
          // Sources stays visible even when token/verse/OBS filter replaces the kind menu.
          <>
            <HelpsSourcesMenu tnKey={tnKey} twlKey={twlKey} />
            {filterScopeBar ?? (
              <HelpsKindFilterMenu kindFilter={kindFilter} setKindFilter={setKindFilter} />
            )}
          </>
        }
      />
      <div className="p-content max-w-2xl mx-auto w-full">
        {explainedEmpty ? (
          <CombinedHelpsEmptyState view={explainedEmpty} />
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
                      <div className={HELPS_VERSE_HEADER} dir={languageDirection}>
                        <BookOpen className={HELPS_VERSE_HEADER_ICON} />
                        <h3 className="text-chrome font-semibold text-fg-secondary">
                          {(() => {
                            const { bookPart, numberPart } = formatVerseRefParts(
                              resolved,
                              group.ref,
                              languageDirection === 'rtl'
                            )
                            return languageDirection === 'rtl' ? (
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
                        <span className={HELPS_VERSE_COUNT}>{group.items.length}</span>
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
                                isSelected={isHelpsCardSelected(selectedHelpsCard, 'tn', note.id)}
                                onSupportReferenceClick={onSupportReferenceClick}
                                onEntryLinkClick={onEntryLinkClick}
                                onQuoteClick={onNoteQuoteClick}
                                onClick={onNoteSelect}
                                targetResourceId={targetSourceId || undefined}
                                resourceKey={tnKey || resourceKey}
                                languageDirection={languageDirection}
                                taTitle={taTitle}
                                isLoadingTATitle={isLoadingTitle}
                                getEntryTitle={getEntryTitle}
                                obsMode={helpsScope === 'obs'}
                                tokenFilter={tokenFilter}
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
                              isSelected={isHelpsCardSelected(selectedHelpsCard, 'twl', link.id)}
                              twTitle={twTitle}
                              isLoadingTitle={isLoadingTwTitle}
                              twPreview={twPreview}
                              onTitleClick={onTitleClick}
                              onQuoteClick={onLinkQuoteClick}
                              tokenFilter={tokenFilter}
                              targetResourceId={targetSourceId}
                              languageDirection={languageDirection}
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
