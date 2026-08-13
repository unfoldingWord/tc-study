import { getDoor43ApiClient } from '@bt-synergy/door43-api'
import { useEffect, useMemo, useRef, useState } from 'react'
import {
  useCatalogManager,
  useResourceTypeRegistry,
  useViewerRegistry,
} from '../../../contexts'
import { useWorkspaceStore } from '../../../lib/stores/workspaceStore'
import { useWizardStore } from '../../../lib/stores/wizardStore'
import { excludeOriginalLanguageSubjects } from '../../../utils/resourceHelpers'
import { processSupportedResourceDependencies } from './resourceSelectorDeps'
import { addDoor43CatalogResults } from './resourceSelectorDoor43'
import {
  addCatalogResultToMap,
  buildResourceInfoMap,
  getWorkspaceResourceKeys,
  mergeWorkspaceOriginalLanguageResources,
  partitionResourcesByLanguageSupport,
} from './resourceSelectorLoadHelpers'
import type { ResourceWithStatus } from './types'

export function useResourceSelectorLoad() {
  const [isLoading, setIsLoading] = useState(false)
  const loadingRef = useRef(false)
  const lastLoadKey = useRef('')

  const catalogManager = useCatalogManager()
  const viewerRegistry = useViewerRegistry()
  const resourceTypeRegistry = useResourceTypeRegistry()

  const selectedLanguages = useWizardStore((state) => state.selectedLanguages)
  const selectedOrganizations = useWizardStore((state) => state.selectedOrganizations)
  const availableResources = useWizardStore((state) => state.availableResources)
  const selectedResourceKeys = useWizardStore((state) => state.selectedResourceKeys)
  const toggleResource = useWizardStore((state) => state.toggleResource)
  const setAvailableResources = useWizardStore((state) => state.setAvailableResources)
  const hasResourceInPackage = useWorkspaceStore((state) => state.hasResourceInPackage)

  const loadKey = useMemo(() => {
    const langs = Array.from(selectedLanguages).sort().join(',')
    const orgs = Array.from(selectedOrganizations).sort().join(',')
    return `${langs}|${orgs}`
  }, [selectedLanguages, selectedOrganizations])

  const loadResources = async () => {
    loadingRef.current = true
    setIsLoading(true)
    try {
      const allSupportedSubjects = resourceTypeRegistry.getSupportedSubjects()
      const supportedSubjects = excludeOriginalLanguageSubjects(allSupportedSubjects)
      const allResources = new Map<string, ResourceWithStatus>()
      const door43Client = getDoor43ApiClient({ debug: false })

      const catalogDeps = { viewerRegistry, catalogManager, hasResourceInPackage }
      const catalogPromises = Array.from(selectedLanguages).map(async (languageCode) => {
        const catalogResults = await catalogManager.searchCatalog({ language: languageCode })
        for (const metadata of catalogResults) {
          await addCatalogResultToMap(allResources, metadata, catalogDeps)
        }
      })

      const door43Promise = (async () => {
        try {
          const catalogResults = await door43Client.searchCatalog({
            owner: Array.from(selectedOrganizations),
            language: Array.from(selectedLanguages),
            subjects: supportedSubjects,
            stage: 'prod',
            topic: 'tc-ready',
          })
          addDoor43CatalogResults(
            catalogResults,
            allResources,
            supportedSubjects,
            hasResourceInPackage
          )
        } catch (error) {
          console.error(`❌ Failed to fetch Door43 resources:`, error)
        }
      })()

      await Promise.all([...catalogPromises, door43Promise])

      const { supportedResources, originalLanguageResources } =
        partitionResourcesByLanguageSupport(allResources)

      const workspaceResources = useWorkspaceStore.getState().currentPackage?.resources || new Map()
      mergeWorkspaceOriginalLanguageResources(originalLanguageResources, workspaceResources)

      await processSupportedResourceDependencies(
        supportedResources,
        originalLanguageResources,
        workspaceResources,
        { catalogManager, resourceTypeRegistry, viewerRegistry }
      )

      const resourceInfoMap = buildResourceInfoMap(supportedResources, hasResourceInPackage)
      setAvailableResources(resourceInfoMap)

      const resourcesInWorkspace = getWorkspaceResourceKeys(supportedResources, hasResourceInPackage)
      if (resourcesInWorkspace.length > 0) {
        resourcesInWorkspace.forEach((key) => {
          const resource = resourceInfoMap.get(key)
          if (resource && !selectedResourceKeys.has(key)) {
            toggleResource(key, resource)
          }
        })
      }
    } catch (error) {
      console.error('❌ Failed to load resources:', error)
    } finally {
      setIsLoading(false)
      loadingRef.current = false
    }
  }

  useEffect(() => {
    if (loadingRef.current) {
      return
    }

    if (lastLoadKey.current === loadKey) {
      return
    }

    if (selectedLanguages.size > 0 && selectedOrganizations.size > 0) {
      lastLoadKey.current = loadKey
      loadResources()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loadKey])

  return { isLoading, availableResources }
}

export { useResourceSelectorToggle } from './useResourceSelectorToggle'
