/**
 * Read language bootstrap facade — picker state, BG download wiring, auto-load.
 * Heavy work lives in sibling modules:
 * - useReadIngredientHydration
 * - useReadCollectionCompleteness
 * - loadReadLanguageCatalog
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  useCatalogManager,
  useCompletenessChecker,
  useNavigationStore,
  useResourceTypeRegistry,
  useViewerRegistry,
} from '../../contexts'
import { useAppStore } from '../../contexts/AppContext'
import { useBackgroundDownload, useCatalogBackgroundDownload, useResourceManagement } from '../../hooks'
import { usePackageStore } from '../../lib/stores/packageStore'
import { useWorkspaceStore } from '../../lib/stores/workspaceStore'
import { buildReadPath, buildReadRouteTailFromNavigation } from '../../utils/readRoutes'
import {
  loadReadLanguageCatalog,
  type LoadReadLanguageCatalogDeps,
} from './loadReadLanguageCatalog'
import { shouldDeferLanguageCatalogLoad } from './readBootstrapPolicy'
import { useReadCollectionCompleteness } from './useReadCollectionCompleteness'
import { useReadIngredientHydration } from './useReadIngredientHydration'

/** Set to true to disable automatic background downloads (e.g. for debugging). */
const DISABLE_BACKGROUND_DOWNLOAD = false

export interface UseReadLanguageBootstrapOptions {
  initialLanguage?: string
  requireLanguageInUrl?: boolean
}

/**
 * Language package load, expected resources, CombinedHelps inject, verification,
 * and background-download wiring for Read.
 */
export function useReadLanguageBootstrap({
  initialLanguage,
  requireLanguageInUrl = false,
}: UseReadLanguageBootstrapOptions = {}) {
  const navigate = useNavigate()
  const catalogManager = useCatalogManager()
  const viewerRegistry = useViewerRegistry()
  const resourceTypeRegistry = useResourceTypeRegistry()
  const completenessChecker = useCompletenessChecker()
  const packageStore = usePackageStore()
  const loadedResources = useAppStore((s) => s.loadedResources)

  const setActiveResourceInPanel = useWorkspaceStore((s) => s.setActiveResourceInPanel)
  const getPanel = useWorkspaceStore((s) => s.getPanel)
  const { addResource } = useResourceManagement()

  const [isLoadingResources, setIsLoadingResources] = useState(false)
  const [expectedResources, setExpectedResources] = useState<string[]>([])
  // Increments each time metadata is added to catalog in Phase 2 (triggers BG download check)
  const [metadataUpdateCounter, setMetadataUpdateCounter] = useState(0)

  // Language picker: always open on `/read` until the user picks a language
  const [shouldAutoOpenLanguagePicker, setShouldAutoOpenLanguagePicker] = useState(requireLanguageInUrl)
  // Clear required immediately on selection so remounted LanguagePicker does not re-open
  const [isLanguagePickerRequired, setIsLanguagePickerRequired] = useState(requireLanguageInUrl)

  useEffect(() => {
    setShouldAutoOpenLanguagePicker(requireLanguageInUrl)
    setIsLanguagePickerRequired(requireLanguageInUrl)
  }, [requireLanguageInUrl])

  // Tracks which URL language the auto-load effect (or in-place picker load) already handled
  const autoLoadedLanguageForUrlRef = useRef<string | null>(null)

  const [currentLanguageCode, setCurrentLanguageCode] = useState<string | null>(initialLanguage || null)

  useReadIngredientHydration(loadedResources, catalogManager)
  const isCollectionFullyCached = useReadCollectionCompleteness(
    currentLanguageCode,
    packageStore.packages,
    completenessChecker
  )

  const { startDownload, stopDownload, stats: downloadStats, isDownloading: isBackgroundDownloading } =
    useBackgroundDownload({
      autoStart: false,
      skipExisting: true,
      debug: true,
    })
  /** Keeps cancel-on-language-change without listing isDownloading in handleLanguageSelected deps. */
  const isBackgroundDownloadingRef = useRef(isBackgroundDownloading)
  useEffect(() => {
    isBackgroundDownloadingRef.current = isBackgroundDownloading
  }, [isBackgroundDownloading])

  useCatalogBackgroundDownload({
    catalogManager,
    completenessChecker,
    onStartDownload: startDownload,
    catalogTrigger: `${Object.keys(loadedResources).length}-${metadataUpdateCounter}`,
    expectedResources,
    resetToken: currentLanguageCode,
    isDownloading: isBackgroundDownloading,
    enabled: !DISABLE_BACKGROUND_DOWNLOAD && !isLoadingResources && Object.keys(loadedResources).length > 0,
    debug: true,
  })

  const handleLanguageSelected = useCallback(
    async (languageCode: string) => {
      setShouldAutoOpenLanguagePicker(false)
      setIsLanguagePickerRequired(false)
      setCurrentLanguageCode(languageCode)

      if (isBackgroundDownloadingRef.current) {
        stopDownload()
      }

      const nav = useNavigationStore.getState()
      const tail = buildReadRouteTailFromNavigation({
        scope: nav.navigationScope,
        mode: nav.navigationMode,
        ref: nav.currentReference,
        passageSet: nav.currentPassageSet,
        section1Based:
          nav.navigationMode === 'section' && nav.currentSectionIndex >= 0 ? nav.currentSectionIndex + 1 : null,
      })
      if (tail) {
        navigate(buildReadPath(languageCode, tail), { replace: true })
      } else {
        navigate(`/read/${languageCode}`, { replace: true })
      }

      // Bare `/read` → `/read/:lang/...` remounts Read; defer catalog load to remounted instance
      if (shouldDeferLanguageCatalogLoad(initialLanguage)) {
        return
      }

      autoLoadedLanguageForUrlRef.current = languageCode
      setIsLoadingResources(true)

      try {
        await loadReadLanguageCatalog({
          languageCode,
          catalogManager: catalogManager as LoadReadLanguageCatalogDeps['catalogManager'],
          resourceTypeRegistry:
            resourceTypeRegistry as LoadReadLanguageCatalogDeps['resourceTypeRegistry'],
          viewerRegistry,
          getPanel,
          addResource,
          setActiveResourceInPanel,
          setExpectedResources,
          onMetadataBatch: (count) => setMetadataUpdateCounter((prev) => prev + count),
        })
      } catch (error) {
        console.error('Error loading resources:', error)
      } finally {
        setIsLoadingResources(false)
      }
    },
    [
      catalogManager,
      resourceTypeRegistry,
      setActiveResourceInPanel,
      addResource,
      getPanel,
      navigate,
      stopDownload,
      viewerRegistry,
      initialLanguage,
    ]
  )

  // Auto-load when URL includes a language segment (once per URL language).
  // handleLanguageSelected must NOT depend on volatile flags like isBackgroundDownloading.
  useEffect(() => {
    if (!initialLanguage) return
    if (autoLoadedLanguageForUrlRef.current === initialLanguage) return
    autoLoadedLanguageForUrlRef.current = initialLanguage
    void handleLanguageSelected(initialLanguage)
  }, [initialLanguage, handleLanguageSelected])

  return {
    loadedResources,
    catalogManager,
    resourceTypeRegistry,
    viewerRegistry,
    packageStore,
    isLoadingResources,
    currentLanguageCode,
    isCollectionFullyCached,
    shouldAutoOpenLanguagePicker,
    isLanguagePickerRequired,
    handleLanguageSelected,
    isBackgroundDownloading,
    downloadStats,
  }
}
