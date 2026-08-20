/**
 * Read Page - Simplified reading experience
 */

import { useLocation } from 'react-router-dom'
import { SimplifiedReadView } from '../components/read/SimplifiedReadView'
import { resolveReadLanguageFromUrlOrCache } from '../features/read/readBootstrapPolicy'
import { navigationLanguageCode } from '../features/read/readPanelModel'
import { useReadPanelStore } from '../features/read/readPanelStore'
import { parseReadUrl } from '../features/read/readUrlGrammar'
import { resolveReadRouteFromParams } from '../utils/readRoutes'

export default function Read() {
  const location = useLocation()
  const parsed = parseReadUrl(location.pathname)
  const panels = useReadPanelStore((s) => s.panels)
  const languageCode =
    resolveReadLanguageFromUrlOrCache({
      pathname: location.pathname,
      cachedLanguage: navigationLanguageCode(panels),
    }).language ?? undefined
  const requireLanguageInUrl = !languageCode

  const { readRouteTail, partialRouteHint } = resolveReadRouteFromParams({
    languageCode: parsed.langs[0] || languageCode,
    resourceType: parsed.resourceType,
    navType: parsed.navType,
    navRef: parsed.navRef,
  })

  return (
    <SimplifiedReadView
      initialLanguage={languageCode}
      requireLanguageInUrl={requireLanguageInUrl}
      readRouteTail={readRouteTail}
      partialRouteHint={partialRouteHint}
    />
  )
}
