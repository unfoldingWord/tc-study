import type { TranslationWordsLink } from '@bt-synergy/resource-parsers'
import { BookOpen, Filter } from 'lucide-react'
import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { getBookTitleWithFallback } from '../../../utils/bookNames'
import { parseTWLink } from '../../../features/helps/quoteTokens'
import type { ResourceInfo } from '../../../contexts/types'
import { LoadingSpinner } from '../../../shared/LoadingSpinner'
import { TranslationNoteCard, type NoteWithTokens } from '../TranslationNotesViewer/components/TranslationNoteCard'
import { WordLinkCard } from '../WordsLinksViewer/components'
import type { TokenFilter } from '../WordsLinksViewer/types'
import { HELPS_LIST_PANEL, HELPS_LIST_SHELL } from '../helpsCardStyles'
import {
  explainedHelpsEmptyKind,
  resolveHelpsEmptyView,
  resolveHelpsListEmptyReason,
  shouldShowHelpsFilterEmpty,
} from '../../../features/helps/helpsEmptyCopy'
import type { LanguageListNameFields } from '../../../features/read/languageListDisplayName'
import { HelpsKindFilterMenu } from './HelpsKindFilterMenu'
import { HelpsSourcesMenu } from './HelpsSourcesMenu'
import { CombinedHelpsEmptyState } from './CombinedHelpsEmptyState'
import { helpsFilterIdentity, scrollHelpsToTop } from './scrollHelpsToTop'
import { isHelpsCardSelected, type HelpsCardSelection } from './helpsCardSelection'
import { HelpsCompactStickyBar } from './HelpsCompactStickyBar'
import { HelpsVerseGroupHeader } from './HelpsVerseGroupHeader'
import {
  HELPS_LIST_GROUP_STEP,
  visibleGroupCountForSelection,
  windowMergedGroups,
} from './helpsListWindow'
import {
  helpsAnchorRowId,
  helpsAnchorSelection,
  nextHelpsAnchorPin,
  scrollTopToKeepAnchorInView,
  shouldScrollHelpsListToTop,
} from './helpsFilterAnchorPin'
import { currentHelpsGroupFromBounds } from './helpsStickyCurrentRef'
import type { HelpsKindFilter, ObsQuoteFilter, SupportRefFilter, TwlArticleFilter, VerseFilterState } from './types'
import type { MergedRow } from './useCombinedHelpsMerge'

export interface CombinedHelpsListProps {
  resource: ResourceInfo
  effectiveResource: ResourceInfo
  bookCode?: string
  bookTitleSource: unknown
  languageDirection: 'ltr' | 'rtl'
  kindFilter: HelpsKindFilter
  setKindFilter: (v: HelpsKindFilter) => void
  /** Active filter chip for compact sticky chrome — omit when none. */
  filterScopeBar?: React.ReactNode
  helpsLanguageCode: string
  helpsLanguageName: string | LanguageListNameFields
  passageLabel: string
  noSources: boolean
  /** Unfiltered TN/TWL rows for this chapter (before token/verse filter). */
  chapterHasHelps: boolean
  onClearActiveFilter?: () => void
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
  supportRefFilter?: SupportRefFilter | null
  twlArticleFilter?: TwlArticleFilter | null
  loadingTitles: Set<string>
  twLoadingTitles: Set<string>
  getEntryTitle: (rc: string) => string | null
  getTATitle: (note: NoteWithTokens) => string
  getTWTitle: (link: TranslationWordsLink) => string
  getTWPreview: (link: TranslationWordsLink) => string | null
  isTWPreviewPending: (link: TranslationWordsLink) => boolean
  onSupportReferenceClick: (supportRef: string, title?: string) => void
  onFilterBySupportReference?: (
    supportRef: string,
    title?: string,
    source?: { id: string; reference: string }
  ) => void
  onFilterByTwlArticle?: (link: TranslationWordsLink, title?: string) => void
  onEntryLinkClick?: (resourceKey: string, entryId: string) => void
  onNoteQuoteClick: (note: NoteWithTokens) => void
  onNoteSelect: (note: NoteWithTokens) => void
  onTitleClick: (link: TranslationWordsLink) => void
  onLinkQuoteClick: (link: TranslationWordsLink) => void
}

export function CombinedHelpsList({
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
  chapterHasHelps,
  onClearActiveFilter,
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
  supportRefFilter = null,
  twlArticleFilter = null,
  loadingTitles,
  twLoadingTitles,
  getEntryTitle,
  getTATitle,
  getTWTitle,
  getTWPreview,
  isTWPreviewPending,
  onSupportReferenceClick,
  onFilterBySupportReference,
  onFilterByTwlArticle,
  onEntryLinkClick,
  onNoteQuoteClick,
  onNoteSelect,
  onTitleClick,
  onLinkQuoteClick,
}: CombinedHelpsListProps) {
  const listPanelRef = useRef<HTMLDivElement>(null)
  const sentinelRef = useRef<HTMLDivElement>(null)
  const groupElsRef = useRef(new Map<string, HTMLElement>())
  const pinReleasedRef = useRef(false)
  const prevGroupRefsRef = useRef<string[]>([])
  const pinApplyPassRef = useRef(false)
  const [stickyRef, setStickyRef] = useState<string | null>(null)
  const [pinStickyRef, setPinStickyRef] = useState<string | null>(null)
  const filterAnchor = supportRefFilter?.anchor ?? twlArticleFilter?.anchor ?? null
  const pinSelection = helpsAnchorSelection(filterAnchor) ?? selectedHelpsCard
  const bookWideFilter = Boolean(supportRefFilter || twlArticleFilter)
  const filterIdentity = helpsFilterIdentity({
    tokenFilter,
    verseFilter,
    obsQuoteFilter,
    supportRefFilter,
    twlArticleFilter,
  })
  useLayoutEffect(() => {
    pinReleasedRef.current = false
    prevGroupRefsRef.current = []
    pinApplyPassRef.current = Boolean(bookWideFilter && filterAnchor)
    setPinStickyRef(bookWideFilter && filterAnchor ? filterAnchor.ref : null)
    if (
      shouldScrollHelpsListToTop({
        bookWideFilter,
        hasApplyAnchor: Boolean(filterAnchor),
      })
    ) {
      scrollHelpsToTop(listPanelRef.current)
    }
  }, [filterIdentity])

  const [visibleCount, setVisibleCount] = useState(() =>
    visibleGroupCountForSelection(mergedGroups, pinSelection)
  )
  useEffect(() => {
    setVisibleCount(visibleGroupCountForSelection(mergedGroups, pinSelection))
  }, [filterIdentity])
  useEffect(() => {
    setVisibleCount((n) =>
      Math.max(n, visibleGroupCountForSelection(mergedGroups, pinSelection))
    )
  }, [mergedGroups, pinSelection])

  const windowedGroups = useMemo(() => {
    const needed = visibleGroupCountForSelection(mergedGroups, pinSelection)
    return windowMergedGroups(mergedGroups, Math.max(visibleCount, needed))
  }, [mergedGroups, visibleCount, pinSelection])

  useLayoutEffect(() => {
    const root = listPanelRef.current
    if (!root || !filterAnchor) return
    const nextRefs = mergedGroups.map((group) => group.ref)
    const heights: Record<string, number> = {}
    for (const [ref, el] of groupElsRef.current) {
      heights[ref] = el.offsetHeight
    }
    const next = nextHelpsAnchorPin({
      pinned: !pinReleasedRef.current,
      userScrolled: pinReleasedRef.current,
      scrollTop: root.scrollTop,
      prevGroupRefs: prevGroupRefsRef.current,
      nextGroupRefs: nextRefs,
      groupHeights: heights,
      isApplyPass: pinApplyPassRef.current,
      anchorRef: filterAnchor.ref,
    })
    pinApplyPassRef.current = false
    prevGroupRefsRef.current = nextRefs
    if (!next.pinned) return
    if (next.scrollTop !== root.scrollTop) {
      root.scrollTop = next.scrollTop
    }
    if (next.scrollAnchorIntoView) {
      const row = document.getElementById(helpsAnchorRowId(filterAnchor))
      if (row) {
        const rootRect = root.getBoundingClientRect()
        const rowRect = row.getBoundingClientRect()
        const kept = scrollTopToKeepAnchorInView({
          scrollTop: root.scrollTop,
          viewportHeight: root.clientHeight,
          anchorOffsetTop: rowRect.top - rootRect.top,
          anchorHeight: rowRect.height || 120,
        })
        if (kept !== root.scrollTop) root.scrollTop = kept
      }
    }
  }, [mergedGroups, windowedGroups, filterAnchor])

  useEffect(() => {
    const root = listPanelRef.current
    if (!root || !filterAnchor) return
    const releasePin = () => {
      if (pinReleasedRef.current) return
      pinReleasedRef.current = true
      setPinStickyRef(null)
    }
    // Programmatic scrollTop (prepend compensation) must not release the pin.
    root.addEventListener('wheel', releasePin, { passive: true })
    root.addEventListener('touchmove', releasePin, { passive: true })
    return () => {
      root.removeEventListener('wheel', releasePin)
      root.removeEventListener('touchmove', releasePin)
    }
  }, [filterIdentity, filterAnchor])
  useEffect(() => {
    const el = sentinelRef.current
    if (!el || windowedGroups.length >= mergedGroups.length) return
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setVisibleCount((n) => n + HELPS_LIST_GROUP_STEP)
        }
      },
      { root: listPanelRef.current, rootMargin: '160px' }
    )
    io.observe(el)
    return () => io.disconnect()
  }, [windowedGroups.length, mergedGroups.length])

  const bookTitle = useMemo(
    () =>
      getBookTitleWithFallback(
        effectiveResource,
        bookTitleSource as never,
        bookCode || 'gen'
      ),
    [effectiveResource, bookTitleSource, bookCode]
  )

  useLayoutEffect(() => {
    const root = listPanelRef.current
    if (!root || windowedGroups.length === 0) {
      setStickyRef(null)
      return
    }

    const measure = () => {
      const rootRect = root.getBoundingClientRect()
      const bounds = windowedGroups.flatMap((group) => {
        const el = groupElsRef.current.get(group.ref)
        if (!el) return []
        const rect = el.getBoundingClientRect()
        return [{ ref: group.ref, top: rect.top, bottom: rect.bottom }]
      })
      setStickyRef(currentHelpsGroupFromBounds(bounds, rootRect.top))
    }

    const io = new IntersectionObserver(measure, {
      root,
      threshold: [0, 0.05, 0.25, 0.5, 0.75, 1],
    })
    for (const group of windowedGroups) {
      const el = groupElsRef.current.get(group.ref)
      if (el) io.observe(el)
    }
    root.addEventListener('scroll', measure, { passive: true })
    measure()
    return () => {
      io.disconnect()
      root.removeEventListener('scroll', measure)
    }
  }, [windowedGroups])

  const stickyGroup = useMemo(() => {
    const forced = pinStickyRef
    if (forced) {
      return mergedGroups.find((group) => group.ref === forced) ?? windowedGroups[0] ?? null
    }
    if (!stickyRef) return windowedGroups[0] ?? null
    return mergedGroups.find((group) => group.ref === stickyRef) ?? windowedGroups[0] ?? null
  }, [pinStickyRef, stickyRef, mergedGroups, windowedGroups])

  const emptyReason = resolveHelpsListEmptyReason({
    noSources,
    loading,
    depsOk: true,
    mergedEmpty: mergedGroups.length === 0,
    hasLoadError: !!(tnError && tnKey) || !!(twlError && twlKey),
    hasActiveFilter: !!filterScopeBar,
    chapterHasHelps,
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
    <div className={HELPS_LIST_SHELL} dir={languageDirection}>
      <HelpsCompactStickyBar
        bookTitle={bookTitle}
        chapterVerse={stickyGroup?.ref ?? null}
        fallbackLabel={passageLabel}
        languageDirection={languageDirection}
        filterSlot={filterScopeBar}
        actions={
          <>
            <HelpsSourcesMenu tnKey={tnKey} twlKey={twlKey} />
            {filterScopeBar ? null : (
              <HelpsKindFilterMenu kindFilter={kindFilter} setKindFilter={setKindFilter} />
            )}
          </>
        }
      />
      <div className="relative flex flex-col flex-1 min-h-0">
        <div
          ref={listPanelRef}
          className={HELPS_LIST_PANEL}
          data-testid="helps-list-scrollport"
        >
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
              shouldShowHelpsFilterEmpty(emptyReason) ? (
                <div
                  className="flex flex-col items-center justify-center py-8 text-fg-muted"
                  data-testid="helps-filter-empty"
                >
                  {onClearActiveFilter ? (
                    <button
                      type="button"
                      onClick={onClearActiveFilter}
                      className="p-2 rounded-md hover:bg-accent-soft text-fg-muted hover:text-accent"
                      title="Clear filter"
                      aria-label="Clear filter"
                    >
                      <Filter className="w-10 h-10 opacity-70" aria-hidden />
                    </button>
                  ) : (
                    <Filter className="w-10 h-10 mb-2 opacity-70" aria-hidden />
                  )}
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center py-8 text-fg-muted">
                  <BookOpen className="w-10 h-10 mb-2 opacity-70" />
                </div>
              )
            ) : (
              <div className="space-y-stack-lg">
                {windowedGroups.map((group, groupIndex) => {
                  return (
                    <div
                      key={group.ref}
                      ref={(el) => {
                        if (el) groupElsRef.current.set(group.ref, el)
                        else groupElsRef.current.delete(group.ref)
                      }}
                      className={
                        groupIndex === 0
                          ? 'space-y-stack'
                          : 'space-y-stack pt-stack-lg border-t border-border-subtle/80'
                      }
                      data-helps-group={group.ref}
                    >
                      <HelpsVerseGroupHeader
                        bookTitle={bookTitle}
                        chapterVerse={group.ref}
                        count={group.items.length}
                        languageDirection={languageDirection}
                        sticky={false}
                        testId="helps-verse-group-header"
                      />
                      {group.items.map((item) => {
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
                            <div
                              key={`tn-${note.id}`}
                              id={helpsAnchorRowId({ kind: 'tn', id: note.id, ref: note.reference })}
                              data-helps-row={`tn:${note.id}`}
                              style={{ contentVisibility: 'auto', containIntrinsicSize: 'auto 120px' }}
                            >
                              <TranslationNoteCard
                                note={note as NoteWithTokens}
                                isSelected={isHelpsCardSelected(selectedHelpsCard, 'tn', note.id)}
                                onSupportReferenceClick={onSupportReferenceClick}
                                onFilterBySupportReference={
                                  onFilterBySupportReference
                                    ? (supportRef, title) =>
                                        onFilterBySupportReference(supportRef, title, {
                                          id: note.id,
                                          reference: note.reference,
                                        })
                                    : undefined
                                }
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
                        const isLoadingPreview = isTWPreviewPending(link)
                        return (
                          <div
                            key={`twl-${link.id}`}
                            id={helpsAnchorRowId({ kind: 'twl', id: link.id, ref: link.reference })}
                            data-helps-row={`twl:${link.id}`}
                            style={{ contentVisibility: 'auto', containIntrinsicSize: 'auto 120px' }}
                          >
                            <WordLinkCard
                              link={link}
                              isSelected={isHelpsCardSelected(selectedHelpsCard, 'twl', link.id)}
                              twTitle={twTitle}
                              isLoadingTitle={isLoadingTwTitle}
                              twPreview={twPreview}
                              isLoadingPreview={isLoadingPreview}
                              onTitleClick={onTitleClick}
                              onQuoteClick={onLinkQuoteClick}
                              onFilterByTwlArticle={onFilterByTwlArticle}
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
                {windowedGroups.length < mergedGroups.length ? (
                  <div
                    ref={sentinelRef}
                    className="h-8"
                    data-testid="helps-list-window-sentinel"
                    aria-hidden
                  />
                ) : null}
              </div>
            )}
          </>
        )}
      </div>
        </div>
      </div>
    </div>
  )
}
