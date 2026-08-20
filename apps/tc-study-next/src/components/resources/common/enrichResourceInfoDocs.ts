import { getDoor43ApiClient } from '@bt-synergy/door43-api'
import type { ResourceInfo } from '../../../contexts/types'

export type ResourceInfoDocsEnrichment = {
  readme?: string
  license?: string
}

type LooseResource = ResourceInfo & {
  metadata_url?: string
  release?: { tag_name?: string }
}

/**
 * Resolve Door43 manifest.yaml URL for README / license enrichment.
 * Prefers catalog `urls.metadata` / legacy `metadata_url`, else constructs from identity.
 */
export function resolveResourceMetadataUrl(resource: ResourceInfo): string | undefined {
  const loose = resource as LooseResource
  const fromCatalog = resource.urls?.metadata?.trim()
  if (fromCatalog) return fromCatalog
  const fromLegacy = loose.metadata_url?.trim()
  if (fromLegacy) return fromLegacy

  const owner = typeof resource.owner === 'string' ? resource.owner.trim() : ''
  const language = (resource.language || resource.languageCode || '').toString().trim()
  const id = (
    resource.resourceId ||
    resource.key?.split('/')[2] ||
    resource.id?.split('/')[2] ||
    ''
  )
    .toString()
    .trim()
  if (!owner || !language || !id) return undefined

  const repoName = `${language}_${id}`
  const tag = loose.release?.tag_name?.trim()
  if (tag) {
    return `https://git.door43.org/${owner}/${repoName}/raw/tag/${tag}/manifest.yaml`
  }
  return `https://git.door43.org/${owner}/${repoName}/raw/branch/master/manifest.yaml`
}

/**
 * Best-effort Door43 README + license fetch (wizard / catalog enrichment path).
 * Returns empty fields when offline or URL cannot be resolved — never throws.
 */
export async function enrichResourceInfoDocs(
  resource: ResourceInfo
): Promise<ResourceInfoDocsEnrichment> {
  const metadataUrl = resolveResourceMetadataUrl(resource)
  if (!metadataUrl) return {}

  try {
    const door43Client = getDoor43ApiClient({ debug: false })
    const language = (resource.language || resource.languageCode || 'en').toString()
    const id =
      resource.resourceId ||
      resource.key?.split('/')[2] ||
      resource.id?.split('/')[2] ||
      resource.key
    const result = await door43Client.enrichResourceMetadata({
      id,
      name: id,
      owner: resource.owner || 'unknown',
      language,
      subject: resource.subject || resource.category,
      metadata_url: metadataUrl,
    } as Parameters<typeof door43Client.enrichResourceMetadata>[0])
    return {
      readme: typeof result?.readme === 'string' ? result.readme : undefined,
      license: typeof result?.license === 'string' ? result.license : undefined,
    }
  } catch (error) {
    console.warn('Failed to enrich resource docs:', error)
    return {}
  }
}

function trimmed(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined
  const t = value.trim()
  return t || undefined
}

/**
 * Fill missing documentation fields from a secondary ResourceInfo (e.g. loadedResources).
 */
export function mergeResourceInfoDocs(
  primary: ResourceInfo,
  secondary: ResourceInfo | undefined
): ResourceInfo {
  if (!secondary) return primary
  const readme = trimmed(primary.readme) || trimmed(secondary.readme)
  const description = trimmed(primary.description) || trimmed(secondary.description)
  const primaryLicense = primary.license
  const secondaryLicense = secondary.license
  const license = primaryLicense || secondaryLicense
  if (readme === primary.readme && description === primary.description && license === primaryLicense) {
    return primary
  }
  return {
    ...primary,
    ...(readme !== undefined ? { readme } : {}),
    ...(description !== undefined ? { description } : {}),
    ...(license !== undefined ? { license } : {}),
  }
}
