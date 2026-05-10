/**
 * Read Page - Simplified reading experience
 *
 * A streamlined interface for reading Bible resources with predefined language sets.
 * Book titles use the last active scripture resource (from context) when their own
 * resource has no ingredients.
 */

import { useParams } from 'react-router-dom'
import { NavigationProvider, AppProvider } from '../contexts'
import { SimplifiedReadView } from '../components/read/SimplifiedReadView'
import type { ReadResourceType, ReadRouteTail } from '../utils/readRoutes'

function isReadResourceType(s: string | undefined): s is ReadResourceType {
  return s === 'bible' || s === 'obs'
}

export default function Read() {
  const { languageCode: languageCodeParam, resourceType, navType, navRef } = useParams<{
    languageCode?: string
    resourceType?: string
    navType?: string
    navRef?: string
  }>()
  const languageCode = languageCodeParam?.trim() || undefined
  const requireLanguageInUrl = !languageCode

  const readRouteTail: ReadRouteTail | null =
    languageCode && isReadResourceType(resourceType) && navType && navRef != null && navRef !== ''
      ? {
          resourceType,
          navType,
          navRef: decodeURIComponent(navRef),
        }
      : null

  return (
    <NavigationProvider>
      <AppProvider>
        <SimplifiedReadView
          initialLanguage={languageCode}
          requireLanguageInUrl={requireLanguageInUrl}
          readRouteTail={readRouteTail}
        />
      </AppProvider>
    </NavigationProvider>
  )
}
