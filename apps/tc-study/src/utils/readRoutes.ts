/**
 * Read page URL template:
 *   /read/{lang}/{resource_type}/{nav_type}/{nav_ref}
 *
 * resource_type: bible | obs
 * nav_type (bible): ref | chapter | section | passage
 * nav_type (obs):   story | ref   (story → chapter mode, ref → frame / range)
 */

import { PassageSetStorage } from '@bt-synergy/passage-sets'
import type {
  BCVReference,
  NavigationCatalogScope,
  NavigationMode,
  PassageSet,
} from '../contexts/types'

export type ReadResourceType = 'bible' | 'obs'

export type ReadRouteTail = {
  resourceType: ReadResourceType
  navType: string
  /** Decoded segment (spaces allowed, e.g. "tit 2:14-3:2") */
  navRef: string
}

/**
 * Partial deep-link hint: URL has resource type and optional nav type but no nav ref.
 * Used to set navigation scope (and optionally mode) without overriding the current reference.
 * e.g. `/read/en/obs` → `{ resourceType: 'obs' }`
 * e.g. `/read/en/obs/story` → `{ resourceType: 'obs', navType: 'story' }`
 */
export type PartialRouteHint = {
  resourceType: ReadResourceType
  navType?: string
}

/** URL-safe slug for passage set matching (id or name). */
export function slugifyReadNavSegment(s: string): string {
  return String(s || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
}

export function buildReadPath(lang: string, tail: ReadRouteTail): string {
  const l = encodeURIComponent(lang.trim())
  const ref = encodeURIComponent(tail.navRef.trim())
  return `/read/${l}/${tail.resourceType}/${tail.navType}/${ref}`
}

export function navigationScopeFromResourceType(rt: ReadResourceType): NavigationCatalogScope {
  return rt === 'obs' ? 'obs' : 'scripture'
}

export function navigationModeFromReadNav(
  resourceType: ReadResourceType,
  navType: string
): NavigationMode | null {
  const t = navType.toLowerCase()
  if (resourceType === 'obs') {
    if (t === 'story') return 'chapter'
    if (t === 'ref') return 'verse'
    return null
  }
  if (t === 'ref') return 'verse'
  if (t === 'chapter') return 'chapter'
  if (t === 'section') return 'section'
  if (t === 'passage') return 'passage-set'
  return null
}

export function readNavTypeFromNavigationMode(
  scope: NavigationCatalogScope,
  mode: NavigationMode
): string | null {
  if (scope === 'obs') {
    if (mode === 'chapter') return 'story'
    if (mode === 'verse') return 'ref'
    return null
  }
  if (mode === 'verse') return 'ref'
  if (mode === 'chapter') return 'chapter'
  if (mode === 'section') return 'section'
  if (mode === 'passage-set') return 'passage'
  return null
}

/** Parse trailing part after book code for scripture references. */
function parseScriptureRest(rest: string): Pick<BCVReference, 'chapter' | 'verse' | 'endChapter' | 'endVerse'> | null {
  const r = rest.trim()
  if (!r) return null

  const onlyChapter = /^(\d+)$/.exec(r)
  if (onlyChapter) {
    return { chapter: Number(onlyChapter[1]), verse: 1 }
  }

  const cv = /^(\d+):(\d+)$/.exec(r)
  if (cv) {
    return { chapter: Number(cv[1]), verse: Number(cv[2]) }
  }

  const range = /^(\d+):(\d+)-(\d+)(?::(\d+))?$/.exec(r)
  if (range) {
    const c1 = Number(range[1])
    const v1 = Number(range[2])
    const a = Number(range[3])
    const v2 = range[4] != null ? Number(range[4]) : undefined
    if (v2 !== undefined) {
      return { chapter: c1, verse: v1, endChapter: a, endVerse: v2 }
    }
    return { chapter: c1, verse: v1, endVerse: a }
  }

  return null
}

/**
 * Parse `tit 2:14-3:2`, `tit 2`, `GEN 1:1`, etc. Book = first token; remainder is chapter/verse grammar.
 */
export function parseBibleNavRef(navRef: string): { book: string; ref: BCVReference } | null {
  const normalized = navRef.trim().replace(/\s+/g, ' ')
  const m = /^([A-Za-z0-9]{1,12})\s+(.+)$/.exec(normalized)
  if (!m) return null
  const book = m[1].toLowerCase()
  const parsed = parseScriptureRest(m[2])
  if (!parsed) return null
  return { book, ref: { book, ...parsed } }
}

/** Section: `tit 3` → book tit, 1-based section index 3 */
export function parseBibleSectionNavRef(navRef: string): { book: string; section1Based: number } | null {
  const normalized = navRef.trim().replace(/\s+/g, ' ')
  const m = /^([A-Za-z0-9]{1,12})\s+(\d+)$/.exec(normalized)
  if (!m) return null
  const n = Number(m[2])
  if (!Number.isFinite(n) || n < 1) return null
  return { book: m[1].toLowerCase(), section1Based: n }
}

/** OBS story number only */
export function parseObsStoryNavRef(navRef: string): BCVReference | null {
  const n = Number(String(navRef).trim())
  if (!Number.isFinite(n) || n < 1) return null
  return { book: 'obs', chapter: n, verse: 1 }
}

/** OBS frame range e.g. `1.4-2.5` */
export function parseObsFrameRangeNavRef(navRef: string): BCVReference | null {
  const m = /^(\d+)\.(\d+)-(\d+)\.(\d+)$/.exec(String(navRef).trim())
  if (!m) return null
  return {
    book: 'obs',
    chapter: Number(m[1]),
    verse: Number(m[2]),
    endChapter: Number(m[3]),
    endVerse: Number(m[4]),
  }
}

/** Single OBS frame e.g. `1.4` or range `1.4-2.5` */
export function parseObsFrameNavRef(navRef: string): BCVReference | null {
  const range = parseObsFrameRangeNavRef(navRef)
  if (range) return range
  const m = /^(\d+)\.(\d+)$/.exec(String(navRef).trim())
  if (!m) return null
  return { book: 'obs', chapter: Number(m[1]), verse: Number(m[2]) }
}

export function formatBibleNavRef(ref: BCVReference): string {
  const b = ref.book.toLowerCase()
  const ec = ref.endChapter
  const ev = ref.endVerse
  if (ec != null && ec >= 1 && ev != null && ev >= 1) {
    return `${b} ${ref.chapter}:${ref.verse}-${ec}:${ev}`
  }
  if (ev != null && ev >= 1) {
    return `${b} ${ref.chapter}:${ref.verse}-${ev}`
  }
  return `${b} ${ref.chapter}:${ref.verse}`
}

/** Chapter mode URL: `tit 2` (whole chapter — verse 1; chapter expansion happens in navigateToReference when mode is chapter). */
export function formatBibleChapterNavRef(ref: BCVReference): string {
  return `${ref.book.toLowerCase()} ${ref.chapter}`
}

export function formatBibleSectionNavRef(ref: BCVReference, section1Based: number): string {
  return `${ref.book.toLowerCase()} ${section1Based}`
}

export function formatObsStoryNavRef(ref: BCVReference): string {
  return String(ref.chapter || 1)
}

export function formatObsFrameRangeNavRef(ref: BCVReference): string {
  const c1 = ref.chapter || 1
  const v1 = ref.verse || 1
  const c2 = ref.endChapter ?? c1
  const v2 = ref.endVerse ?? v1
  return `${c1}.${v1}-${c2}.${v2}`
}

export function formatPassageNavRef(set: PassageSet): string {
  const fromId = slugifyReadNavSegment(set.id)
  if (fromId) return fromId
  return slugifyReadNavSegment(set.name)
}

export async function findPassageSetByNavSlug(slug: string): Promise<PassageSet | null> {
  const want = slugifyReadNavSegment(slug)
  if (!want) return null
  try {
    const storage = new PassageSetStorage()
    const sets = await storage.getAll()
    return (
      sets.find((s) => slugifyReadNavSegment(s.id) === want || slugifyReadNavSegment(s.name) === want) ??
      null
    )
  } catch {
    return null
  }
}

export function buildReadRouteTailFromNavigation(args: {
  scope: NavigationCatalogScope
  mode: NavigationMode
  ref: BCVReference
  passageSet: PassageSet | null
  section1Based: number | null
}): ReadRouteTail | null {
  const { scope, mode, ref, passageSet, section1Based } = args
  const resourceType: ReadResourceType = scope === 'obs' ? 'obs' : 'bible'
  const navType = readNavTypeFromNavigationMode(scope, mode)
  if (!navType) return null

  if (resourceType === 'bible' && navType === 'passage') {
    if (!passageSet) return null
    return { resourceType, navType, navRef: formatPassageNavRef(passageSet) }
  }

  if (resourceType === 'bible' && navType === 'section') {
    if (section1Based == null || section1Based < 1) return null
    return { resourceType, navType, navRef: formatBibleSectionNavRef(ref, section1Based) }
  }

  if (resourceType === 'bible' && navType === 'chapter') {
    return { resourceType, navType, navRef: formatBibleChapterNavRef(ref) }
  }

  if (resourceType === 'bible' && navType === 'ref') {
    return { resourceType, navType, navRef: formatBibleNavRef(ref) }
  }

  if (resourceType === 'obs' && navType === 'story') {
    return { resourceType, navType, navRef: formatObsStoryNavRef(ref) }
  }

  if (resourceType === 'obs' && navType === 'ref') {
    const c0 = ref.chapter || 1
    const v0 = ref.verse || 1
    const ec = ref.endChapter
    const ev = ref.endVerse
    // Cross-story range sets endChapter; same-story range often sets only endVerse (see BCVNavigator.handleObsRangeApply).
    const crossStoryRange =
      ec != null &&
      ec >= 1 &&
      ev != null &&
      ev >= 1 &&
      (ec !== c0 || ev !== v0)
    const sameStoryFrameRange =
      ev != null &&
      ev >= 1 &&
      ev !== v0 &&
      (ec == null || ec === c0)
    if (crossStoryRange || sameStoryFrameRange) {
      return { resourceType, navType, navRef: formatObsFrameRangeNavRef(ref) }
    }
    return { resourceType, navType, navRef: `${c0}.${v0}` }
  }

  return null
}
