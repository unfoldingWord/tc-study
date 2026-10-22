/**
 * Find a language's resources the way tc-study's Read page does and put them in the local catalog: the Door43
 * `topic=tc-ready` search (every owner, `stage=prod`), the OBS helps searches one subject at a time, and both
 * original languages (the Read page adds only the current book's). Hits go through the same identity, release and
 * metadata steps as the Read page's hydrate, so the catalog rows are the ones tc-study would write.
 *
 * One difference with the Read page: the OBS helps searches, which go without the topic, ask only for OBS's own helps.
 * TW and TA come only from the `tc-ready` search; untopiced, any fork of them would come in (es-419_obt/es-419_tw).
 */

import type { CatalogManager } from '@bt-synergy/catalog-manager/core'
import type { ResourceTypeRegistry } from '@bt-synergy/resource-types'
import {
  ORIGINAL_LANGUAGE_SPECS,
  originalLanguageResourceKey,
  type OriginalLanguageSpec,
} from '../scripture/originalLanguageSpecs'
import { catalogHitRelease, door43ResourceForHit } from './catalogHits'
import { ensureOriginalLanguageInCatalog } from './originalLanguageCatalog'
import { catalogIdentity } from './readCatalogIdentity'
import { searchCatalogHitsForTarget, type CatalogSearchClient } from './readCatalogSearch'
import { createResourceMetadata, type Door43Resource } from './ResourceMetadataFactory'

export interface DiscoveredResource {
  resourceKey: string
  typeId: string
  subject: string
  version: string
}

export interface SkippedHit {
  resourceKey: string
  subject: string
  reason: 'unknown-subject' | 'no-release' | 'metadata-failed'
  detail?: string
}

export interface LanguageDiscovery {
  language: string
  resources: DiscoveredResource[]
  /** Original-language keys now in the catalog (added now or already there). */
  originals: string[]
  skipped: SkippedHit[]
}

/** The OBS helps subjects that are OBS's own (`TSV OBS Translation Notes`…), not the TW and TA OBS also links to. */
export function obsOwnHelpsSubjects(subjects: readonly string[]): string[] {
  return subjects.filter((subject) => /\bOBS\b/.test(subject))
}

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

export async function discoverLanguage(options: {
  language: string
  door43Client: CatalogSearchClient
  catalogManager: CatalogManager
  resourceTypeRegistry: ResourceTypeRegistry
  /** Defaults to UGNT and UHB. */
  originals?: readonly OriginalLanguageSpec[]
}): Promise<LanguageDiscovery> {
  const { language, door43Client, catalogManager, resourceTypeRegistry } = options
  const originals = options.originals ?? ORIGINAL_LANGUAGE_SPECS

  const pages = [
    ...(await searchCatalogHitsForTarget(door43Client, {
      languageCode: language,
      target: 'both',
      navigationScope: 'scripture',
    })),
    ...(await searchCatalogHitsForTarget(door43Client, {
      languageCode: language,
      target: 'helps',
      navigationScope: 'obs',
      helpsSubjects: obsOwnHelpsSubjects(resourceTypeRegistry.subjectsForHelpsCatalogLoad('obs')),
    })),
  ]

  const resources: DiscoveredResource[] = []
  const skipped: SkippedHit[] = []
  const seen = new Set<string>()

  for (const entry of pages.flatMap((page) => page.catalogResults)) {
    const id = catalogIdentity(entry, language)
    if (!id || seen.has(id.resourceKey)) continue
    seen.add(id.resourceKey)

    const type = resourceTypeRegistry.getTypeForSubject(id.subject)
    if (!type) {
      skipped.push({ resourceKey: id.resourceKey, subject: id.subject, reason: 'unknown-subject' })
      continue
    }
    const release = catalogHitRelease(id)
    if (!release?.tag_name) {
      skipped.push({ resourceKey: id.resourceKey, subject: id.subject, reason: 'no-release' })
      continue
    }
    try {
      const metadata = await createResourceMetadata(
        door43ResourceForHit(entry, id, release) as Door43Resource,
        {
          resourceTypeRegistry,
          getResourceType: () => type,
          catalogAdapter: catalogManager.catalogAdapter,
          debug: false,
        }
      )
      await catalogManager.addResourceToCatalog(metadata)
      resources.push({
        resourceKey: id.resourceKey,
        typeId: type,
        subject: id.subject,
        version: release.tag_name,
      })
    } catch (error) {
      skipped.push({
        resourceKey: id.resourceKey,
        subject: id.subject,
        reason: 'metadata-failed',
        detail: errorText(error),
      })
    }
  }

  const presentOriginals: string[] = []
  for (const orig of originals) {
    const key = originalLanguageResourceKey(orig)
    try {
      await ensureOriginalLanguageInCatalog(orig, catalogManager, resourceTypeRegistry)
      if (await catalogManager.catalogAdapter.get(key)) presentOriginals.push(key)
      else skipped.push({ resourceKey: key, subject: orig.subject, reason: 'no-release' })
    } catch (error) {
      skipped.push({ resourceKey: key, subject: orig.subject, reason: 'metadata-failed', detail: errorText(error) })
    }
  }

  return { language, resources, originals: presentOriginals, skipped }
}
