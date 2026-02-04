/**
 * Studio - Main studio screen with linked-panels for resource interactivity
 * Supports reading, recording audio, and drafting translations
 */

import { NavigationProvider, AppProvider } from '../contexts'
import { LinkedPanelsStudio } from '../components/studio/LinkedPanelsStudio'

export default function Studio() {
  return (
    <NavigationProvider>
      <AppProvider>
        <LinkedPanelsStudio />
      </AppProvider>
    </NavigationProvider>
  )
}
