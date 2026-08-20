/**
 * Pure policies for Read language bootstrap vs deep-link URL sync.
 * Kept free of React so unit tests can cover restore/deep-link decisions.
 */

import type { BCVReference, NavigationCatalogScope, NavigationMode, PassageSet } from '../../contexts/types'
import {
  buildReadPath,
  buildReadRouteTailFromNavigation,
  navigationModeFromReadNav,
  navigationScopeFromResourceType,
  type ReadResourceType,
} from '../../utils/readRoutes'

/**
 * Bare `/read` (no `:lang` in the URL) must only navigate after a language pick.
 * Catalog load runs on the remounted `/read/:lang` instance via auto-load.
 * When the URL already has a language, load in place.
 */
export function shouldDeferLanguageCatalogLoad(urlLanguage: string | null | undefined): boolean {
  return !urlLanguage
}

/** True for the language-picker landing path (`/read` or `/read/`). */
export function isBareReadPathname(pathname: string): boolean {
  return pathname === '/read' || pathname === '/read/'
}

/**
 * Whether the Read URL write-back effect should replace the pathname with the
 * canonical `/read/{lang}/…` template.
 *
 * Language may come from the URL or a persisted session. Cold start with no
 * language stays on `/read`. `suppressUrlSync` blocks clobbering an incoming
 * deep link while it is being applied.
 */
export function shouldWriteBackReadUrl(options: {
  currentLanguageCode: string | null | undefined
  suppressUrlSync: boolean
}): boolean {
  if (!options.currentLanguageCode) return false
  if (options.suppressUrlSync) return false
  return true
}

export type CachedReadSession = {
  language: string
  mode: ReadResourceType
  book: string
  chapter: number
  verse: number
  /** URL nav type (`ref` / `chapter` / `story` / …). Defaults: bible `ref`, obs `story`. */
  navigationType?: string
}

/**
 * Visit `/read` with a cached language + bible/obs + book/ref → `replace` to
 * the canonical path so the back button does not trap on the bare route.
 */
export function resumeBareReadNavigation(
  pathname: string,
  session: CachedReadSession | null | undefined
): { replace: string } | null {
  if (!isBareReadPathname(pathname) || !session) return null
  const navType = session.navigationType || (session.mode === 'obs' ? 'story' : 'ref')
  const mode = navigationModeFromReadNav(session.mode, navType)
  if (!mode) return null
  return readUrlWriteBackAction({
    pathname,
    language: session.language,
    suppressUrlSync: false,
    scope: navigationScopeFromResourceType(session.mode),
    mode,
    ref: { book: session.book, chapter: session.chapter, verse: session.verse },
    passageSet: null,
    section1Based: null,
  })
}

/** Canonical `/read/{lang}/…` replace action, or null when the URL is already current. */
export function readUrlWriteBackAction(args: {
  pathname: string
  language: string | null | undefined
  suppressUrlSync: boolean
  scope: NavigationCatalogScope
  mode: NavigationMode
  ref: BCVReference
  passageSet: PassageSet | null
  section1Based: number | null
}): { replace: string } | null {
  if (
    !shouldWriteBackReadUrl({
      currentLanguageCode: args.language,
      suppressUrlSync: args.suppressUrlSync,
    })
  ) {
    return null
  }
  const language = args.language
  if (!language) return null
  const tail = buildReadRouteTailFromNavigation({
    scope: args.scope,
    mode: args.mode,
    ref: args.ref,
    passageSet: args.passageSet,
    section1Based: args.section1Based,
  })
  if (!tail) return null
  const path = buildReadPath(language, tail)
  if (args.pathname === path) return null
  return { replace: path }
}

/**
 * Deep-link full tail (navRef present) should apply once resources for the URL
 * language are ready — not while bootstrap is still loading.
 */
export function shouldApplyDeepLinkTail(options: {
  hasReadRouteTail: boolean
  currentLanguageCode: string | null | undefined
  isLoadingResources: boolean
  alreadyApplied: boolean
}): boolean {
  if (!options.hasReadRouteTail) return false
  if (options.alreadyApplied) return false
  if (!options.currentLanguageCode || options.isLoadingResources) return false
  return true
}
