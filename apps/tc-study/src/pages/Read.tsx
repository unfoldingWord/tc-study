/**
 * Read Page - Simplified reading experience
 * 
 * A streamlined interface for reading Bible resources with predefined language sets
 * No sidebar or complex resource management - just pick a language and read
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
