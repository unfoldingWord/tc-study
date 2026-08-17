/**
 * Unambiguous Read URL grammar:
 *   /read/{lang | lang1+lang2}/{bible|obs}/{navType}/{navRef}
 *
 * First path segment after `/read/` is the language field. Split that segment
 * on `+` (max 2 langs). The next segment must be reserved mode (`bible`|`obs`).
 * A second path segment is never a language — `/read/en/bible` is one lang.
 * Hyphens stay inside a BCP-47 tag (`es-419+fr`).
 *
 * Legacy alias (parse only): `/read/{lang}/{lang2}/bible|obs/...` when lang2
 * is not a reserved token. Serialize always writes plus form.
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

/** Canonical langs from one field (`en`, `en+fr`, `es-419+fr`). Drops reserved tokens and dupes. */
export function langsFromReadLanguageField(field: string): string[] {
  const langs: string[] = []
  for (const raw of field.split('+')) {
    const token = decodeSegment(raw).trim()
    if (!token || isReservedReadToken(token)) continue
    const code = canonicalReadLanguageCode(token)
    if (!code || langs.includes(code)) continue
    langs.push(code)
    if (langs.length >= 2) break
  }
  return langs
}

export function parseReadUrl(pathname: string): ParsedReadUrl {
  if (pathname.includes('/read-v1/')) {
    return { langs: [], isBare: false }
  }
  const parts = pathname.split('/').filter(Boolean)
  if (parts[0] !== 'read') return { langs: [], isBare: false }
  const rest = parts.slice(1)
  if (rest.length === 0) return { langs: [], isBare: true }

  let i = 0
  const langs: string[] = []
  const firstRaw = decodeSegment(rest[0] ?? '').trim()
  if (firstRaw && !isReservedReadToken(firstRaw)) {
    langs.push(...langsFromReadLanguageField(firstRaw))
    i = 1
    // One-time external alias: /read/en/fr/bible/... (second segment is not mode)
    if (!firstRaw.includes('+') && rest[1] && !isReservedReadToken(decodeSegment(rest[1]).trim())) {
      const legacy = langsFromReadLanguageField(decodeSegment(rest[1]).trim())
      for (const code of legacy) {
        if (langs.length >= 2) break
        if (!langs.includes(code)) langs.push(code)
      }
      if (legacy.length > 0) i = 2
    }
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
  const langs: string[] = []
  for (const raw of options.langs) {
    const code = canonicalReadLanguageCode(String(raw || '').trim())
    if (!code || langs.includes(code)) continue
    langs.push(code)
    if (langs.length >= 2) break
  }
  if (langs.length === 0) return '/read'
  const langField = langs.map((code) => encodeURIComponent(code)).join('+')
  const prefix = `/read/${langField}`
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
 * Scripture / OBS-content panes own the language field.
 * Same code on both scripture panes → one lang (no `en+en`).
 * Diverged scripture panes → `lang1+lang2`. Helps-only language is omitted.
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
