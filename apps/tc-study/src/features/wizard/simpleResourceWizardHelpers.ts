import type { ResourceMetadata } from '@bt-synergy/catalog-manager'
import type { LucideIcon } from 'lucide-react'
import { BookOpen, BookText, Library, Link as LinkIcon, MessageSquare } from 'lucide-react'

export interface CatalogResourceRow {
  id: string
  name: string
  owner: string
  language: string
  type: string
  subject: string
  downloaded: boolean
}

export interface WizardCollectionView {
  id: string
  name: string
  resources: Array<{ id: string; name: string; type: string; icon: LucideIcon }>
}

export function getResourceIcon(type: string): LucideIcon {
  switch (type) {
    case 'scripture':
      return BookOpen
    case 'words':
      return BookText
    case 'notes':
      return MessageSquare
    case 'words-links':
      return LinkIcon
    default:
      return Library
  }
}

export function metadataToCatalogRow(metadata: ResourceMetadata): CatalogResourceRow | null {
  try {
    return {
      id: metadata.resourceKey,
      name: metadata.title || metadata.resourceKey,
      owner: metadata.owner || 'unknown',
      language: metadata.language || 'en',
      type: String(metadata.type ?? 'unknown'),
      subject: metadata.subject || 'unknown',
      downloaded: true,
    }
  } catch (err) {
    console.error(`❌ Failed to process resource ${metadata.resourceKey}:`, err)
    return null
  }
}

export function buildWizardCollections(
  packages: Array<{
    id: string
    name?: string
    title?: string
    resourceIds?: string[]
    resources?: Array<string | { resourceId?: string; owner?: string; language?: string }>
  }>,
  catalogResources: CatalogResourceRow[]
): WizardCollectionView[] {
  return packages
    .map((pkg) => {
      const idList = (pkg.resources ?? []).map((r) =>
        typeof r === 'string' ? r : `${r.owner ?? ''}/${r.language ?? ''}/${r.resourceId ?? ''}`
      )
      const looseIds = new Set([
        ...idList,
        ...(pkg.resources ?? [])
          .map((r) => (typeof r === 'string' ? r : r.resourceId))
          .filter((id): id is string => !!id),
        ...(pkg.resourceIds ?? []),
      ])
      return {
        id: pkg.id,
        name: pkg.title || pkg.name || pkg.id,
        resources: catalogResources
          .filter((r) => looseIds.has(r.id))
          .map((r) => ({
            id: r.id,
            name: r.name,
            type: r.type || 'unknown',
            icon: getResourceIcon(r.type || 'unknown'),
          })),
      }
    })
    .filter((c) => c.resources.length > 0)
}
