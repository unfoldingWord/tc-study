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

export default function Read() {
  const { languageCode } = useParams<{ languageCode?: string }>()

  return (
    <NavigationProvider>
      <AppProvider>
        <SimplifiedReadView initialLanguage={languageCode} />
      </AppProvider>
    </NavigationProvider>
  )
}
