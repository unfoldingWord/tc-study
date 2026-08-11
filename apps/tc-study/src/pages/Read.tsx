/**
 * Read Page - Simplified reading experience
 */

import { useParams } from 'react-router-dom'
import { SimplifiedReadView } from '../components/read/SimplifiedReadView'
import { resolveReadRouteFromParams } from '../utils/readRoutes'

export default function Read() {
  const { languageCode: languageCodeParam, resourceType, navType, navRef } = useParams<{
    languageCode?: string
    resourceType?: string
    navType?: string
    navRef?: string
  }>()
  const languageCode = languageCodeParam?.trim() || undefined
  const requireLanguageInUrl = !languageCode

  const { readRouteTail, partialRouteHint } = resolveReadRouteFromParams({
    languageCode,
    resourceType,
    navType,
    navRef,
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
