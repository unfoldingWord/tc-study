/**
 * Unambiguous Read URL grammar:
 *   /read/{lang1}[/{lang2}]/{resourceType}/{navType}/{navRef}
 *
 * First lang = panel-1, optional second = panel-2.
 * `bible` | `obs` (and other reserved tokens) never parse as a language, so
 * `/read/en/bible/...` and `/read/en/fr/bible/...` cannot collide.
 */

import { canonicalReadLanguageCode } from '../../utils/languageCodeMatch'
import type { ReadResourceType, ReadRouteTail } from '../../utils/readRoutes'

export const RESERVED_READ_RESOURCE_TYPES = ['bible', 'obs'] as const
export const RESERVED_READ_NAV_TYPES = ['ref', 'story', 'chapter', 'section', 'passage'] as const
export const RESERVED_READ_PANEL_MODES = ['helps'] as const

const RESERVED_READ_TOKENS = new Set<string>([
  ...RESERVED_READ_RESOURCE_TYPES,
  ...RESERVED_READ_NAV_TYPES,
  ...RESERVED_READ_PANEL_MODES,
])

export type ReadNavigationSource = 'internal' | 'external'

export type ParsedReadUrl = {
  langs: string[]
  resourceType?: ReadResourceType
  navType?: string
  navRef?: string
  isBare: boolean
}

export function isReservedReadToken(segment: string): boolean {
  return RESERVED_READ_TOKENS.has(segment.trim().toLowerCase())
}

export function isReservedReadResourceType(segment: string): segment is ReadResourceType {
  const t = segment.trim().toLowerCase()
  return t === 'bible' || t === 'obs'
}

function decodeSegment(raw: string): string {
  try {
    return decodeURIComponent(raw)
  } catch {
    return raw
  }
}

export function parseReadUrl(pathname: string): ParsedReadUrl {
  if (pathname.includes('/read-v1/')) {
    return { langs: [], isBare: false }
  }
  const parts = pathname.split('/').filter(Boolean)
  if (parts[0] !== 'read') return { langs: [], isBare: false }
  const rest = parts.slice(1)
  if (rest.length === 0) return { langs: [], isBare: true }

  const langs: string[] = []
  let i = 0
  while (i < rest.length && langs.length < 2) {
    const raw = decodeSegment(rest[i] ?? '').trim()
    if (!raw) {
      i += 1
      continue
    }
    if (isReservedReadToken(raw)) break
    langs.push(canonicalReadLanguageCode(raw))
    i += 1
  }

  let resourceType: ReadResourceType | undefined
  if (rest[i] && isReservedReadResourceType(rest[i]!)) {
    resourceType = rest[i]!.trim().toLowerCase() as ReadResourceType
    i += 1
  }

  const navType = rest[i] != null && rest[i] !== '' ? decodeSegment(rest[i]!) : undefined
  if (navType != null) i += 1
  const navRef = rest[i] != null && rest[i] !== '' ? decodeSegment(rest[i]!) : undefined

  return { langs, resourceType, navType, navRef, isBare: false }
}

export function serializeReadUrl(options: { langs: string[]; tail?: ReadRouteTail | null }): string {
  const langs = options.langs
    .map((code) => canonicalReadLanguageCode(String(code || '').trim()))
    .filter(Boolean)
    .slice(0, 2)
  if (langs.length === 0) return '/read'
  const encoded = langs.map((code) => encodeURIComponent(code))
  const prefix = `/read/${encoded.join('/')}`
  const tail = options.tail
  if (!tail) return prefix
  if (!tail.navType) {
    return `${prefix}/${tail.resourceType}`
  }
  return `${prefix}/${tail.resourceType}/${tail.navType}/${encodeURIComponent(tail.navRef.trim())}`
}

export function readUrlLangsEqual(left: string[], right: string[]): boolean {
  if (left.length !== right.length) return false
  return left.every((code, i) => canonicalReadLanguageCode(code) === canonicalReadLanguageCode(right[i] ?? ''))
}

type PanelLangSnapshot = {
  mode: string
  languageCode?: string | null
}

/**
 * Scripture / OBS-content panes own the language segments.
 * Same code on both scripture panes → one lang (external inherit can fill an empty sibling).
 * Diverged scripture panes → two langs (shareable). Helps-only language is omitted.
 */
export function readUrlLangsFromPanels(panels: Record<'panel-1' | 'panel-2', PanelLangSnapshot>): string[] {
  const c1 = panels['panel-1'].languageCode?.trim()
    ? canonicalReadLanguageCode(panels['panel-1'].languageCode!)
    : null
  const c2 = panels['panel-2'].languageCode?.trim()
    ? canonicalReadLanguageCode(panels['panel-2'].languageCode!)
    : null
  const s1 = panels['panel-1'].mode === 'scripture' ? c1 : null
  const s2 = panels['panel-2'].mode === 'scripture' ? c2 : null
  if (s1 && s2) return s1 === s2 ? [s1] : [s1, s2]
  if (s1) return [s1]
  if (s2 && c1 && panels['panel-1'].mode !== 'scripture') return [c1, s2]
  if (s2) return [s2]
  return []
}
