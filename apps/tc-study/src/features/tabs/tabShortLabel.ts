import { COMBINED_HELPS_IDS, isCombinedHelpsId } from '../helps/combinedHelpsIds'
import { isCombinedHelpsResourceType } from '../../utils/normalizeResourceTypeId'

export interface TabShortLabelResource {
  id?: string
  key?: string
  title?: string
  type?: string
  /** DCS catalog abbreviation when it differs from the key segment (e.g. tpl for glt). */
  abbreviation?: string
}

/** Compact tab / DnD label (DCS abbrev, key segment, CombinedHelps specials, title heuristics). */
export function getTabShortLabel(resource: TabShortLabelResource | null | undefined): string {
  const key = resource?.key || resource?.id || ''
  if (isCombinedHelpsId(key) || COMBINED_HELPS_IDS.has(key) || isCombinedHelpsResourceType(resource?.type)) {
    return 'Helps'
  }
  const abbrev = resource?.abbreviation?.trim()
  if (abbrev) return abbrev.toUpperCase()
  if (resource?.key) {
    const parts = resource.key.split('/')
    const lastPart = parts[parts.length - 1] || ''
    if (lastPart) return lastPart.toUpperCase()
  }
  if (resource?.title) {
    const t = resource.title
    if (t.includes('Greek New Testament')) return 'UGNT'
    if (t.includes('Hebrew Old Testament')) return 'UHB'
    if (t.includes('Literal Text')) return 'ULT'
    if (t.includes('Simplified Text')) return 'UST'
    if (t.includes('Translation Notes')) return 'UTN'
    if (t.includes('Translation Words')) return 'UTW'
    if (t.includes('Translation Questions')) return 'UTQ'
    if (t.includes('Translation Academy')) return 'UTA'
    const words = t.split(/\s+/)
    for (const w of words) {
      if (['unfoldingWord', 'the', 'a', 'an', 'of'].includes(w)) continue
      return w.substring(0, 4).toUpperCase()
    }
  }
  return 'N/A'
}

/**
 * Quote-chip / library badge label for a resource key.
 * Prefers DCS `abbreviation` from loaded/workspace ResourceInfo; falls back to key segment.
 * Returns '' when `resourceKey` is missing so callers can hide the chip.
 */
export function getResourceBadgeLabel(
  resourceKey: string | null | undefined,
  resource?: Pick<TabShortLabelResource, 'abbreviation' | 'title' | 'type'> | null
): string {
  if (!resourceKey) return ''
  return getTabShortLabel({
    key: resourceKey,
    title: resource?.title,
    type: resource?.type,
    abbreviation: resource?.abbreviation,
  })
}
