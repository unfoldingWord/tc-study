/**
 * Catalog search → Phase 1 panel hydrate → Phase 2 metadata + collection save.
 * Extracted from useReadLanguageBootstrap so the hook stays a thin orchestrator.
 */

import type { CatalogManager } from '@bt-synergy/catalog-manager'
import { getDoor43ApiClient } from '@bt-synergy/door43-api'
import { ResourceFormat, ResourceType } from '@bt-synergy/resource-catalog'
import type { ResourceTypeRegistry } from '@bt-synergy/resource-types'
import { useAppStore } from '../../contexts/AppContext'
import type { ResourceInfo } from '../../contexts/types'
import {
  createResourceMetadata,
  mapContentFormat,
  type Door43Resource,
} from '../../lib/services/ResourceMetadataFactory'
import { useWorkspaceStore } from '../../lib/stores/workspaceStore'
import { isOriginalLanguageResource } from '../../utils/resourceHelpers'
import { applyCombinedHelpsEnsure } from '../helps/applyCombinedHelpsEnsure'
import { narrowExpectedToCataloged } from './catalogBackgroundDownloadPolicy'
import { clearReadPanelsForLanguageSwitch } from './clearReadPanelsForLanguageSwitch'

/** Door43 catalog search hit (fields vary by endpoint / nested repo). */
type CatalogEntry = {
  repo?: CatalogEntry
  catalog?: { prod?: CatalogEntry['release'] }
  owner?: unknown
  name?: unknown
  repo_name?: unknown
  title?: unknown
  language?: unknown
  language_code?: unknown
  language_title?: unknown
  identifier?: unknown
  subject?: unknown
  content_format?: unknown
  format?: unknown
  description?: unknown
  metadata_url?: unknown
  ingredients?: ResourceInfo['ingredients']
  release?: {
    tag_name?: string
    zipball_url?: string
    tarball_url?: string
    published_at?: string
    html_url?: string
  }
  [key: string]: unknown
}

function asString(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback
}

export interface LoadReadLanguageCatalogDeps {
  languageCode: string
  catalogManager: CatalogManager
  resourceTypeRegistry: ResourceTypeRegistry
  viewerRegistry: { hasViewer: (typeId: string) => boolean }
  getPanel: (panelId: string) => { resourceKeys: string[] } | undefined
  /** Prefer `{ panelId }` atomic path when assigning to a panel. */
  addResource: (
    resource: ResourceInfo,
    options?: { panelId?: string; index?: number; allowMultipleInstances?: boolean }
  ) => void
  setActiveResourceInPanel: (panelId: string, index: number) => void
  setExpectedResources: (keys: string[]) => void
  onMetadataBatch: (count: number) => void
}

function ownerField(value: unknown): string | undefined {
  if (typeof value === 'string') return value
  if (value && typeof value === 'object') {
    const o = value as { login?: unknown; username?: unknown }
    if (typeof o.login === 'string') return o.login
    if (typeof o.username === 'string') return o.username
  }
  return undefined
}

function catalogIdentity(entry: CatalogEntry, languageCode: string) {
  const item: CatalogEntry = entry.repo ? { ...entry, ...entry.repo } : entry
  const repoName = asString(item.name) || asString(item.repo_name)
  if (!repoName) return null

  const ownerStr =
    ownerField(item.owner) ?? ownerField(entry.owner) ?? 'unknown'
  const langStr =
    asString(item.language) || asString(item.language_code) || languageCode
  const resourceId =
    asString(item.identifier) ||
    (repoName.includes('_') ? repoName.split('_').slice(1).join('_') : repoName)
  const resourceKey = `${ownerStr}/${langStr}/${resourceId}`
  const subjectRaw = item.subject ?? ''
  const subject = String((Array.isArray(subjectRaw) ? subjectRaw[0] : subjectRaw) ?? '').trim()

  return { item, repoName, ownerStr, langStr, resourceId, resourceKey, subject }
}

const ORIGINAL_RESOURCES = [
  { lang: 'el-x-koine', id: 'ugnt', label: 'UGNT', subject: 'Greek New Testament' },
  { lang: 'hbo', id: 'uhb', label: 'UHB', subject: 'Hebrew Old Testament' },
] as const

/**
 * Load tc-ready catalog resources for a language into workspace + panels,
 * then hydrate metadata and save `${lang}_tc-helps` collection in the background.
 */
export async function loadReadLanguageCatalog(deps: LoadReadLanguageCatalogDeps): Promise<void> {
  const {
    languageCode,
    catalogManager,
    resourceTypeRegistry,
    viewerRegistry,
    getPanel,
    addResource,
    setActiveResourceInPanel,
    setExpectedResources,
    onMetadataBatch,
  } = deps

  // Drop prior-language expected keys immediately so BG download cannot wait on a stale set.
  setExpectedResources([])

  // Atomic clear — avoid per-key reconcile re-injecting English CombinedHelps
  // from package leftovers while panels are emptied.
  clearReadPanelsForLanguageSwitch(languageCode)

  const door43Client = getDoor43ApiClient()
  const searchParams = {
    language: languageCode,
    topic: 'tc-ready',
    stage: 'prod' as const,
    limit: 500,
  }
  const catalogResults = await door43Client.searchCatalog(searchParams)

  if (catalogResults.length === 0) {
    console.warn(
      '⚠️ No catalog results. The API may not support topic=tc-ready, or use a different topic value. Check the Network tab for the actual request (e.g. /api/v1/catalog/search?lang=...&topic=tc-ready&stage=prod&limit=500).'
    )
  }

  // Collect expected resource keys BEFORE processing (deterministic BG download wait)
  const expectedResourceKeys: string[] = []
  for (const entry of catalogResults) {
    const id = catalogIdentity(entry, languageCode)
    if (!id) continue
    const type = resourceTypeRegistry.getTypeForSubject(id.subject)
    if (type) expectedResourceKeys.push(id.resourceKey)
  }
  expectedResourceKeys.push('unfoldingWord/el-x-koine/ugnt', 'unfoldingWord/hbo/uhb')
  setExpectedResources(expectedResourceKeys)

  // PHASE 1: Add resources immediately with basic info (for instant UI)
  const loadedResourceKeys: string[] = []

  for (const entry of catalogResults) {
    const id = catalogIdentity(entry, languageCode)
    if (!id) continue
    const { item, ownerStr, langStr, resourceId, resourceKey, subject } = id
    const typeId = resourceTypeRegistry.getTypeForSubject(subject)
    if (!typeId) continue

    // Use registry typeId directly as the authoritative subject → type mapping.
    // The ResourceType enum only covers base types; app-level types like
    // 'obs-words-links' live only in the registry.
    const type = typeId as ResourceType
    const format = mapContentFormat(
      asString(item.content_format) || asString(item.format) || 'usfm'
    )
    const scopeForType = resourceTypeRegistry.getScopeForType(typeId)
    const appliesToScope =
      scopeForType === 'scripture' || scopeForType === 'obs' ? scopeForType : ('shared' as const)
    const abbreviation = asString(item.abbreviation).trim() || undefined

    const catalogIngredients = item.ingredients ?? item.repo?.ingredients
    // Book-companion helps (TN/TWL/TQ) ship per-book files even though their Door43
    // subject strings don't contain "bible". Mark them book-structured so Phase 1
    // tab filtering can use ingredients immediately (avoids TQ flash-then-hide).
    const isBookCompanionType =
      typeId === 'notes' ||
      typeId === 'words-links' ||
      typeId === 'questions' ||
      typeId === 'scripture' ||
      typeId === 'obs' ||
      typeId === 'obs-notes' ||
      typeId === 'obs-words-links' ||
      typeId === 'obs-questions'
    const contentStructure: 'book' | 'entry' =
      isBookCompanionType || subject.toLowerCase().includes('bible') ? 'book' : 'entry'
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

    loadedResourceKeys.push(resourceKey)

    const hasViewer = viewerRegistry.hasViewer(typeId)
    if (hasViewer) {
      const typeDef = resourceTypeRegistry.get(typeId)
      const isPrimary = typeDef?.contentRole === 'primary'
      const panelId = isPrimary ? 'panel-1' : 'panel-2'
      const currentPanel = getPanel(panelId)
      const currentIndex = currentPanel?.resourceKeys.length || 0
      // Atomic add+assign (no add-then-assign dual-write)
      addResource(basicResourceInfo, { panelId, index: currentIndex })
      if (currentIndex === 0) {
        setActiveResourceInPanel(panelId, 0)
      }
    } else {
      // Modal/catalog-only — package membership; entry modals load metadata from catalog
      addResource(basicResourceInfo)
    }
  }

  // PHASE 2: Fetch metadata in background; batch store updates
  const metadataPromises = catalogResults.map(async (entry): Promise<ResourceInfo | null> => {
    const id = catalogIdentity(entry, languageCode)
    if (!id) return null
    const { item, ownerStr, langStr, resourceId, resourceKey, subject, repoName } = id
    const type = resourceTypeRegistry.getTypeForSubject(subject)
    if (!type) return null

    const release = item.release ?? item.catalog?.prod
    if (!release?.tag_name) return null

    try {
      const abbreviation = asString(item.abbreviation).trim() || undefined
      const door43Resource = {
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
        ingredients: item.ingredients ?? item.repo?.ingredients,
        release,
        server: 'git.door43.org',
        html_url: item.html_url ?? entry.html_url ?? release?.html_url,
      }

      const metadata = await createResourceMetadata(door43Resource as Door43Resource, {
        resourceTypeRegistry,
        getResourceType: () => type,
        catalogAdapter: catalogManager.catalogAdapter,
        debug: false,
      })

      await catalogManager.addResourceToCatalog(metadata)

      const existingResource = useAppStore.getState().loadedResources[resourceKey]
      if (existingResource) {
        return {
          ...existingResource,
          ...metadata,
          id: existingResource.id,
          key: existingResource.key,
          toc: existingResource.toc,
        }
      }
      return null
    } catch (error) {
      console.warn(`⚠️ Failed to load metadata for ${resourceKey}:`, error)
      return null
    }
  })

  for (const orig of ORIGINAL_RESOURCES) {
    const resourceKey = `unfoldingWord/${orig.lang}/${orig.id}`
    const basicResourceInfo: ResourceInfo = {
      id: resourceKey,
      key: resourceKey,
      resourceKey: resourceKey,
      title: orig.label,
      type: ResourceType.SCRIPTURE,
      category: 'Bible',
      subject: orig.subject,
      owner: 'unfoldingWord',
      language: orig.lang,
      languageCode: orig.lang,
      languageName: orig.label,
      resourceId: orig.id,
      server: 'git.door43.org',
      format: ResourceFormat.USFM,
      contentType: 'text/usfm',
      contentStructure: 'book',
      version: '1.0',
      availability: { online: true, offline: false, bundled: false, partial: false },
      locations: [],
      catalogedAt: new Date().toISOString(),
      appliesToScope: 'scripture',
    }

    loadedResourceKeys.push(resourceKey)

    const currentPanel = getPanel('panel-1')
    const currentIndex = currentPanel?.resourceKeys.length || 0
    addResource(basicResourceInfo, { panelId: 'panel-1', index: currentIndex })
  }

  // CombinedHelps after GL + UGNT/UHB hydrate so original-lang adds cannot clobber
  // the gateway TN/TWL pair selected for `languageCode`.
  loadedResourceKeys.push(...applyCombinedHelpsEnsure(languageCode))

  // Prefer gateway scripture/OBS as the visible panel-1 tab (not UGNT/UHB).
  const panel1After = getPanel('panel-1')
  const pkgAfter = useWorkspaceStore.getState().currentPackage
  if (panel1After && pkgAfter) {
    const gatewayIdx = panel1After.resourceKeys.findIndex((key) => {
      const r = pkgAfter.resources.get(key) || pkgAfter.resources.get(key.replace(/#\d+$/, ''))
      if (!r) return false
      const type = String(r.type || '')
      if (type !== 'scripture' && type !== 'obs') return false
      const lang = String(r.languageCode || r.language || '')
      return !isOriginalLanguageResource(lang, r.subject || '')
    })
    if (gatewayIdx >= 0) {
      setActiveResourceInPanel('panel-1', gatewayIdx)
    }
  }

  const originalMetadataPromises = ORIGINAL_RESOURCES.map(async (orig): Promise<ResourceInfo | null> => {
    const resourceKey = `unfoldingWord/${orig.lang}/${orig.id}`
    try {
      const catalogEntry = await (catalogManager.catalogAdapter as { get: (k: string) => Promise<unknown> }).get(
        resourceKey
      )

      if (!catalogEntry) {
        const results = await catalogManager.door43Client.searchCatalog({
          owner: 'unfoldingWord',
          lang: orig.lang,
          subject: orig.subject,
          stage: 'prod',
          limit: 1,
        })

        if (results && results.length > 0) {
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

          const existingResource = useAppStore.getState().loadedResources[resourceKey]
          if (existingResource) {
            return {
              ...existingResource,
              ...metadata,
              id: existingResource.id,
              key: existingResource.key,
              toc: existingResource.toc,
            }
          }
        }
      }
    } catch (error) {
      console.warn(`⚠️ Failed to load metadata for ${resourceKey}:`, error)
    }
    return null
  })

  void Promise.allSettled([...metadataPromises, ...originalMetadataPromises]).then(async (results) => {
    const toAdd: ResourceInfo[] = []
    for (const result of results) {
      if (result.status === 'fulfilled' && result.value) {
        toAdd.push(result.value)
      }
    }
    if (toAdd.length > 0) {
      // Enrichment-only (no membership create) — projector owns AppStore upserts
      useAppStore.getState().patchLoadedResources(toAdd)
    }

    // Narrow expected set to keys that actually entered the catalog so one failed
    // metadata fetch cannot block background download for the whole language.
    try {
      const keysInCatalog = await catalogManager.getAllResourceKeys()
      setExpectedResources(narrowExpectedToCataloged(expectedResourceKeys, keysInCatalog))
    } catch (error) {
      console.warn(`⚠️ Failed to narrow expected resources for ${languageCode}:`, error)
    }

    // Always bump the catalog trigger after Phase 2 settles (even if toAdd is empty)
    // so language-switch / deep-link loads re-run the BG download check.
    onMetadataBatch(Math.max(toAdd.length, 1))

    try {
      const collectionName = `${languageCode}_tc-helps`
      await useWorkspaceStore.getState().saveAsCollection(collectionName, `Translation helps for ${languageCode}`)
    } catch (error) {
      console.error(`❌ Failed to create collection for ${languageCode}:`, error)
    }
  })
}
