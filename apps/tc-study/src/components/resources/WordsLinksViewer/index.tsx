/**
 * WordsLinksViewer — thin orchestration shell.
 * Pipeline / signals / list rendering live in sibling hooks & components.
 */

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useCatalogManager, useCurrentReference, useNavigationMode, useResourceTypeRegistry } from '../../../contexts'
import { useAppStore, useBookTitleSource } from '../../../contexts/AppContext'
import { useWizardStore } from '../../../lib/stores/wizardStore'
import { RESOURCE_TYPE_IDS } from '../../../resourceTypes/resourceTypeIds'
import type { ObsQuoteFilter, VerseFilterState } from '../../../features/helps/helpsDisplayFilters'
import { generateSemanticIdsForQuoteTokens, parseTWLink } from '../../../features/helps/quoteTokens'
import { getLanguageDirection } from '../../../utils/languageDirection'
import { checkDependenciesReady } from '../../../utils/resourceDependencies'
import { HelpsFilterBanners } from '../shared/HelpsFilterBanners'
import { WordsLinksList } from './components'
import {
  useScriptureTokens,
  useTWPreviews,
  useTWTitles,
  useWordsLinksContent,
  useWordsLinksPipeline,
  useWordsLinksSignals,
} from './hooks'
import type { TokenFilter, WordsLinksViewerProps } from './types'
import type { LinkWithAlignments } from './hooks/useWordsLinksPipeline'

export function WordsLinksViewer({
  resourceId,
  resourceKey,
  resource,
  wordsLinksContent,
  onEntryLinkClick,
}: WordsLinksViewerProps) {
  const currentRef = useCurrentReference()
  const navigationMode = useNavigationMode()
  const catalogManager = useCatalogManager()
  const resourceTypeRegistry = useResourceTypeRegistry()
  const bookTitleSource = useBookTitleSource()
  const resourceFromStore = useAppStore((s) => (resource?.id ? s.loadedResources[resource.id] : undefined))
  const effectiveResource = resourceFromStore ?? resource

  const twResourceKeyFromStore = useAppStore((s) => {
    const lang = resourceKey.split('/')[1]?.split('_')[0] ?? ''
    const entry = Object.values(s.loadedResources).find(
      (r: { type?: string; language?: string; key?: string; id?: string; resourceKey?: string }) =>
        (r.type === 'words' || r.type === RESOURCE_TYPE_IDS.TRANSLATION_WORDS) && r.language === lang
    )
    return entry ? (entry.key ?? entry.id ?? entry.resourceKey) : null
  })

  const resourceIdFromKey = resourceKey.split('/')[2] ?? ''
  const isObs =
    resourceIdFromKey.startsWith('obs-') ||
    String(effectiveResource?.type ?? resource?.type ?? '').includes('obs')
  const loaderTypeId: string = isObs
    ? RESOURCE_TYPE_IDS.OBS_WORDS_LINKS
    : RESOURCE_TYPE_IDS.TRANSLATION_WORDS_LINKS
  const helpsScope: 'scripture' | 'obs' = isObs ? 'obs' : 'scripture'

  const availableLanguages = useWizardStore((s) => s.availableLanguages)
  const [selectedLink, setSelectedLink] = useState<string | null>(null)
  const [obsQuoteFilter, setObsQuoteFilter] = useState<ObsQuoteFilter | null>(null)
  const [tokenFilter, setTokenFilter] = useState<TokenFilter | null>(null)
  const [verseFilter, setVerseFilter] = useState<VerseFilterState | null>(null)
  const [dependenciesReady, setDependenciesReady] = useState(false)
  const [catalogTrigger, setCatalogTrigger] = useState(0)
  const [catalogMetadata, setCatalogMetadata] = useState<{ languageDirection?: 'ltr' | 'rtl' } | null>(null)

  const languageCode = resource?.language ?? resourceKey.split('/')[1]?.split('_')[0] ?? ''
  const languageFromList = availableLanguages.find((l) => l.code === languageCode)
  const languageDirection = getLanguageDirection(
    catalogMetadata?.languageDirection ?? undefined,
    languageFromList?.direction ?? undefined,
    languageCode
  )

  useEffect(() => {
    let cancelled = false
    catalogManager.getResourceMetadata(resourceKey).then((meta) => {
      if (!cancelled && meta) setCatalogMetadata(meta)
    })
    return () => {
      cancelled = true
    }
  }, [resourceKey, catalogManager])

  const { content, loading, error } = useWordsLinksContent({
    resourceKey,
    wordsLinksContent,
    loaderTypeId,
  })

  const links = useMemo(() => {
    if (!content?.links) return []
    return content.links.map((link) => ({
      ...link,
      articlePath:
        link.articlePath ||
        (() => {
          if (!link.twLink) return ''
          const match = link.twLink.match(/rc:\/\/\*\/tw\/dict\/(.+)$/)
          return match ? match[1] : ''
        })(),
    }))
  }, [content])

  const { twTitles, loadingTitles, fetchTWTitle, getTWTitle } = useTWTitles(resourceKey)
  const { twPreviews, loadingPreviews, fetchTWPreview, getTWPreview } = useTWPreviews(resourceKey)

  const { filteredByReference, underlineTokenGroups, displayLinks, hasMatches, linksByVerse } =
    useWordsLinksPipeline({
      links,
      resourceKey,
      resourceId,
      helpsScope,
      currentRef,
      navigationMode,
      tokenFilter,
      verseFilter,
      obsQuoteFilter,
    })

  const { sendEntryLinkClick, sendTokenClick, broadcastObsHighlight } = useWordsLinksSignals({
    resourceId,
    resourceKey,
    loaderTypeId,
    isObs,
    currentRef,
    navigationMode,
    filteredByReference,
    underlineTokenGroups,
    setTokenFilter,
    setVerseFilter,
    setObsQuoteFilter,
    setSelectedLink,
  })

  const { sourceResourceId: targetSourceId } = useScriptureTokens({ resourceId })

  useEffect(() => {
    const checkCatalog = async () => {
      const keys = await catalogManager.getAllResourceKeys()
      setCatalogTrigger(keys.length)
    }
    checkCatalog()
    const interval = setInterval(checkCatalog, 5000)
    return () => clearInterval(interval)
  }, [catalogManager])

  useEffect(() => {
    const checkDeps = async () => {
      const parts = resourceKey.split('/')
      if (parts.length < 2) {
        setDependenciesReady(true)
        return
      }
      const owner = parts[0]
      const language = parts.length === 3 ? parts[1] : parts[1].split('_')[0]
      const ready = await checkDependenciesReady(
        loaderTypeId,
        language,
        owner,
        resourceTypeRegistry,
        catalogManager,
        false
      )
      setDependenciesReady(ready)
    }
    checkDeps()
  }, [resourceKey, loaderTypeId, resourceTypeRegistry, catalogManager, catalogTrigger])

  useEffect(() => {
    setTokenFilter(null)
    setVerseFilter(null)
    setObsQuoteFilter(null)
    setSelectedLink(null)
  }, [currentRef.book, currentRef.chapter, currentRef.verse])

  useEffect(() => {
    if (!displayLinks.length) return
    displayLinks.forEach((link) => {
      const twInfo = parseTWLink(link.twLink)
      const cacheKey = `${twInfo.category}/${twInfo.term}`
      if (!twTitles.has(cacheKey) && !loadingTitles.has(cacheKey)) fetchTWTitle(link)
    })
  }, [displayLinks, twTitles, loadingTitles, fetchTWTitle])

  useEffect(() => {
    if (!displayLinks.length) return
    displayLinks.forEach((link) => {
      const twInfo = parseTWLink(link.twLink)
      const cacheKey = `${twInfo.category}/${twInfo.term}`
      if (!twPreviews.has(cacheKey) && !loadingPreviews.has(cacheKey)) fetchTWPreview(link)
    })
  }, [displayLinks, twPreviews, loadingPreviews, fetchTWPreview])

  const handleTitleClick = useCallback(
    (link: LinkWithAlignments) => {
      setSelectedLink(link.id)
      const twInfo = parseTWLink(link.twLink)
      const parts = resourceKey.split('/')
      if (parts.length < 2) return
      const language = (parts[1] ?? '').split('_')[0]
      const twResourceKey = twResourceKeyFromStore ?? `${parts[0]}/${language}/tw`
      const entryId = `bible/${twInfo.category}/${twInfo.term}`
      onEntryLinkClick?.(twResourceKey, entryId)
      sendEntryLinkClick({
        lifecycle: 'event',
        link: {
          resourceType: 'words',
          resourceId: twResourceKey,
          entryId,
          text: twInfo.term,
        },
      })
    },
    [resourceKey, twResourceKeyFromStore, onEntryLinkClick, sendEntryLinkClick]
  )

  const handleQuoteClick = useCallback(
    (link: LinkWithAlignments) => {
      setSelectedLink(link.id)
      if (isObs) {
        const quote = link.origWords?.trim()
        if (!quote) return
        const refParts = link.reference.split(':')
        const chapter = parseInt(refParts[0] || '1', 10)
        const verse = parseInt(refParts[1] || '1', 10)
        const occRaw = Number.parseInt(String(link.occurrence ?? '1'), 10)
        broadcastObsHighlight({
          lifecycle: 'event',
          highlight: {
            storyNumber: chapter,
            frameNumber: verse,
            quote,
            occurrence: Number.isFinite(occRaw) ? occRaw : 1,
            rowId: link.id,
            kind: 'twl',
          },
        })
        return
      }
      if (!link.quoteTokens?.length) return
      const refParts = link.reference.split(':')
      const chapter = parseInt(refParts[0] || '1', 10)
      const verse = parseInt(refParts[1] || '1', 10)
      const bookCode = currentRef.book?.toLowerCase() || ''
      const baseOccurrence = parseInt(link.occurrence || '1', 10)
      const semanticIds = generateSemanticIdsForQuoteTokens(
        link.quoteTokens,
        bookCode,
        chapter,
        verse,
        baseOccurrence
      )
      link.quoteTokens.forEach((token, index) => {
        const semanticId = semanticIds[index]
        if (!semanticId) return
        sendTokenClick({
          lifecycle: 'event',
          token: {
            id: String(token.id),
            content: token.text,
            semanticId,
            verseRef: `${bookCode} ${chapter}:${verse}`,
            position: index,
            strong: token.strong,
            lemma: token.lemma,
            morph: token.morph,
            alignedSemanticIds: [semanticId],
          },
        })
      })
    },
    [isObs, currentRef.book, broadcastObsHighlight, sendTokenClick]
  )

  return (
    <div className="h-full flex flex-col">
      <HelpsFilterBanners
        obsQuoteFilter={obsQuoteFilter}
        tokenFilter={tokenFilter}
        verseFilter={verseFilter}
        displayCount={displayLinks.length}
        hasMatches={hasMatches}
        onClearObsQuoteFilter={() => {
          setObsQuoteFilter(null)
          setSelectedLink(null)
        }}
        onClearTokenFilter={() => setTokenFilter(null)}
        onClearVerseFilter={() => setVerseFilter(null)}
      />

      <WordsLinksList
        resource={resource}
        effectiveResource={effectiveResource}
        bookCode={currentRef.book}
        bookTitleSource={bookTitleSource}
        languageDirection={languageDirection}
        dependenciesReady={dependenciesReady}
        loading={loading}
        error={error}
        linksByVerse={linksByVerse}
        selectedLink={selectedLink}
        tokenFilter={tokenFilter}
        targetSourceId={targetSourceId}
        isObs={isObs}
        loadingTitles={loadingTitles}
        getTWTitle={getTWTitle}
        getTWPreview={getTWPreview}
        onTitleClick={handleTitleClick}
        onQuoteClick={handleQuoteClick}
      />
    </div>
  )
}
