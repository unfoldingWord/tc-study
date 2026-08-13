import { lazy, Suspense, useEffect } from 'react'
import { Navigate, Route, BrowserRouter as Router, Routes } from 'react-router-dom'
import { AlertCircle, Loader2 } from 'lucide-react'
import { getDoor43ApiClient } from '@bt-synergy/door43-api'
import { AdminPanel } from './components/dev/AdminPanel'
import Layout from './components/Layout'
import { ReadPageSkeleton } from './components/read/ReadPageSkeleton'
import { ResourceTypeInitializer } from './components/ResourceTypeInitializer'
import { AppProvider } from './contexts'
import { useCatalogReady, useResourceTypesError } from './contexts/CatalogContext'
import { NavigationProvider } from './contexts/NavigationContext'
import { useWorkspaceStore } from './lib/stores/workspaceStore'
import { useWizardStore } from './lib/stores/wizardStore'
import { door43ToListNameFields } from './features/read/languageListDisplayName'

const Home = lazy(() => import('./pages/Home'))
const Library = lazy(() => import('./pages/Library'))
const Collections = lazy(() => import('./pages/Collections'))
const Studio = lazy(() => import('./pages/Studio'))
const Read = lazy(() => import('./pages/Read'))
const ReadV1 = lazy(() => import('./pages/ReadV1'))
const DataManagement = lazy(() => import('./pages/DataManagement'))
const Settings = lazy(() => import('./pages/Settings'))
/** Panel system playground — DEV-only; must not ship as a prod route. */
const PanelSystemTest = import.meta.env.DEV
  ? lazy(() =>
      import('./components/test').then((m) => ({ default: m.PanelSystemTest }))
    )
  : null

function PageLoader() {
  return (
    <div className="flex items-center justify-center min-h-[200px]" aria-label="Loading">
      <Loader2 className="w-8 h-8 animate-spin text-accent" />
    </div>
  )
}

function App() {
  const catalogReady = useCatalogReady()
  const resourceTypesError = useResourceTypesError()
  const loadSavedWorkspace = useWorkspaceStore((s) => s.loadSavedWorkspace)
  const setAvailableLanguages = useWizardStore((s) => s.setAvailableLanguages)

  useEffect(() => {
    if (!catalogReady) return

    const initWorkspace = async () => {
      const loadLanguages = async () => {
        try {
          const client = getDoor43ApiClient()
          const languages = await client.getLanguages({ stage: 'prod' })

          const languageData = languages.map((lang) => {
            const fields = door43ToListNameFields(lang)
            return {
              code: lang.code,
              name: fields.name || lang.code.toUpperCase(),
              anglicizedName: fields.anglicizedName,
              source: 'door43' as const,
              direction: lang.direction,
            }
          })

          setAvailableLanguages(languageData)
        } catch (error) {
          console.warn('⚠️ Failed to load languages from Door43:', error)
        }
      }

      loadLanguages()

      const isReadWithLanguage = window.location.pathname.match(/^\/read(-v1)?\/[^/]+(\/|$)/)
      // Read deep-link owns bootstrap; otherwise restore last workspace package.
      if (!isReadWithLanguage) {
        await loadSavedWorkspace()
      }
    }

    initWorkspace()
  }, [catalogReady, loadSavedWorkspace, setAvailableLanguages])

  // ResourceTypeInitializer must mount before the ready gate so types can become ready.
  // catalogReady = app services + types registered (not catalog downloaded).
  // Routes / workspace restore wait until both are ready.
  return (
    <>
      <ResourceTypeInitializer />
      {resourceTypesError ? (
        <div
          className="flex flex-col items-center justify-center min-h-screen gap-3"
          role="alert"
          aria-label="Resource type registration failed"
          title={resourceTypesError.message}
        >
          <AlertCircle className="w-10 h-10 text-danger" />
        </div>
      ) : !catalogReady ? (
        <div className="flex items-center justify-center min-h-screen bg-canvas" aria-label="Loading catalog">
          <Loader2 className="w-8 h-8 animate-spin text-accent" />
        </div>
      ) : (
        <Router future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
          <NavigationProvider>
            <AppProvider>
              <Routes>
                <Route path="/" element={<Layout />}>
                  <Route index element={<Navigate to="/read" replace />} />
                  <Route
                    path="home"
                    element={
                      <Suspense fallback={<PageLoader />}>
                        <Home />
                      </Suspense>
                    }
                  />
                  <Route
                    path="library"
                    element={
                      <Suspense fallback={<PageLoader />}>
                        <Library />
                      </Suspense>
                    }
                  />
                  <Route
                    path="collections"
                    element={
                      <Suspense fallback={<PageLoader />}>
                        <Collections />
                      </Suspense>
                    }
                  />
                  <Route path="passage-sets" element={<Navigate to="/data" replace />} />
                  <Route
                    path="studio"
                    element={
                      <Suspense fallback={<PageLoader />}>
                        <Studio />
                      </Suspense>
                    }
                  />
                  <Route
                    path="read"
                    element={
                      <Suspense fallback={<ReadPageSkeleton />}>
                        <Read />
                      </Suspense>
                    }
                  />
                  <Route
                    path="read/:languageCode/:resourceType/:navType/:navRef"
                    element={
                      <Suspense fallback={<ReadPageSkeleton />}>
                        <Read />
                      </Suspense>
                    }
                  />
                  <Route
                    path="read/:languageCode/:resourceType/:navType"
                    element={
                      <Suspense fallback={<ReadPageSkeleton />}>
                        <Read />
                      </Suspense>
                    }
                  />
                  <Route
                    path="read/:languageCode/:resourceType"
                    element={
                      <Suspense fallback={<ReadPageSkeleton />}>
                        <Read />
                      </Suspense>
                    }
                  />
                  <Route
                    path="read/:languageCode"
                    element={
                      <Suspense fallback={<ReadPageSkeleton />}>
                        <Read />
                      </Suspense>
                    }
                  />
                  <Route
                    path="read-v1"
                    element={
                      <Suspense fallback={<ReadPageSkeleton />}>
                        <ReadV1 />
                      </Suspense>
                    }
                  />
                  <Route
                    path="read-v1/:languageCode/:resourceType/:navType/:navRef"
                    element={
                      <Suspense fallback={<ReadPageSkeleton />}>
                        <ReadV1 />
                      </Suspense>
                    }
                  />
                  <Route
                    path="read-v1/:languageCode/:resourceType/:navType"
                    element={
                      <Suspense fallback={<ReadPageSkeleton />}>
                        <ReadV1 />
                      </Suspense>
                    }
                  />
                  <Route
                    path="read-v1/:languageCode/:resourceType"
                    element={
                      <Suspense fallback={<ReadPageSkeleton />}>
                        <ReadV1 />
                      </Suspense>
                    }
                  />
                  <Route
                    path="read-v1/:languageCode"
                    element={
                      <Suspense fallback={<ReadPageSkeleton />}>
                        <ReadV1 />
                      </Suspense>
                    }
                  />
                  {import.meta.env.DEV && PanelSystemTest && (
                    <Route
                      path="test/panels"
                      element={
                        <Suspense fallback={<PageLoader />}>
                          <PanelSystemTest />
                        </Suspense>
                      }
                    />
                  )}
                  <Route
                    path="data"
                    element={
                      <Suspense fallback={<PageLoader />}>
                        <DataManagement />
                      </Suspense>
                    }
                  />
                  <Route
                    path="settings"
                    element={
                      <Suspense fallback={<PageLoader />}>
                        <Settings />
                      </Suspense>
                    }
                  />
                  <Route path="catalog" element={<Navigate to="/library" replace />} />
                  <Route path="create-package" element={<Navigate to="/collections" replace />} />
                  <Route path="reader/:packageId?" element={<Navigate to="/studio" replace />} />
                </Route>
              </Routes>
            </AppProvider>
          </NavigationProvider>

          {import.meta.env.DEV && <AdminPanel />}
        </Router>
      )}
    </>
  )
}

export default App
