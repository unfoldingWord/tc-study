/**
 * Put UGNT or UHB in the local catalog the way the Read page does when it opens a book: search unfoldingWord's prod
 * release by subject and add its metadata, unless the catalog already has it.
 */

import type { CatalogManager } from '@bt-synergy/catalog-manager/core'
import type { ResourceMetadata } from '@bt-synergy/resource-catalog'
import type { OriginalLanguageSpec } from '../scripture/originalLanguageSpecs'
import { createResourceMetadata, type Door43Resource } from './ResourceMetadataFactory'

type MetadataOptions = Parameters<typeof createResourceMetadata>[1]

/** The added metadata, or null when the catalog already had it or Door43 has no release. */
export async function ensureOriginalLanguageInCatalog(
  orig: OriginalLanguageSpec,
  catalogManager: CatalogManager,
  resourceTypeRegistry: NonNullable<MetadataOptions>['resourceTypeRegistry']
): Promise<ResourceMetadata | null> {
  const resourceKey = `unfoldingWord/${orig.lang}/${orig.id}`
  const catalogEntry = await (
    catalogManager.catalogAdapter as { get: (k: string) => Promise<unknown> }
  ).get(resourceKey)
  if (catalogEntry) return null

  const results = await catalogManager.door43Client.searchCatalog({
    owner: 'unfoldingWord',
    lang: orig.lang,
    subject: orig.subject,
    stage: 'prod',
    limit: 1,
  })
  if (!results || results.length === 0) return null

  const door43Resource = results[0]
  const repoName = door43Resource.name ?? door43Resource.repo_name
  const extractedResourceId = repoName?.replace(`${orig.lang}_`, '') || orig.id

  const normalizedResource = {
    ...door43Resource,
    id: extractedResourceId,
    language: door43Resource.language || door43Resource.lang,
  }

  const metadata = await createResourceMetadata(normalizedResource as Door43Resource, {
    resourceTypeRegistry,
    getResourceType: () => 'scripture',
    catalogAdapter: catalogManager.catalogAdapter,
    debug: true,
  })

  await catalogManager.addResourceToCatalog(metadata)
  return metadata
}
