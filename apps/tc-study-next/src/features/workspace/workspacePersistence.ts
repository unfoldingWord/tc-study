/**
 * localStorage load/save for durable workspace package layout only.
 * Wizard / ephemeral UI fields are intentionally excluded.
 */

import {
  ResourceFormat,
  ResourceType,
  type ResourceMetadata,
} from '@bt-synergy/resource-catalog'
import type { ResourceInfo, ResourceTOC } from '../../contexts/types'
import { createResourceInfo } from '../../utils/resourceInfo'
import { ensureCombinedHelpsInWorkspace } from '../helps/ensureCombinedHelps'
import type { PanelConfig, WorkspacePackage } from './workspaceTypes'

export const WORKSPACE_STORAGE_KEY = 'tc-study-workspace'

function canUseLocalStorage(): boolean {
  return typeof localStorage !== 'undefined'
}

/** Serialize package for localStorage (Map → entries). */
export function serializeWorkspacePackage(pkg: WorkspacePackage) {
  return {
    ...pkg,
    resources: Array.from(pkg.resources.entries()),
  }
}

function resourceFromSavedEntry(key: string, res: Record<string, unknown>): ResourceInfo {
  try {
    const metadata = {
      resourceKey: (res.resourceKey as string) || key,
      resourceId:
        (res.resourceId as string) ||
        (res.id as string) ||
        key.split('/')[2] ||
        'unknown',
      server: (res.server as string) || 'git.door43.org',
      owner: (res.owner as string) || key.split('/')[0] || 'unknown',
      language:
        (res.language as string) ||
        (res.languageCode as string) ||
        key.split('/')[1] ||
        'en',
      title: (res.title as string) || 'Unknown Resource',
      subject: (res.subject as string) || (res.resourceId as string) || 'unknown',
      version: (res.version as string) || '1.0.0',
      type: (res.type as string) || 'unknown',
      format: (res.format as string) || 'unknown',
      contentType: (res.contentType as string) || (res.type as string) || 'unknown',
      contentStructure: (res.contentStructure as string) || 'book',
      availability: res.availability || {
        online: false,
        offline: true,
        bundled: false,
        partial: false,
      },
      locations: res.locations || [],
      description: res.description,
      languageTitle: res.languageTitle || res.languageName,
      languageName: res.languageName,
      languageDirection: res.languageDirection,
      readme: res.readme,
      licenseText: res.license,
      contentMetadata:
        res.contentMetadata ||
        (res.ingredients ? { ingredients: res.ingredients } : undefined),
      urls: res.urls || (res.metadata_url ? { metadata: res.metadata_url } : undefined),
      catalogedAt: (res.catalogedAt as string) || new Date().toISOString(),
    } as ResourceMetadata
    return createResourceInfo(metadata, {
      toc: res.toc as ResourceTOC | undefined,
    })
  } catch (error) {
    console.error(`❌ Failed to load resource ${key}:`, error)
    return createResourceInfo({
      resourceKey: key,
      resourceId: key.split('/')[2] || 'unknown',
      server: 'git.door43.org',
      owner: key.split('/')[0] || 'unknown',
      language: key.split('/')[1] || 'en',
      title: `Failed to load: ${key}`,
      subject: 'unknown',
      version: '1.0.0',
      type: ResourceType.UNKNOWN,
      format: ResourceFormat.UNKNOWN,
      contentType: 'unknown',
      contentStructure: 'book',
      availability: { online: false, offline: false, bundled: false, partial: false },
      locations: [],
      catalogedAt: new Date().toISOString(),
    })
  }
}

/** Deserialize + CombinedHelps ensure. Returns null if nothing stored / invalid. */
export function loadPersistedWorkspacePackage(): WorkspacePackage | null {
  if (!canUseLocalStorage()) return null
  try {
    const saved = localStorage.getItem(WORKSPACE_STORAGE_KEY)
    if (!saved) return null

    const data = JSON.parse(saved) as {
      resources?: Array<[string, Record<string, unknown>]>
      panels?: PanelConfig[]
      id?: string
      name?: string
      version?: string
      description?: string
    }

    const resourcesMap = new Map<string, ResourceInfo>(
      (data.resources || []).map(([key, res]) => [key, resourceFromSavedEntry(key, res)])
    )

    const ensured = ensureCombinedHelpsInWorkspace({
      resources: resourcesMap,
      panels: data.panels || [],
    })

    return {
      id: data.id || 'default',
      name: data.name || 'My Workspace',
      version: data.version || '1.0.0',
      description: data.description,
      resources: ensured.resources,
      panels: (ensured.panels.length > 0 ? ensured.panels : data.panels || []) as PanelConfig[],
    }
  } catch (error) {
    console.error('❌ Failed to load saved workspace:', error)
    return null
  }
}

export function persistWorkspacePackage(pkg: WorkspacePackage): void {
  if (!canUseLocalStorage()) return
  try {
    localStorage.setItem(WORKSPACE_STORAGE_KEY, JSON.stringify(serializeWorkspacePackage(pkg)))
  } catch (error) {
    console.error('❌ Failed to auto-save workspace:', error)
  }
}
