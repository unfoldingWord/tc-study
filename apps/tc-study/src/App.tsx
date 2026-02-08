import { lazy, Suspense, useEffect } from 'react'
import { Navigate, Route, BrowserRouter as Router, Routes } from 'react-router-dom'
import { Loader2 } from 'lucide-react'
import { getDoor43ApiClient } from '@bt-synergy/door43-api'
import { AdminPanel } from './components/dev/AdminPanel'
import Layout from './components/Layout'
import { ResourceTypeInitializer } from './components/ResourceTypeInitializer'
import { NavigationProvider } from './contexts/NavigationContext'
// import { NavigationBridgeProvider } from './providers/NavigationBridgeProvider'
import { useWorkspaceStore } from './lib/stores/workspaceStore'

// Route-based code splitting: lazy-load pages for smaller initial bundle
const Home = lazy(() => import('./pages/Home'))
const Library = lazy(() => import('./pages/Library'))
const Collections = lazy(() => import('./pages/Collections'))
const PassageSets = lazy(() => import('./pages/PassageSets'))
const Studio = lazy(() => import('./pages/Studio'))
const Read = lazy(() => import('./pages/Read'))
const DataManagement = lazy(() => import('./pages/DataManagement'))
const Settings = lazy(() => import('./pages/Settings'))
const PanelSystemTest = lazy(() => import('./components/test').then(m => ({ default: m.PanelSystemTest })))

function PageLoader() {
  return (
    <div className="flex items-center justify-center min-h-[200px]" aria-label="Loading">
      <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
    </div>
  )
}

function App() {
  // Load saved workspace on mount
  const loadSavedWorkspace = useWorkspaceStore((s) => s.loadSavedWorkspace)
  const setAvailableLanguages = useWorkspaceStore((s) => s.setAvailableLanguages)
  
  useEffect(() => {
    const initWorkspace = async () => {
      // Wait for catalog to finish initialization
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
        {/* <NavigationBridgeProvider> */}
          <Routes>
            <Route path="/" element={<Layout />}>
              <Route index element={<Suspense fallback={<PageLoader />}><Home /></Suspense>} />
              <Route path="library" element={<Suspense fallback={<PageLoader />}><Library /></Suspense>} />
              <Route path="collections" element={<Suspense fallback={<PageLoader />}><Collections /></Suspense>} />
              <Route path="passage-sets" element={<Suspense fallback={<PageLoader />}><PassageSets /></Suspense>} />
              <Route path="studio" element={<Suspense fallback={<PageLoader />}><Studio /></Suspense>} />
              <Route path="read" element={<Suspense fallback={<PageLoader />}><Read /></Suspense>} />
              <Route path="read/:languageCode" element={<Suspense fallback={<PageLoader />}><Read /></Suspense>} />
              <Route path="test/panels" element={<Suspense fallback={<PageLoader />}><PanelSystemTest /></Suspense>} />
              <Route path="data" element={<Suspense fallback={<PageLoader />}><DataManagement /></Suspense>} />
              <Route path="settings" element={<Suspense fallback={<PageLoader />}><Settings /></Suspense>} />
              {/* Redirect old routes */}
              <Route path="catalog" element={<Navigate to="/library" replace />} />
              <Route path="create-package" element={<Navigate to="/collections" replace />} />
              <Route path="reader/:packageId?" element={<Navigate to="/studio" replace />} />
            </Route>
          </Routes>
        {/* </NavigationBridgeProvider> */}
      </NavigationProvider>
      
      {/* Admin Panel - Only visible in development */}
      {import.meta.env.DEV && <AdminPanel />}
    </Router>
  )
}

export default App
