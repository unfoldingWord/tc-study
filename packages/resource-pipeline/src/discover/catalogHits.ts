/**
 * A Door43 catalog search hit turned into the resource record `createResourceMetadata` takes, as the Read page does
 * for every hit it keeps. Shared so a language discovered without a screen gets the same catalog rows.
 */

import { asString, catalogIdentity, type CatalogEntry } from './readCatalogIdentity'

export type CatalogHitIdentity = NonNullable<ReturnType<typeof catalogIdentity>>
export type CatalogHitRelease = NonNullable<CatalogEntry['release']>

/** The release a hit points to; hits without a tagged release are not loaded. */
export function catalogHitRelease(id: CatalogHitIdentity): CatalogEntry['release'] {
  return id.item.release ?? id.item.catalog?.prod
}

export function door43ResourceForHit(
  entry: CatalogEntry,
  id: CatalogHitIdentity,
  release: CatalogHitRelease
) {
  const { item, ownerStr, langStr, resourceId, resourceKey, subject, repoName } = id
  const abbreviation = asString(item.abbreviation).trim() || undefined
  return {
    id: resourceId,
    name: repoName,
    title: item.title ?? entry.title ?? resourceKey,
    ...(abbreviation ? { abbreviation } : {}),
    owner: ownerStr,
    language: langStr,
    language_title: item.language_title,
    subject,
    version: release.tag_name,
    format: item.content_format ?? item.format,
    content_format: item.content_format ?? item.format,
    metadata_url: item.metadata_url ?? entry.metadata_url,
    description: item.description ?? item.repo?.description,
    ingredients: item.ingredients,
    release,
    server: 'git.door43.org',
    html_url: item.html_url ?? entry.html_url ?? release?.html_url,
  }
}
