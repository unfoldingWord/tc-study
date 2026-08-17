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
 * `:lang` from `/read/{lang}/…` (ignore `/read-v1`). Bare `/read` is null.
 */
export function languageCodeFromReadPathname(pathname: string): string | null {
  if (isBareReadPathname(pathname) || pathname.includes('/read-v1/')) return null
  const match = /(?:^|\/)read\/([^/]+)(?:\/|$)/.exec(pathname)
  const code = match?.[1]?.trim()
  return code || null
}

/**
 * Explicit `/read/{lang}/…` wins over a persisted session language.
 * Bare `/read` (no `:lang`) falls back to cache.
 */
export function resolveReadLanguageFromUrlOrCache(options: {
  pathname: string
  cachedLanguage?: string | null
}): { language: string | null; source: 'url' | 'cache' | null } {
  const urlLang = languageCodeFromReadPathname(options.pathname)
  if (urlLang) return { language: urlLang, source: 'url' }
  const cached = options.cachedLanguage?.trim() || null
  if (cached) return { language: cached, source: 'cache' }
  return { language: null, source: null }
}

/**
 * Picker / language change may replace the path. Auto-load of a URL that
 * already has this `:lang` must not — that would rewrite a deep link with
 * cached nav (bible/tit instead of obs/1.1).
 */
export function shouldPushReadLanguageUrl(pathname: string, languageCode: string): boolean {
  const pathLang = languageCodeFromReadPathname(pathname)
  return !pathLang || pathLang !== languageCode
}

/**
 * Whether the Read URL write-back effect should replace the pathname with the
 * canonical `/read/{lang}/…` template.
 *
 * An explicit `/read/{lang}/…` is authoritative: never replace that language
 * with a cached session language. Bare `/read` may write back from cache.
 * `suppressUrlSync` / `deepLinkPending` block clobbering an incoming deep
 * link before (or while) it is applied.
 */
export function shouldWriteBackReadUrl(options: {
  currentLanguageCode: string | null | undefined
  suppressUrlSync: boolean
  pathname?: string
  deepLinkPending?: boolean
}): boolean {
  if (!options.currentLanguageCode) return false
  if (options.suppressUrlSync) return false
  if (options.deepLinkPending) return false
  const urlLang = options.pathname ? languageCodeFromReadPathname(options.pathname) : null
  if (urlLang && urlLang !== options.currentLanguageCode) return false
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
  deepLinkPending?: boolean
}): { replace: string } | null {
  if (
    !shouldWriteBackReadUrl({
      currentLanguageCode: args.language,
      suppressUrlSync: args.suppressUrlSync,
      pathname: args.pathname,
      deepLinkPending: args.deepLinkPending,
    })
  ) {
    return null
  }
  const urlLang = languageCodeFromReadPathname(args.pathname)
  const language = urlLang || args.language
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
