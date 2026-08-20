/**
 * Phase 1: catalog search hits → workspace package + panel membership.
 */

import { ResourceFormat, ResourceType } from '@bt-synergy/resource-catalog'
import type { ResourceInfo } from '../../contexts/types'
import { mapContentFormat } from '../../lib/services/ResourceMetadataFactory'
import {
  panelAssignmentForContentRole,
  type CatalogLoadTarget,
} from './readCatalogPanelPolicy'
import {
  asString,
  catalogIdentity,
  type CatalogEntry,
} from './readCatalogIdentity'
import { existingPanelInstanceId } from '../workspace/projectPanelResourcesToAppStore'
import type { ReadPanelId } from './readPanelModel'

const BOOK_COMPANION_TYPES = new Set([
  'notes',
  'words-links',
  'questions',
  'scripture',
  'obs',
  'obs-notes',
  'obs-words-links',
  'obs-questions',
])

export interface HydrateReadCatalogHitsDeps {
  catalogResults: CatalogEntry[]
  languageCode: string
  target: CatalogLoadTarget
  /** When set, primary/companion land on this panel (two scripture panes stay independent). */
  destPanelId?: ReadPanelId
  resourceTypeRegistry: {
    getTypeForSubject: (subject: string) => string | undefined
    get: (typeId: string) => { contentRole?: string } | undefined
    getScopeForType: (typeId: string) => string | null
  }
  viewerRegistry: { hasViewer: (typeId: string) => boolean }
  getPanel: (panelId: string) => { resourceKeys: string[] } | undefined
  addResource: (
    resource: ResourceInfo,
    options?: { panelId?: string; index?: number; allowMultipleInstances?: boolean }
  ) => void
  setActiveResourceInPanel: (panelId: string, index: number) => void
}

export interface HydrateReadCatalogHitsResult {
  loadedKeys: string[]
  expectedTextKeys: string[]
  expectedHelpsKeys: string[]
}

function bucketForAssignment(
  target: CatalogLoadTarget,
  isPrimary: boolean
): 'text' | 'helps' {
  if (target === 'text') return 'text'
  if (target === 'helps') return 'helps'
  return isPrimary ? 'text' : 'helps'
}

export function hydrateReadCatalogHits(
  deps: HydrateReadCatalogHitsDeps
): HydrateReadCatalogHitsResult {
  const {
    catalogResults,
    languageCode,
    target,
    destPanelId,
    resourceTypeRegistry,
    viewerRegistry,
    getPanel,
    addResource,
    setActiveResourceInPanel,
  } = deps

  const loadedKeys: string[] = []
  const expectedTextKeys: string[] = []
  const expectedHelpsKeys: string[] = []
  const assignedThisPass = new Set<string>()

  for (const entry of catalogResults) {
    const id = catalogIdentity(entry, languageCode)
    if (!id) continue
    const { item, ownerStr, langStr, resourceId, resourceKey, subject } = id
    const typeId = resourceTypeRegistry.getTypeForSubject(subject)
    if (!typeId) continue

    const typeDef = resourceTypeRegistry.get(typeId)
    const isPrimary = typeDef?.contentRole === 'primary'
    const hasViewer = viewerRegistry.hasViewer(typeId)
    const assignment = panelAssignmentForContentRole(
      typeDef?.contentRole,
      target,
      hasViewer,
      destPanelId
    )
    if (assignment.kind === 'skip') continue

    const type = typeId as ResourceType
    const format = mapContentFormat(
      asString(item.content_format) || asString(item.format) || 'usfm'
    )
    const scopeForType = resourceTypeRegistry.getScopeForType(typeId)
    const appliesToScope =
      scopeForType === 'scripture' || scopeForType === 'obs' ? scopeForType : ('shared' as const)
    const abbreviation = asString(item.abbreviation).trim() || undefined
    const catalogIngredients = (item.ingredients ?? item.repo?.ingredients) as
      | ResourceInfo['ingredients']
      | undefined
    const contentStructure: 'book' | 'entry' =
      BOOK_COMPANION_TYPES.has(typeId) || subject.toLowerCase().includes('bible')
        ? 'book'
        : 'entry'

    if (assignment.kind === 'panel') {
      const passKey = `${assignment.panelId}:${resourceKey}`
      if (
        assignedThisPass.has(passKey) ||
        existingPanelInstanceId(getPanel(assignment.panelId)?.resourceKeys, resourceKey)
      ) {
        continue
      }
      assignedThisPass.add(passKey)
    }

    const basicResourceInfo: ResourceInfo = {
      id: resourceKey,
      key: resourceKey,
      resourceKey: resourceKey,
      title: asString(item.title) || asString(entry.title) || resourceKey,
      type,
      category: subject || 'Unknown',
      subject: subject || 'Unknown',
      owner: ownerStr,
      language: langStr,
      languageCode: langStr,
      languageName: asString(item.language_title) || langStr,
      resourceId: resourceId,
      ...(abbreviation ? { abbreviation } : {}),
      server: 'git.door43.org',
      format,
      contentType: format === ResourceFormat.USFM ? 'text/usfm' : 'text/markdown',
      contentStructure,
      version: item.release?.tag_name ?? '1.0',
      description: asString(item.description) || asString(item.repo?.description) || undefined,
      release: (item.release ?? item.catalog?.prod) as ResourceInfo['release'],
      ingredients: catalogIngredients,
      availability: { online: true, offline: false, bundled: false, partial: false },
      locations: [],
      catalogedAt: new Date().toISOString(),
      appliesToScope,
    }

    loadedKeys.push(resourceKey)
    if (bucketForAssignment(target, isPrimary) === 'text') {
      expectedTextKeys.push(resourceKey)
    } else {
      expectedHelpsKeys.push(resourceKey)
    }

    if (assignment.kind === 'panel') {
      const currentPanel = getPanel(assignment.panelId)
      const currentIndex = currentPanel?.resourceKeys.length || 0
      addResource(basicResourceInfo, {
        panelId: assignment.panelId,
        index: currentIndex,
        // Same-language dual scripture: second pane gets ult#2 so LinkedPanels ids stay unique.
        allowMultipleInstances: true,
      })
      if (currentIndex === 0) {
        setActiveResourceInPanel(assignment.panelId, 0)
      }
    } else {
      addResource(basicResourceInfo)
    }
  }

  return { loadedKeys, expectedTextKeys, expectedHelpsKeys }
}
