/**
 * Read V1 backup — snapshot of the pre-Epic-21 Read page.
 * Live `/read` remains on pages/Read.tsx; this route is `/read-v1`.
 */

import { useParams } from 'react-router-dom'
import { SimplifiedReadView } from '../components/read-v1/SimplifiedReadView'
import { resolveReadRouteFromParams } from '../utils/readRoutesV1'

export default function ReadV1() {
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
