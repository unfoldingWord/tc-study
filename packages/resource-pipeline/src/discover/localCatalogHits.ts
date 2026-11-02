/**
 * Read hydrate hits from the device's own catalog, for when Door43 cannot be searched: a language opened from a
 * language pack (or downloaded before) still loads with no internet.
 *
 * It asks the same requests as the Door43 search (`catalogSearchRequestsForTarget`): one language, and one subject at
 * a time for OBS helps. `topic=tc-ready` cannot be checked here; what the device holds was already picked by a search
 * that had it, or brought by a pack, which only carries tc-ready resources.
 */

import type { CatalogEntry } from './readCatalogIdentity'
import { catalogSearchRequestsForTarget, type CatalogLoadTarget } from './readCatalogSearch'

/** The catalog row fields a hit is made of (`ResourceMetadata` has them all). */
export interface LocalCatalogRow {
  resourceKey: string
  owner: string
  language: string
  resourceId: string
  subject: string
  title?: string
  description?: string
  abbreviation?: string
  version?: string
}

/** A Door43-shaped hit for one catalog row: `catalogIdentity` gives back the row's own key. */
function hitOf(row: LocalCatalogRow): CatalogEntry {
  return {
    owner: row.owner,
    name: `${row.language}_${row.resourceId}`,
    identifier: row.resourceId,
    language: row.language,
    subject: row.subject,
    title: row.title,
    description: row.description,
    abbreviation: row.abbreviation,
    ...(row.version ? { release: { tag_name: row.version } } : {}),
    fromDevice: true,
  }
}

export function localCatalogHitsForTarget(
  rows: readonly LocalCatalogRow[],
  options: {
    languageCode: string
    target: CatalogLoadTarget
    navigationScope: string
    helpsSubjects?: readonly string[]
  }
): Array<{ hydrateTarget: CatalogLoadTarget; catalogResults: CatalogEntry[] }> {
  const merged = new Map<CatalogLoadTarget, CatalogEntry[]>()
  for (const request of catalogSearchRequestsForTarget(options)) {
    const { language, subject } = request.params
    const hits = rows
      .filter((row) => row.language === language && (!subject || row.subject === subject))
      .map(hitOf)
    merged.set(request.hydrateTarget, [...(merged.get(request.hydrateTarget) ?? []), ...hits])
  }
  return [...merged.entries()].map(([hydrateTarget, catalogResults]) => ({ hydrateTarget, catalogResults }))
}
