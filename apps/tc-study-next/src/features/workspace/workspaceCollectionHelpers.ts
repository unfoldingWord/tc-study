/**
 * Dual-vocab adapters only: live `WorkspacePackage` ↔ persisted named collection
 * (`ResourcePackage` / packageStore). See `lib/stores/stateOwnership.ts`.
 */

import type { ResourceMetadata } from '@bt-synergy/resource-catalog'
import type { ResourceInfo } from '../../contexts/types'
import { createResourceInfo } from '../../utils/resourceInfo'
import { ensureCombinedHelpsInWorkspace } from '../helps/ensureCombinedHelps'
import { DEFAULT_PACKAGE, type PanelConfig, type WorkspacePackage } from './workspaceTypes'

function extractBaseKey(key: string): string {
  if (!key) return ''
  return key.split('#')[0]
}

function parseResourceKey(key: string): { owner: string; language: string; resourceId: string } {
  if (!key) {
    return { owner: 'unknown', language: 'en', resourceId: 'unknown' }
  }
  const baseKey = extractBaseKey(key)
  const parts = baseKey.split('/')
  return {
    owner: parts[0] || 'unfoldingword',
    language: parts[1] || 'en',
    resourceId: parts[parts.length - 1] || '',
  }
}

export interface CollectionResourcePointer {
  server: string
  owner: string
  language: string
  resourceId: string
  displayName?: string
}

export interface CollectionPanelLayout {
  panels: Array<{
    id: string
    title: string
    resourceIds: string[]
    defaultResourceId?: string
  }>
  orientation: 'horizontal'
}

/** Lightweight named collection payload for packageStore. */
export interface NamedCollectionPayload {
  id: string
  title: string
  name: string
  version: string
  description?: string
  status: 'installed'
  createdAt: string
  resources: CollectionResourcePointer[]
  panelLayout: CollectionPanelLayout
}

export function workspaceToNamedCollection(
  pkg: WorkspacePackage,
  options: {
    collectionName: string
    description?: string
    existingId?: string
    existingCreatedAt?: string
  }
): NamedCollectionPayload {
  return {
    id: options.existingId || `collection_${Date.now()}`,
    title: options.collectionName,
    name: options.collectionName,
    version: pkg.version,
    description: options.description || pkg.description,
    status: 'installed',
    createdAt: options.existingCreatedAt || new Date().toISOString(),
    resources: Array.from(pkg.resources.values()).map((resource) => {
      const { owner, language, resourceId } = parseResourceKey(resource.key)
      return {
        server: resource.server || 'https://git.door43.org',
        owner,
        language,
        resourceId,
      }
    }),
    panelLayout: {
      panels: pkg.panels.map((panel) => {
        const baseResourceKeys = panel.resourceKeys.map(extractBaseKey)
        const activeBaseKey = panel.resourceKeys[panel.activeIndex]
          ? extractBaseKey(panel.resourceKeys[panel.activeIndex])
          : baseResourceKeys[0]
        return {
          id: panel.id,
          title: panel.name,
          resourceIds: baseResourceKeys,
          defaultResourceId: activeBaseKey,
        }
      }),
      orientation: 'horizontal',
    },
  }
}

export function namedCollectionToWorkspace(collection: {
  id: string
  name: string
  version: string
  description?: string
  resources?: CollectionResourcePointer[]
  panelLayout?: { panels?: CollectionPanelLayout['panels'] }
}): WorkspacePackage {
  const resources = new Map<string, ResourceInfo>(
    (collection.resources || []).map((res) => {
      const resourceKey = `${res.owner}/${res.language}/${res.resourceId}`
      const metadata = {
        resourceKey,
        resourceId: res.resourceId,
        server: res.server,
        owner: res.owner,
        language: res.language,
        title: res.displayName || res.resourceId,
        subject: 'unknown',
        version: '1.0.0',
        type: 'unknown',
        format: 'unknown',
        contentType: 'unknown',
        contentStructure: 'book' as const,
        availability: {
          online: false,
          offline: false,
          bundled: false,
          partial: false,
        },
        locations: [],
        catalogedAt: new Date().toISOString(),
      } as ResourceMetadata
      return [resourceKey, createResourceInfo(metadata)] as const
    })
  )

  const panels: PanelConfig[] =
    collection.panelLayout?.panels?.map((panel, idx) => ({
      id: panel.id,
      name: panel.title || `Panel ${idx + 1}`,
      resourceKeys: panel.resourceIds || [],
      activeIndex: Math.max(0, panel.resourceIds?.indexOf(panel.defaultResourceId || '') ?? 0),
      position: idx,
    })) || DEFAULT_PACKAGE.panels.map((p) => ({ ...p, resourceKeys: [...p.resourceKeys] }))

  const ensured = ensureCombinedHelpsInWorkspace({ resources, panels })
  return {
    id: collection.id,
    name: collection.name,
    version: collection.version,
    description: collection.description,
    resources: ensured.resources,
    panels: ensured.panels as PanelConfig[],
  }
}
