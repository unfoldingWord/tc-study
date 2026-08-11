import type { PanelResourceMetadata, ResourceType } from '../core/types'

/**
 * Structural catalog-like input for mapping into panel filter metadata.
 * Avoids a hard dependency on `@bt-synergy/resource-catalog`.
 */
export interface CatalogMetadataLike {
  type?: string | { toString(): string }
  language?: string
  owner?: string
  subject?: string
  contentMetadata?: {
    testament?: 'ot' | 'nt' | 'both' | string
  }
  tags?: string[]
  categories?: string[]
  scope?: string
}

function mapTestament(
  testament: string | undefined
): PanelResourceMetadata['testament'] | undefined {
  if (!testament) return undefined
  const t = testament.toLowerCase()
  if (t === 'ot') return 'OT'
  if (t === 'nt') return 'NT'
  if (t === 'both') return 'both'
  if (t === 'OT' || t === 'NT' || t === 'both') {
    return t as PanelResourceMetadata['testament']
  }
  return undefined
}

/**
 * Map catalog (or catalog-like) metadata into the narrow panel filter shape.
 * Panels never own catalog SoT — they only consume this mapped descriptor.
 */
export function toPanelResourceMetadata(
  catalog: CatalogMetadataLike,
  extras?: Partial<PanelResourceMetadata>
): PanelResourceMetadata {
  const type =
    catalog.type === undefined || catalog.type === null
      ? undefined
      : (String(catalog.type) as ResourceType)

  return {
    type,
    language: catalog.language,
    owner: catalog.owner,
    subject: catalog.subject,
    testament: mapTestament(catalog.contentMetadata?.testament),
    tags: catalog.tags,
    categories: catalog.categories,
    scope: catalog.scope,
    ...extras,
  }
}
