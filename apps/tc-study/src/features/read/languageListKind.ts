/**
 * Which Door43 subject set a Read language picker should request.
 *
 * listMode still shares filter chrome (Any / Bible / OBS). The **fetch**
 * is scoped so scripture panes do not ask for OBS-only subjects, and helps
 * panes follow bible vs OBS nav. Bootstrap (no scope) uses the global
 * content union — the shared cache / “200 languages” baseline.
 *
 * When the header omits `navigationScope`, infer from `/read/{lang}/bible|obs`
 * or the nav store. Do not fall back to `global` once Read already has a mode.
 */

import type { LanguageListKind } from '@bt-synergy/resource-types'
import type { LanguagePickerListMode } from './filterPickerLanguages'
import { parseReadUrl } from './readUrlGrammar'

export type { LanguageListKind }

export type LanguageListNavigationScope = 'scripture' | 'obs'

export function asLanguageListNavigationScope(
  value: string | null | undefined
): LanguageListNavigationScope | null {
  return value === 'obs' || value === 'scripture' ? value : null
}

/** `bible` / `obs` path segment only — no store fallback. */
export function navigationScopeFromReadPathOrNull(
  pathname: string
): LanguageListNavigationScope | null {
  if (!pathname || pathname.includes('/read-v1/')) return null
  const parsed = parseReadUrl(pathname)
  if (!parsed.resourceType) return null
  return parsed.resourceType === 'obs' ? 'obs' : 'scripture'
}

/**
 * URL mode wins, then the explicit header prop, then the nav store.
 * Bare `/read` stays null so bootstrap can still fetch the global union.
 */
export function resolvePickerNavigationScope(options: {
  explicitScope?: string | null
  pathname?: string
  storeScope?: string | null
}): LanguageListNavigationScope | null {
  const pathname = options.pathname ?? ''
  const fromUrl = navigationScopeFromReadPathOrNull(pathname)
  if (fromUrl) return fromUrl

  const explicit = asLanguageListNavigationScope(options.explicitScope)
  if (explicit) return explicit

  if (pathname && !pathname.includes('/read-v1/')) {
    const parsed = parseReadUrl(pathname)
    if (parsed.isBare) return null
  }

  return asLanguageListNavigationScope(options.storeScope)
}

export function resolveLanguageListKind(options: {
  listMode?: LanguagePickerListMode | null
  navigationScope?: LanguageListNavigationScope | null
}): LanguageListKind {
  const listMode = options.listMode ?? 'text'
  const scope = options.navigationScope
  if (listMode === 'helps') {
    return scope === 'obs' ? 'obs-helps' : 'helps'
  }
  if (scope === 'obs') return 'obs'
  if (scope === 'scripture') return 'scripture'
  return 'global'
}

export function pickerListCacheKey(
  kind: LanguageListKind,
  subjects: readonly string[]
): string {
  return `${kind}:${subjects.join('\u001f')}`
}

export function resolvePickerLanguageList(options: {
  listMode?: LanguagePickerListMode | null
  navigationScope?: string | null
  pathname?: string
  storeScope?: string | null
  subjectsForKind: (kind: LanguageListKind) => string[]
}): {
  kind: LanguageListKind
  scope: LanguageListNavigationScope | null
  subjects: string[]
  cacheKey: string
} {
  const scope = resolvePickerNavigationScope({
    explicitScope: options.navigationScope,
    pathname: options.pathname,
    storeScope: options.storeScope,
  })
  const kind = resolveLanguageListKind({
    listMode: options.listMode,
    navigationScope: scope,
  })
  const subjects = options.subjectsForKind(kind)
  return { kind, scope, subjects, cacheKey: pickerListCacheKey(kind, subjects) }
}

/** OBS helps are mostly prod without `topic=tc-ready` (only ~3 TSV GLs). */
export function languageListDoor43Filter(kind: LanguageListKind): {
  stage: string
  topic?: string
} {
  if (kind === 'obs-helps' || kind === 'all-helps') return { stage: 'prod' }
  return { stage: 'prod', topic: 'tc-ready' }
}
