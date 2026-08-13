/**
 * Read language bootstrap facade — picker state, BG download wiring, auto-load.
 * Heavy work lives in sibling modules:
 * - useReadIngredientHydration
 * - useReadCollectionCompleteness
 * - useReadCatalogLoad
 * - loadReadLanguageCatalog
 * - readLanguageLoadPlan
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
import { useBackgroundDownload, useCatalogBackgroundDownload } from '../../hooks'
import { usePackageStore } from '../../lib/stores/packageStore'
import { clearReadPanelsForLanguageSwitch } from './clearReadPanelsForLanguageSwitch'
import { pushReadLanguageUrl } from './pushReadLanguageUrl'
import {
  applyTextLanguagePickNavigation,
  catalogScopeAfterTextLanguagePick,
  resolveTextLanguagePickNavigation,
} from './textLanguagePickNavigation'
import {
  resolveCatalogNavigationScope,
  textModeMismatchFromCache,
} from './textModeMismatch'
import { useReadTextModeSwitch } from './useReadTextModeSwitch'
import {
  readPersistedHelpsLanguage,
  resolveAndPersistHelpsLanguage,
  writePersistedHelpsLanguage,
} from './defaultHelpsLanguage'
import {
  downloadResetToken,
  shouldCancelDownloadsOnPaneSwitch,
  type DownloadPane,
} from './downloadIsolationPolicy'
import { loadLanguagesCache } from './languagesCache'
import { shouldDeferLanguageCatalogLoad } from './readBootstrapPolicy'
import {
  availabilityLookupFromListed,
  resolveReadCatalogLoadPlan,
} from './readLanguageLoadPlan'
import { useReadCatalogLoad } from './useReadCatalogLoad'
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

  const [shouldAutoOpenLanguagePicker, setShouldAutoOpenLanguagePicker] = useState(requireLanguageInUrl)
  const [isLanguagePickerRequired, setIsLanguagePickerRequired] = useState(requireLanguageInUrl)

  useEffect(() => {
    setShouldAutoOpenLanguagePicker(requireLanguageInUrl)
    setIsLanguagePickerRequired(requireLanguageInUrl)
  }, [requireLanguageInUrl])

  const autoLoadedLanguageForUrlRef = useRef<string | null>(null)
  const [currentLanguageCode, setCurrentLanguageCode] = useState<string | null>(initialLanguage || null)
  const [helpsLanguageCode, setHelpsLanguageCode] = useState<string | null>(() =>
    readPersistedHelpsLanguage()
  )

  const {
    isLoadingTextResources,
    isLoadingHelpsResources,
    expectedResources,
    setExpectedResources,
    metadataUpdateCounter,
    textKeysRef,
    helpsKeysRef,
    runCatalogLoad,
  } = useReadCatalogLoad()

  useEffect(() => {
    resolveAndPersistHelpsLanguage(currentLanguageCode || initialLanguage || '')
  }, [currentLanguageCode, initialLanguage])

  useReadIngredientHydration(loadedResources, catalogManager)
  const isCollectionFullyCached = useReadCollectionCompleteness(
    currentLanguageCode,
    packageStore.packages,
    completenessChecker
  )

  const {
    startDownload,
    stopDownload,
    stats: downloadStats,
    isDownloading: isBackgroundDownloading,
    queue,
  } = useBackgroundDownload({
    autoStart: false,
    skipExisting: true,
    debug: true,
  })
  const isBackgroundDownloadingRef = useRef(isBackgroundDownloading)
  const queueRef = useRef(queue)
  useEffect(() => {
    isBackgroundDownloadingRef.current = isBackgroundDownloading
  }, [isBackgroundDownloading])
  useEffect(() => {
    queueRef.current = queue
  }, [queue])

  const isLoadingResources = isLoadingTextResources
  const isCatalogLoadBusy = isLoadingTextResources || isLoadingHelpsResources

  useCatalogBackgroundDownload({
    catalogManager,
    completenessChecker,
    onStartDownload: startDownload,
    catalogTrigger: `${Object.keys(loadedResources).length}-${metadataUpdateCounter}`,
    expectedResources,
    resetToken: downloadResetToken(currentLanguageCode, helpsLanguageCode),
    isDownloading: isBackgroundDownloading,
    enabled: !DISABLE_BACKGROUND_DOWNLOAD && !isCatalogLoadBusy && Object.keys(loadedResources).length > 0,
    debug: true,
  })

  const maybeCancelDownloads = useCallback(
    (switchedPane: DownloadPane) => {
      if (!isBackgroundDownloadingRef.current) return
      if (
        !shouldCancelDownloadsOnPaneSwitch({
          queue: queueRef.current,
          switchedPane,
          textKeys: textKeysRef.current,
          helpsKeys: helpsKeysRef.current,
        })
      ) {
        return
      }
      stopDownload()
    },
    [stopDownload]
  )

  const handleLanguageSelected = useCallback(
    async (languageCode: string, options?: { navigationScope?: 'scripture' | 'obs' }) => {
      setShouldAutoOpenLanguagePicker(false)
      setIsLanguagePickerRequired(false)
      setCurrentLanguageCode(languageCode)
      maybeCancelDownloads('text')

      const subjects =
        typeof resourceTypeRegistry.getSupportedSubjects === 'function'
          ? resourceTypeRegistry.getSupportedSubjects()
          : []
      const listed = loadLanguagesCache(subjects)
      const availabilityFor = availabilityLookupFromListed(listed)
      const scopeFromUrl = resolveCatalogNavigationScope({
        pathname: typeof window !== 'undefined' ? window.location.pathname : '',
        storeScope: useNavigationStore.getState().navigationScope,
        explicitScope: options?.navigationScope,
      })
      const pick = resolveTextLanguagePickNavigation({
        availability: availabilityFor(languageCode),
        currentScope: scopeFromUrl,
        explicitScope: options?.navigationScope,
      })
      applyTextLanguagePickNavigation(useNavigationStore.getState(), pick)
      const scope = catalogScopeAfterTextLanguagePick(scopeFromUrl, pick)
      pushReadLanguageUrl(navigate, languageCode)

      if (shouldDeferLanguageCatalogLoad(initialLanguage)) {
        return
      }

      if (textModeMismatchFromCache({ languageCode, navigationScope: scope, supportedSubjects: subjects })) {
        textKeysRef.current = []
        setExpectedResources(helpsKeysRef.current)
        clearReadPanelsForLanguageSwitch(helpsLanguageCode ?? undefined, 'panel-1')
        return
      }

      const persisted = resolveAndPersistHelpsLanguage(languageCode)
      const plan = resolveReadCatalogLoadPlan({
        switchedPane: 'text',
        textLanguageCode: languageCode,
        currentHelpsLanguage: helpsKeysRef.current.length === 0 ? null : helpsLanguageCode,
        persistedHelpsLanguage: persisted,
        navigationScope: scope,
        availabilityFor,
      })
      setHelpsLanguageCode(plan.helpsLanguageCode)

      autoLoadedLanguageForUrlRef.current = languageCode
      await runCatalogLoad({
        textLanguageCode: languageCode,
        helpsLanguageCode: plan.helpsLanguageCode,
        loadTarget: plan.loadTarget,
        navigationScope: scope,
      })
    },
    [
      maybeCancelDownloads,
      navigate,
      initialLanguage,
      resourceTypeRegistry,
      helpsLanguageCode,
      runCatalogLoad,
    ]
  )

  const { handleSwitchTextMode, handleNavigatorScopeCommitted } = useReadTextModeSwitch(
    currentLanguageCode,
    handleLanguageSelected
  )

  const handleHelpsLanguageSelected = useCallback(
    async (languageCode: string) => {
      writePersistedHelpsLanguage(languageCode)
      setHelpsLanguageCode(languageCode)
      maybeCancelDownloads('helps')

      const textCode = currentLanguageCode || initialLanguage
      if (!textCode) return

      const navigationScope = useNavigationStore.getState().navigationScope
      const plan = resolveReadCatalogLoadPlan({
        switchedPane: 'helps',
        textLanguageCode: textCode,
        nextHelpsLanguageCode: languageCode,
        currentHelpsLanguage: helpsLanguageCode,
        persistedHelpsLanguage: languageCode,
        navigationScope,
        availabilityFor: () => undefined,
      })

      await runCatalogLoad({
        textLanguageCode: textCode,
        helpsLanguageCode: plan.helpsLanguageCode,
        loadTarget: plan.loadTarget,
        navigationScope,
      })
    },
    [maybeCancelDownloads, currentLanguageCode, initialLanguage, helpsLanguageCode, runCatalogLoad]
  )

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
    isLoadingTextResources,
    isLoadingHelpsResources,
    currentLanguageCode,
    helpsLanguageCode,
    isCollectionFullyCached,
    shouldAutoOpenLanguagePicker,
    isLanguagePickerRequired,
    handleLanguageSelected,
    handleHelpsLanguageSelected,
    handleSwitchTextMode,
    handleNavigatorScopeCommitted,
    isBackgroundDownloading,
    downloadStats,
  }
}
