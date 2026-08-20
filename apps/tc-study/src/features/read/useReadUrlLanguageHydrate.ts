/**
 * External-only language hydrate for Read (first load, paste, popstate).
 * In-app replaceState must not re-enter this path.
 */

import { useEffect, useRef } from 'react'
import { useLocation } from 'react-router-dom'
import { canonicalReadLanguageCode } from '../../utils/languageCodeMatch'
import { languageCodesFromReadPathname, resolveReadLanguageFromUrlOrCache } from './readBootstrapPolicy'
import { navigationLanguageCode } from './readPanelModel'
import { useReadPanelStore } from './readPanelStore'
import { getReadNavigationSource, shouldHydrateReadLanguages } from './replaceReadUrlFromUi'

export function useReadUrlLanguageHydrate(options: {
  initialLanguage?: string
  handleLanguageSelected: (languageCode: string) => void
}): void {
  const location = useLocation()
  const hydrateLanguagesFromUrl = useReadPanelStore((s) => s.hydrateLanguagesFromUrl)
  const autoLoadedLanguageForUrlRef = useRef<string | null>(null)

  useEffect(() => {
    if (!shouldHydrateReadLanguages(getReadNavigationSource())) return
    const pathname = location.pathname
    const cached = navigationLanguageCode(useReadPanelStore.getState().panels)
    const resolved = resolveReadLanguageFromUrlOrCache({
      pathname,
      cachedLanguage: cached,
    })
    const pathLangs = languageCodesFromReadPathname(pathname)
    // Path langs only — cache is not a single-lang URL (that would overwrite
    // persisted p2 on bare `/read`). Empty path → inherit-empty only.
    hydrateLanguagesFromUrl(pathLangs)
    const raw = pathLangs[0] || resolved.language || options.initialLanguage?.trim()
    if (!raw) return
    const lang = canonicalReadLanguageCode(raw)
    const sig = pathLangs.length > 0 ? pathLangs.join(',') : lang
    if (autoLoadedLanguageForUrlRef.current === sig) return
    autoLoadedLanguageForUrlRef.current = sig
    options.handleLanguageSelected(lang)
  }, [
    location.pathname,
    options.initialLanguage,
    options.handleLanguageSelected,
    hydrateLanguagesFromUrl,
  ])
}
