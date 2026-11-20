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
import { isLiteralTextId, literalTextOf } from '../language/literalText'
import { catalogHitRelease, door43ResourceForHit } from './catalogHits'
import { ensureOriginalLanguageInCatalog } from './originalLanguageCatalog'
import { obsKindOfSubject, pickObs, type ObsPick } from './obsPick'
import { catalogIdentity } from './readCatalogIdentity'
import { searchAlignedBibles, searchCatalogHitsForTarget, searchObsStories, type CatalogSearchClient } from './readCatalogSearch'
import { createResourceMetadata, type Door43Resource, type MetadataCreationOptions } from './ResourceMetadataFactory'

export interface DiscoveredResource {
  resourceKey: string
  typeId: string
  subject: string
  version: string
  /** True for the literal aligned text that came in without the `tc-ready` topic (see `withoutTcReady` of {@link LanguageDiscovery}). */
  withoutTcReady?: true
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
  /**
   * Resource keys that came in without the `tc-ready` topic. Only one case exists: a language whose Door43 has no `tc-ready` literal aligned
   * text gets its literal aligned Bible (`*lt`, any owner) without the topic, so it can be opened (Abel, 19 Nov). Empty otherwise.
   */
  withoutTcReady: string[]
  /** The OBS owners picked for this language (`obsPick.ts`); every other OBS hit was dropped. */
  obs: ObsPick
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
  /** The client TW's and TA's ingredients are generated with (createResourceMetadata's `ingredientsClient`). */
  ingredientsClient?: MetadataCreationOptions['ingredientsClient']
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
    { hydrateTarget: 'text' as const, catalogResults: await searchObsStories(door43Client, language) },
  ]

  // No tc-ready literal aligned text: take the literal aligned Bible without the topic, marked, never in place of one that has it.
  const withoutTcReady = new Set<string>()
  const hasLiteral = (list: typeof entries) =>
    literalTextOf(
      list.flatMap((entry) => {
        const id = catalogIdentity(entry, language)
        return id ? [{ language: id.langStr, subject: id.subject, resourceId: id.resourceId, owner: id.ownerStr }] : []
      }),
      language
    ) !== undefined
  if (!hasLiteral(pages.flatMap((page) => page.catalogResults))) {
    const candidates = (await searchAlignedBibles(door43Client, language))
      .filter((entry) => {
        const id = catalogIdentity(entry, language)
        return id !== null && id.langStr === language && isLiteralTextId(id.resourceId, language)
      })
      .sort((a, b) => (catalogIdentity(a, language)!.resourceKey < catalogIdentity(b, language)!.resourceKey ? -1 : 1))
    if (candidates.length > 0) {
      withoutTcReady.add(catalogIdentity(candidates[0], language)!.resourceKey)
      pages.push({ hydrateTarget: 'text' as const, catalogResults: [candidates[0]] })
    }
  }

  // One owner per language for OBS: every OBS hit goes through the pick, and only the picked rows continue.
  const entries = pages.flatMap((page) => page.catalogResults)
  const bibleRows = entries.flatMap((entry) => {
    const id = catalogIdentity(entry, language)
    return id ? [{ language: id.langStr, subject: id.subject, resourceId: id.resourceId, owner: id.ownerStr }] : []
  })
  const obs = pickObs(
    entries.filter((entry) => obsKindOfSubject(catalogIdentity(entry, language)?.subject ?? '')),
    (literalTextOf(bibleRows, language) as { owner: string } | undefined)?.owner
  )
  const pickedKeys = new Set(
    [obs.stories, obs.notes, obs.questions, obs.links].flatMap((hit) => {
      const id = hit ? catalogIdentity(hit, language) : null
      return id ? [id.resourceKey] : []
    })
  )

  const resources: DiscoveredResource[] = []
  const skipped: SkippedHit[] = []
  const seen = new Set<string>()

  for (const entry of entries) {
    const id = catalogIdentity(entry, language)
    if (!id || seen.has(id.resourceKey)) continue
    seen.add(id.resourceKey)
    if (obsKindOfSubject(id.subject) && !pickedKeys.has(id.resourceKey)) continue

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
          ingredientsClient: options.ingredientsClient,
        }
      )
      await catalogManager.addResourceToCatalog(metadata)
      resources.push({
        resourceKey: id.resourceKey,
        typeId: type,
        subject: id.subject,
        version: release.tag_name,
        ...(withoutTcReady.has(id.resourceKey) ? { withoutTcReady: true as const } : {}),
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

  return { language, resources, originals: presentOriginals, skipped, withoutTcReady: [...withoutTcReady], obs }
}
