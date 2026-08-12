import { BookOpen, BookX, Link } from 'lucide-react'
import { formatVerseRefParts, getBookTitleWithFallback } from '../../../../utils/bookNames'
import { parseTWLink } from '../../../../features/helps/quoteTokens'
import { LoadingSpinner } from '../../../../shared/LoadingSpinner'
import { ResourceViewerHeader } from '../../common/ResourceViewerHeader'
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
  onTitleClick: (link: LinkWithAlignments) => void
  onQuoteClick: (link: LinkWithAlignments) => void
}

export function WordsLinksList({
  resource,
  effectiveResource,
  bookCode,
  bookTitleSource,
  languageDirection,
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
  onTitleClick,
  onQuoteClick,
}: WordsLinksListProps) {
  return (
    <div className="flex-1 overflow-y-auto bg-canvas" dir={languageDirection}>
      <ResourceViewerHeader title={resource.title} icon={Link} direction={languageDirection} />
      <div className="p-4">
        {!dependenciesReady ? (
          <LoadingSpinner
            centered
            label="Loading dependencies"
            className="text-helps"
            containerClassName="py-12"
          />
        ) : loading ? (
          <LoadingSpinner
            centered
            label="Loading content"
            className="text-helps"
            containerClassName="py-12"
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
          <div className="space-y-4">
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
                  <div key={chapterVerse} className="space-y-2">
                    <div
                      className="px-2.5 py-1.5 bg-chip-verse rounded-lg"
                      dir={languageDirection}
                    >
                      <div className="flex items-center gap-2">
                        <BookOpen className="w-3.5 h-3.5 text-chip-verse-fg" />
                        <h3 className="text-xs font-semibold text-fg-secondary">
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
                    </div>

                    <div className="grid grid-cols-1 gap-3">
                      {verseLinks.map((link) => {
                        const twInfo = parseTWLink(link.twLink)
                        const twTitle = getTWTitle(link)
                        const twPreview = getTWPreview(link)
                        const isLoadingTitle = loadingTitles.has(`${twInfo.category}/${twInfo.term}`)
                        return (
                          <WordLinkCard
                            key={link.id}
                            link={link}
                            isSelected={selectedLink === link.id}
                            twTitle={twTitle}
                            isLoadingTitle={isLoadingTitle}
                            twPreview={twPreview}
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
