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
import { canonicalReadLanguageCode, languageCodesMatch } from '../../utils/languageCodeMatch'
import { pushReadLanguageUrl } from './pushReadLanguageUrl'
import {
  applyTextLanguagePickNavigation,
  catalogScopeAfterTextLanguagePick,
  resolveTextLanguagePickNavigation,
} from './textLanguagePickNavigation'
import {
  skipTextCatalogOnMismatch,
  supportedSubjectsFromRegistry,
} from './scriptureLanguageMismatch'
import { resolveCatalogNavigationScope } from './textModeMismatch'
import { useReadTextModeSwitch } from './useReadTextModeSwitch'
import { writePersistedHelpsLanguage } from './defaultHelpsLanguage'
import { firstHelpsLanguageCode, navigationLanguageCode } from './readPanelModel'
import { canSeedBothPanelLanguages, useReadPanelStore } from './readPanelStore'
import {
  downloadResetToken,
  shouldCancelDownloadsOnPaneSwitch,
  type DownloadPane,
} from './downloadIsolationPolicy'
import { loadLanguagesCache } from './languagesCache'
import { resolveReadLanguageFromUrlOrCache, shouldPushReadLanguageUrl } from './readBootstrapPolicy'
import { availabilityLookupFromListed } from './readLanguageLoadPlan'
import { catalogLoadForSinglePanel, coldStartCatalogLoads } from './runReadPanelCatalog'
import { useReadCatalogLoad } from './useReadCatalogLoad'
import { useReadCollectionCompleteness } from './useReadCollectionCompleteness'
import { useReadIngredientHydration } from './useReadIngredientHydration'
import { useReadPanelLanguageHandlers } from './useReadPanelLanguageHandlers'

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
    setIsLanguagePickerRequired(requireLanguageInUrl)
    if (requireLanguageInUrl) setShouldAutoOpenLanguagePicker(true)
  }, [requireLanguageInUrl])

  useEffect(() => {
    if (!shouldAutoOpenLanguagePicker) return
    const id = window.setTimeout(() => setShouldAutoOpenLanguagePicker(false), 400)
    return () => window.clearTimeout(id)
  }, [shouldAutoOpenLanguagePicker])

  const autoLoadedLanguageForUrlRef = useRef<string | null>(null)
  const panels = useReadPanelStore((s) => s.panels)
  const seedBothLanguages = useReadPanelStore((s) => s.seedBothLanguages)
  const setPanelLanguage = useReadPanelStore((s) => s.setPanelLanguage)
  const inheritEmptyLanguage = useReadPanelStore((s) => s.inheritEmptyLanguage)
  const hydrateLanguagesFromHint = useReadPanelStore((s) => s.hydrateLanguagesFromHint)
  const currentLanguageCode =
    navigationLanguageCode(panels) || initialLanguage || null
  const helpsLanguageCode = firstHelpsLanguageCode(panels)

  const {
    isLoadingTextResources,
    isLoadingHelpsResources,
    isLoadingByPanel,
    catalogSettledByPanel,
    resetCatalogSettled,
    markCatalogSettled,
    expectedResources,
    setExpectedResources,
    metadataUpdateCounter,
    textKeysRef,
    helpsKeysRef,
    runCatalogLoad,
  } = useReadCatalogLoad()

  useEffect(() => {
    const helps = firstHelpsLanguageCode(useReadPanelStore.getState().panels)
    if (helps) writePersistedHelpsLanguage(helps)
  }, [helpsLanguageCode])

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
    resetToken: downloadResetToken(panels['panel-1'].languageCode, panels['panel-2'].languageCode),
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
      const resolvedCode = canonicalReadLanguageCode(languageCode)
      setShouldAutoOpenLanguagePicker(false)
      setIsLanguagePickerRequired(false)
      if (canSeedBothPanelLanguages()) {
        seedBothLanguages(resolvedCode)
      } else if (useReadPanelStore.getState().panels['panel-1'].languageCode !== resolvedCode) {
        setPanelLanguage('panel-1', resolvedCode)
      }
      inheritEmptyLanguage()
      maybeCancelDownloads('text')

      const subjects = supportedSubjectsFromRegistry(resourceTypeRegistry)
      const listed = loadLanguagesCache(subjects)
      const availabilityFor = availabilityLookupFromListed(listed)
      const scopeFromUrl = resolveCatalogNavigationScope({
        pathname: typeof window !== 'undefined' ? window.location.pathname : '',
        storeScope: useNavigationStore.getState().navigationScope,
        explicitScope: options?.navigationScope,
      })
      const pick = resolveTextLanguagePickNavigation({
        availability: availabilityFor(resolvedCode),
        currentScope: scopeFromUrl,
        explicitScope: options?.navigationScope,
      })
      applyTextLanguagePickNavigation(useNavigationStore.getState(), pick)
      const scope = catalogScopeAfterTextLanguagePick(scopeFromUrl, pick)
      const pathname = typeof window !== 'undefined' ? window.location.pathname : ''
      if (shouldPushReadLanguageUrl(pathname, resolvedCode)) {
        pushReadLanguageUrl(navigate, resolvedCode)
      }

      autoLoadedLanguageForUrlRef.current = resolvedCode
      if (
        skipTextCatalogOnMismatch({
          languageCode: resolvedCode,
          navigationScope: scope,
          supportedSubjects: subjects,
          panelId: 'panel-1',
          helpsLanguageCode: helpsLanguageCode ?? undefined,
          textKeysRef,
          helpsKeysRef,
          setExpectedResources,
        })
      ) {
        const helpsLoad = catalogLoadForSinglePanel(useReadPanelStore.getState().panels, 'panel-2')
        if (helpsLoad) await runCatalogLoad({ ...helpsLoad, navigationScope: scope })
        markCatalogSettled(helpsLoad ? ['panel-1'] : ['panel-1', 'panel-2'])
        return
      }

      const loads = coldStartCatalogLoads(useReadPanelStore.getState().panels)
      await Promise.all(loads.map((one) => runCatalogLoad({ ...one, navigationScope: scope })))
    },
    [
      maybeCancelDownloads,
      navigate,
      resourceTypeRegistry,
      helpsLanguageCode,
      runCatalogLoad,
      markCatalogSettled,
      seedBothLanguages,
      setPanelLanguage,
      inheritEmptyLanguage,
    ]
  )

  const { handleSwitchTextMode, handleNavigatorScopeCommitted } = useReadTextModeSwitch(
    currentLanguageCode,
    handleLanguageSelected
  )

  const {
    handlePanelLanguageSelected,
    handlePanelModeSwitch,
    handleHelpsLanguageSelected,
  } = useReadPanelLanguageHandlers({
    maybeCancelDownloads,
    runCatalogLoad,
    markCatalogSettled,
    setExpectedResources,
    textKeysRef,
    helpsKeysRef,
    helpsLanguageCode,
    inheritEmptyLanguage,
  })

  useEffect(() => {
    const pathname = typeof window !== 'undefined' ? window.location.pathname : ''
    const cached = navigationLanguageCode(useReadPanelStore.getState().panels)
    const resolved = resolveReadLanguageFromUrlOrCache({
      pathname,
      cachedLanguage: cached,
    })
    const raw = initialLanguage?.trim() || resolved.language
    if (!raw) return
    const lang = canonicalReadLanguageCode(raw)
    hydrateLanguagesFromHint(lang)
    if (
      autoLoadedLanguageForUrlRef.current &&
      languageCodesMatch(autoLoadedLanguageForUrlRef.current, lang)
    ) {
      return
    }
    autoLoadedLanguageForUrlRef.current = lang
    void handleLanguageSelected(lang)
  }, [initialLanguage, handleLanguageSelected, hydrateLanguagesFromHint])

  useEffect(() => {
    resetCatalogSettled()
  }, [panels['panel-1'].languageCode, panels['panel-2'].languageCode, resetCatalogSettled])

  useEffect(() => {
    const inheritedId = inheritEmptyLanguage()
    if (!inheritedId) return
    const one = catalogLoadForSinglePanel(useReadPanelStore.getState().panels, inheritedId)
    if (!one) return
    const navigationScope = useNavigationStore.getState().navigationScope
    void runCatalogLoad({ ...one, navigationScope })
  }, [
    panels['panel-1'].languageCode,
    panels['panel-2'].languageCode,
    inheritEmptyLanguage,
    runCatalogLoad,
  ])

  return {
    loadedResources,
    catalogManager,
    resourceTypeRegistry,
    viewerRegistry,
    packageStore,
    isLoadingResources,
    isLoadingTextResources,
    isLoadingHelpsResources,
    isLoadingByPanel,
    catalogSettledByPanel,
    currentLanguageCode,
    helpsLanguageCode,
    isCollectionFullyCached,
    shouldAutoOpenLanguagePicker,
    isLanguagePickerRequired,
    handleLanguageSelected,
    handleHelpsLanguageSelected,
    handlePanelLanguageSelected,
    handlePanelModeSwitch,
    handleSwitchTextMode,
    handleNavigatorScopeCommitted,
    isBackgroundDownloading,
    downloadStats,
  }
}
