import { useEffect, useRef } from 'react'
import { useLocation } from 'react-router-dom'
import {
  useCurrentPassageSet,
  useCurrentReference,
  useCurrentSectionIndex,
  useCurrentSections,
  useNavigation,
  useNavigationMode,
  useNavigationScope,
} from '../../contexts'
import {
  findPassageSetByNavSlug,
  navigationModeFromReadNav,
  navigationScopeFromResourceType,
  parseBibleNavRef,
  parseBibleSectionNavRef,
  parseObsFrameNavRef,
  parseObsStoryNavRef,
  readNavTypeFromNavigationMode,
  resolveDefaultStartForBook,
  type PartialRouteHint,
  type ReadRouteTail,
  type ResolvedBookStart,
} from '../../utils/readRoutes'
import { readUrlWriteBackAction, shouldApplyDeepLinkTail } from './readBootstrapPolicy'
import { readUrlLangsFromPanels } from './readUrlGrammar'
import { useReadPanelStore } from './readPanelStore'
import {
  getReadLocationPathname,
  getReadNavigationSource,
  replaceReadUrlFromUi,
  subscribeReadPopstate,
} from './replaceReadUrlFromUi'

export interface UseReadUrlSyncOptions {
  readRouteTail?: ReadRouteTail | null
  partialRouteHint?: PartialRouteHint
  currentLanguageCode: string | null
  isLoadingResources: boolean
}

/**
 * Deep-link apply + canonical URL write-back for `/read/...` routes.
 */
export function useReadUrlSync({
  readRouteTail = null,
  partialRouteHint,
  currentLanguageCode,
  isLoadingResources,
}: UseReadUrlSyncOptions) {
  const location = useLocation()
  const panel1Lang = useReadPanelStore((s) => s.panels['panel-1'].languageCode)
  const panel2Lang = useReadPanelStore((s) => s.panels['panel-2'].languageCode)
  const panel1Mode = useReadPanelStore((s) => s.panels['panel-1'].mode)
  const panel2Mode = useReadPanelStore((s) => s.panels['panel-2'].mode)
  const navigation = useNavigation()
  const navigationScope = useNavigationScope()
  const navigationMode = useNavigationMode()
  const currentNavRef = useCurrentReference()
  const currentPassageSet = useCurrentPassageSet()
  const currentSectionIndex = useCurrentSectionIndex()
  const currentSections = useCurrentSections()

  const suppressUrlSyncRef = useRef(false)
  const readRouteAppliedSigRef = useRef<string | null>(null)
  const pendingSectionRef = useRef<{ book: string; section1Based: number } | null>(null)
  const partialHintAppliedRef = useRef<string | null>(null)

  useEffect(() => {
    if (!readRouteTail) readRouteAppliedSigRef.current = null
  }, [readRouteTail])

  useEffect(() => {
    return subscribeReadPopstate(() => {
      readRouteAppliedSigRef.current = null
      partialHintAppliedRef.current = null
    })
  }, [])

  // Apply `/read/{lang}/bible|obs[/{navType}]` (no navRef) — switch scope and optionally mode.
  // The URL-sync effect will then rewrite the URL to the full canonical form.
  useEffect(() => {
    if (!partialRouteHint) return
    if (!currentLanguageCode || isLoadingResources) return
    const sig = `${partialRouteHint.resourceType}|${partialRouteHint.navType ?? ''}`
    if (partialHintAppliedRef.current === sig) return
    partialHintAppliedRef.current = sig
    navigation.setNavigationScope(navigationScopeFromResourceType(partialRouteHint.resourceType))
    if (partialRouteHint.navType) {
      const mode = navigationModeFromReadNav(partialRouteHint.resourceType, partialRouteHint.navType)
      if (mode) navigation.setNavigationMode(mode)
    }
  }, [partialRouteHint, currentLanguageCode, isLoadingResources, navigation])

  // Apply `/read/:lang/bible|obs[/:navType]/:navRef` once resources are ready
  useEffect(() => {
    if (!readRouteTail) {
      pendingSectionRef.current = null
      return
    }
    const sig = `${readRouteTail.resourceType}|${readRouteTail.navType ?? ''}|${readRouteTail.navRef}`
    if (
      !shouldApplyDeepLinkTail({
        hasReadRouteTail: true,
        currentLanguageCode,
        isLoadingResources,
        alreadyApplied: readRouteAppliedSigRef.current === sig,
      })
    ) {
      return
    }

    suppressUrlSyncRef.current = true
    let cancelled = false

    const applyBookStart = (start: ResolvedBookStart) => {
      if (start.kind === 'section') {
        pendingSectionRef.current = { book: start.book, section1Based: start.section1Based }
        navigation.navigateToReference({ book: start.book, chapter: 1, verse: 1 })
        return
      }
      navigation.navigateToReference(start.ref)
    }

    const run = async () => {
      try {
        const rt = readRouteTail.resourceType
        const explicitNavType = readRouteTail.navType?.trim() || ''
        let mode = explicitNavType ? navigationModeFromReadNav(rt, explicitNavType) : null
        let navType = explicitNavType

        // Book-only `/bible/{book}` — inherit current navigation mode
        if (!mode && rt === 'bible' && !explicitNavType) {
          mode = navigationMode
          navType = readNavTypeFromNavigationMode('scripture', mode) ?? 'ref'
        }

        if (!mode) {
          console.warn('[read route] Unknown nav type for resource', readRouteTail)
          readRouteAppliedSigRef.current = sig
          return
        }

        navigation.setNavigationScope(navigationScopeFromResourceType(rt))
        navigation.setNavigationMode(mode)

        if (rt === 'obs') {
          const nt = navType.toLowerCase()
          if (nt === 'story') {
            const ref = parseObsStoryNavRef(readRouteTail.navRef)
            if (ref) navigation.navigateToReference(ref)
          } else if (nt === 'ref') {
            // Full frame/range, or story-only → first frame of that story
            const ref =
              parseObsFrameNavRef(readRouteTail.navRef) ??
              (() => {
                const story = parseObsStoryNavRef(readRouteTail.navRef)
                return story ? { book: 'obs' as const, chapter: story.chapter, verse: 1 } : null
              })()
            if (ref) navigation.navigateToReference(ref)
            else console.warn('[read route] Invalid OBS frame nav ref', readRouteTail.navRef)
          }
        } else {
          const nt = navType.toLowerCase()
          if (nt === 'passage') {
            const bookStart = resolveDefaultStartForBook(readRouteTail.navRef, nt)
            if (bookStart) {
              // Book code as passage slug → open book at 1:1 (passage sets use non-book slugs)
              applyBookStart(bookStart)
            } else {
              const set = await findPassageSetByNavSlug(readRouteTail.navRef)
              if (cancelled) return
              if (set) navigation.loadPassageSet(set)
              else console.warn('[read route] Passage set not found:', readRouteTail.navRef)
            }
          } else if (nt === 'section') {
            const parsed =
              parseBibleSectionNavRef(readRouteTail.navRef) ??
              (() => {
                const start = resolveDefaultStartForBook(readRouteTail.navRef, 'section')
                return start?.kind === 'section'
                  ? { book: start.book, section1Based: start.section1Based }
                  : null
              })()
            if (parsed) {
              pendingSectionRef.current = { book: parsed.book, section1Based: parsed.section1Based }
              navigation.navigateToReference({ book: parsed.book, chapter: 1, verse: 1 })
            } else {
              console.warn('[read route] Invalid section nav ref', readRouteTail.navRef)
            }
          } else if (nt === 'chapter') {
            // Parse "jos 1" → whole chapter, or book-only → chapter 1.
            // navigateToReference expands to full chapter range once book info is available.
            const parsed = parseBibleNavRef(readRouteTail.navRef)
            if (parsed) {
              navigation.navigateToReference({
                book: parsed.ref.book,
                chapter: parsed.ref.chapter,
                verse: 1,
              })
            } else {
              const start = resolveDefaultStartForBook(readRouteTail.navRef, 'chapter')
              if (start) applyBookStart(start)
              else console.warn('[read route] Invalid chapter nav ref', readRouteTail.navRef)
            }
          } else {
            const parsed = parseBibleNavRef(readRouteTail.navRef)
            if (parsed) navigation.navigateToReference(parsed.ref)
            else {
              const start = resolveDefaultStartForBook(readRouteTail.navRef, 'ref')
              if (start) applyBookStart(start)
              else console.warn('[read route] Invalid bible nav ref', readRouteTail.navRef)
            }
          }
        }

        readRouteAppliedSigRef.current = sig
      } finally {
        if (!cancelled) {
          requestAnimationFrame(() => {
            suppressUrlSyncRef.current = false
          })
        }
      }
    }

    void run()
    return () => {
      cancelled = true
    }
  }, [readRouteTail, currentLanguageCode, isLoadingResources, navigation, navigationMode])

  // After sections load, jump to 1-based section from URL
  useEffect(() => {
    const pending = pendingSectionRef.current
    if (!pending) return
    if (currentNavRef.book !== pending.book) return
    if (!currentSections.length) return
    const idx = pending.section1Based - 1
    if (idx < 0 || idx >= currentSections.length) {
      pendingSectionRef.current = null
      return
    }
    const sec = currentSections[idx]
    pendingSectionRef.current = null
    navigation.navigateToReference({
      book: pending.book,
      chapter: sec.start.chapter,
      verse: sec.start.verse,
      endChapter: sec.end.chapter !== sec.start.chapter ? sec.end.chapter : undefined,
      endVerse: sec.end.verse,
    })
  }, [navigation, currentNavRef.book, currentSections])

  // Cache restore only on bare `/read`. Lang paths: URL wins unless this is
  // an in-app UI write (internal replaceState).
  useEffect(() => {
    const deepLinkSig = readRouteTail
      ? `${readRouteTail.resourceType}|${readRouteTail.navType ?? ''}|${readRouteTail.navRef}`
      : null
    const panels = useReadPanelStore.getState().panels
    const action = readUrlWriteBackAction({
      pathname: getReadLocationPathname() || location.pathname,
      language: currentLanguageCode,
      languages: readUrlLangsFromPanels(panels),
      suppressUrlSync: suppressUrlSyncRef.current,
      deepLinkPending: Boolean(deepLinkSig) && readRouteAppliedSigRef.current !== deepLinkSig,
      navigationSource: getReadNavigationSource(),
      scope: navigationScope,
      mode: navigationMode,
      ref: currentNavRef,
      passageSet: currentPassageSet,
      section1Based:
        navigationMode === 'section' && currentSectionIndex >= 0 ? currentSectionIndex + 1 : null,
    })
    if (action) replaceReadUrlFromUi(action.replace)
  }, [
    currentLanguageCode,
    panel1Lang,
    panel2Lang,
    panel1Mode,
    panel2Mode,
    navigationScope,
    navigationMode,
    currentNavRef,
    currentPassageSet,
    currentSectionIndex,
    location.pathname,
    readRouteTail,
  ])
}
