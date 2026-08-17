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
    const langs =
      pathLangs.length > 0 ? pathLangs : resolved.language ? [resolved.language] : []
    const raw = langs[0] || options.initialLanguage?.trim()
    if (!raw) return
    const lang = canonicalReadLanguageCode(raw)
    const applied = langs.length > 0 ? langs : [lang]
    hydrateLanguagesFromUrl(applied)
    const sig = applied.join(',')
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
