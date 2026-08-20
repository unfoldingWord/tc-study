import { BookOpen, BookX, Link } from 'lucide-react'
import type { ReactNode } from 'react'
import { formatVerseRefParts, getBookTitleWithFallback } from '../../../../utils/bookNames'
import { parseTWLink } from '../../../../features/helps/quoteTokens'
import { LoadingSpinner } from '../../../../shared/LoadingSpinner'
import { ResourceViewerHeader } from '../../common/ResourceViewerHeader'
import {
  HELPS_LIST_PANEL,
  HELPS_VERSE_HEADER,
  HELPS_VERSE_HEADER_ICON,
} from '../../helpsCardStyles'
import type { ResourceInfo } from '../../../../contexts/types'
import type { TokenFilter } from '../types'
import type { LinkWithAlignments } from '../hooks/useWordsLinksPipeline'
import { WordLinkCard } from './WordLinkCard'

export interface WordsLinksListProps {
  resource: ResourceInfo
  effectiveResource: ResourceInfo
  bookCode?: string
  bookTitleSource: unknown
  languageDirection: 'ltr' | 'rtl'
  /** Inline filter chip for header actions (no extra chrome row). */
  filterScopeBar?: ReactNode
  dependenciesReady: boolean
  loading: boolean
  error: string | null | undefined
  linksByVerse: Record<string, LinkWithAlignments[]>
  selectedLink: string | null
  tokenFilter: TokenFilter | null
  targetSourceId: string | null | undefined
  isObs: boolean
  loadingTitles: Set<string>
  getTWTitle: (link: LinkWithAlignments) => string
  getTWPreview: (link: LinkWithAlignments) => string | null
  isTWPreviewPending: (link: LinkWithAlignments) => boolean
  onTitleClick: (link: LinkWithAlignments) => void
  onQuoteClick: (link: LinkWithAlignments) => void
}

export function WordsLinksList({
  resource,
  effectiveResource,
  bookCode,
  bookTitleSource,
  languageDirection,
  filterScopeBar,
  dependenciesReady,
  loading,
  error,
  linksByVerse,
  selectedLink,
  tokenFilter,
  targetSourceId,
  isObs,
  loadingTitles,
  getTWTitle,
  getTWPreview,
  isTWPreviewPending,
  onTitleClick,
  onQuoteClick,
}: WordsLinksListProps) {
  return (
    <div className={HELPS_LIST_PANEL} dir={languageDirection}>
      <ResourceViewerHeader
        title={resource.title}
        icon={Link}
        direction={languageDirection}
        infoResource={resource}
        actions={filterScopeBar ?? undefined}
      />
      <div className="p-content">
        {!dependenciesReady ? (
          <LoadingSpinner
            centered
            label="Loading dependencies"
            className="text-helps"
            containerClassName="py-8"
          />
        ) : loading ? (
          <LoadingSpinner
            centered
            label="Loading content"
            className="text-helps"
            containerClassName="py-8"
          />
        ) : error ? (
          <div
            className="flex items-center justify-center h-full"
            role="status"
            aria-label={`Word links not available for ${bookCode?.toUpperCase() || 'this book'}`}
            title={`Word links not available for ${bookCode?.toUpperCase() || 'this book'}`}
          >
            <BookX className="w-16 h-16 text-fg-muted" />
          </div>
        ) : Object.keys(linksByVerse).length === 0 ? (
          <div
            className="flex items-center justify-center h-full"
            role="status"
            aria-label={
              tokenFilter
                ? `No word links found for "${tokenFilter.content}"`
                : 'No word links available for this reference'
            }
            title={
              tokenFilter
                ? `No word links found for "${tokenFilter.content}"`
                : 'No word links available for this reference'
            }
          >
            <BookOpen className="w-16 h-16 text-fg-muted" />
          </div>
        ) : (
          <div className="space-y-stack-lg">
            {Object.entries(linksByVerse)
              .sort(([a], [b]) => {
                const [chapterA, verseA] = a.split(':').map(Number)
                const [chapterB, verseB] = b.split(':').map(Number)
                if (chapterA !== chapterB) return chapterA - chapterB
                return verseA - verseB
              })
              .map(([chapterVerse, verseLinks]) => {
                const [chapter, verse] = chapterVerse.split(':')
                const resolved = getBookTitleWithFallback(
                  effectiveResource,
                  bookTitleSource as never,
                  bookCode || 'gen'
                )
                return (
                  <div key={chapterVerse} className="space-y-stack">
                    <div className={HELPS_VERSE_HEADER} dir={languageDirection}>
                      <BookOpen className={HELPS_VERSE_HEADER_ICON} />
                      <h3 className="text-chrome font-semibold text-fg-secondary">
                        {(() => {
                          const { bookPart, numberPart } = formatVerseRefParts(
                            resolved,
                            `${chapter}:${verse}`,
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
                    </div>

                    <div className="grid grid-cols-1 gap-stack">
                      {verseLinks.map((link) => {
                        const twInfo = parseTWLink(link.twLink)
                        const twTitle = getTWTitle(link)
                        const twPreview = getTWPreview(link)
                        const isLoadingTitle = loadingTitles.has(`${twInfo.category}/${twInfo.term}`)
                        const isLoadingPreview = isTWPreviewPending(link)
                        return (
                          <WordLinkCard
                            key={link.id}
                            link={link}
                            isSelected={selectedLink === link.id}
                            twTitle={twTitle}
                            isLoadingTitle={isLoadingTitle}
                            twPreview={twPreview}
                            isLoadingPreview={isLoadingPreview}
                            onTitleClick={onTitleClick}
                            onQuoteClick={onQuoteClick}
                            tokenFilter={tokenFilter}
                            targetResourceId={targetSourceId}
                            languageDirection={languageDirection}
                            obsMode={isObs}
                          />
                        )
                      })}
                    </div>
                  </div>
                )
              })}
          </div>
        )}
      </div>
    </div>
  )
}
