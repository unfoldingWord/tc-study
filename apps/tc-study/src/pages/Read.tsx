/**
 * Read Page - Simplified reading experience
 */

import { useLocation, useParams } from 'react-router-dom'
import { SimplifiedReadView } from '../components/read/SimplifiedReadView'
import { resolveColdStartReadLanguage } from '../features/read/readBootstrapPolicy'
import { navigationLanguageCode } from '../features/read/readPanelModel'
import { useReadPanelStore } from '../features/read/readPanelStore'
import { resolveReadRouteFromParams } from '../utils/readRoutes'

export default function Read() {
  const location = useLocation()
  const { languageCode: languageCodeParam, resourceType, navType, navRef } = useParams<{
    languageCode?: string
    resourceType?: string
    navType?: string
    navRef?: string
  }>()
  const panels = useReadPanelStore((s) => s.panels)
  const languageCode = resolveColdStartReadLanguage({
    pathname: location.pathname,
    cachedLanguage: navigationLanguageCode(panels),
  }).language

  const { readRouteTail, partialRouteHint } = resolveReadRouteFromParams({
    languageCode,
    resourceType,
    navType,
    navRef,
  })

  return (
    <SimplifiedReadView
      initialLanguage={languageCode}
      requireLanguageInUrl={false}
      readRouteTail={readRouteTail}
      partialRouteHint={partialRouteHint}
    />
  )
}
