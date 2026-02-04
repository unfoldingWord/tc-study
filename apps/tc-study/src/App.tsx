import { useEffect } from 'react'
import { Navigate, Route, BrowserRouter as Router, Routes } from 'react-router-dom'
import { AdminPanel } from './components/dev/AdminPanel'
import Layout from './components/Layout'
import { ResourceTypeInitializer } from './components/ResourceTypeInitializer'
import { PanelSystemTest } from './components/test'
import { NavigationProvider } from './contexts/NavigationContext'
import { NavigationBridgeProvider } from './providers/NavigationBridgeProvider'
import { useWorkspaceStore } from './lib/stores/workspaceStore'
import Collections from './pages/Collections'
import DataManagement from './pages/DataManagement'
import Home from './pages/Home'
import Library from './pages/Library'
import PassageSets from './pages/PassageSets'
import Read from './pages/Read'
import Settings from './pages/Settings'
import Studio from './pages/Studio'

function App() {
  // Load saved workspace on mount
  const loadSavedWorkspace = useWorkspaceStore((s) => s.loadSavedWorkspace)
  const setAvailableLanguages = useWorkspaceStore((s) => s.setAvailableLanguages)
  
  useEffect(() => {
    const initWorkspace = async () => {
      // Wait for catalog to finish initialization (including preloaded resources)
      const waitForCatalog = async () => {
        let attempts = 0
        const maxAttempts = 20 // 2 seconds max wait
        
        while (!(window as any).__catalogInitialized__ && attempts < maxAttempts) {
          await new Promise(resolve => setTimeout(resolve, 100))
          attempts++
        }
        
        if (attempts >= maxAttempts) {
          console.warn('⚠️ Catalog initialization timeout')
        }
      }
      
      await waitForCatalog()
      
      // Load Door43 languages for language name lookups throughout the app
      const loadLanguages = async () => {
        try {
          const { getDoor43ApiClient } = await import('@bt-synergy/door43-api')
          const client = getDoor43ApiClient()
          const languages = await client.getLanguages({ stage: 'prod' })
          
          const languageData = languages.map(lang => ({
            code: lang.code,
            name: lang.name || lang.code.toUpperCase(),
            source: 'door43' as const
          }))
          
          setAvailableLanguages(languageData)
          console.log(`🌐 Loaded ${languageData.length} languages from Door43`)
        } catch (error) {
          console.warn('⚠️ Failed to load languages from Door43:', error)
        }
      }
      
      // Load languages in background (don't block workspace loading)
      loadLanguages()
      
      // Skip workspace restoration if we're on a /read/:languageCode route
      // because that route explicitly loads resources for a specific language
      const isReadWithLanguage = window.location.pathname.match(/^\/read\/[^/]+$/)
      
      if (isReadWithLanguage) {
        console.log('📦 Skipping workspace restoration (language specified in URL)')
      } else {
        // Try to load saved workspace from localStorage
        const loaded = await loadSavedWorkspace()
        
        // Get current workspace state after loading
        const workspace = useWorkspaceStore.getState().currentPackage
        const hasResources = workspace && workspace.resources.size > 0
        
        if (loaded && hasResources) {
          console.log(`📦 Restored workspace from previous session (${workspace.resources.size} resources)`)
        } else {
          // Either no saved workspace OR workspace is empty
          // NOTE: Preloaded resources disabled - user should add from Library
          console.log('📦 Workspace is empty - user can add resources from Library page')
        }
      }
    }
    
    initWorkspace()
  }, [loadSavedWorkspace, setAvailableLanguages])
  
  return (
    <Router future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <ResourceTypeInitializer />
      <NavigationProvider>
        <NavigationBridgeProvider>
          <Routes>
            <Route path="/" element={<Layout />}>
              <Route index element={<Home />} />
              <Route path="library" element={<Library />} />
              <Route path="collections" element={<Collections />} />
              <Route path="passage-sets" element={<PassageSets />} />
              <Route path="studio" element={<Studio />} />
              <Route path="read" element={<Read />} />
              <Route path="read/:languageCode" element={<Read />} />
              <Route path="test/panels" element={<PanelSystemTest />} />
              <Route path="data" element={<DataManagement />} />
              <Route path="settings" element={<Settings />} />
              {/* Redirect old routes */}
              <Route path="catalog" element={<Navigate to="/library" replace />} />
              <Route path="create-package" element={<Navigate to="/collections" replace />} />
              <Route path="reader/:packageId?" element={<Navigate to="/studio" replace />} />
            </Route>
          </Routes>
        </NavigationBridgeProvider>
      </NavigationProvider>
      
      {/* Admin Panel - Only visible in development */}
      {import.meta.env.DEV && <AdminPanel />}
    </Router>
  )
}

export default App
