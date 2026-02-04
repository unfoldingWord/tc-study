import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import { ErrorBoundary } from './components/ErrorBoundary'
import { CatalogProvider } from './contexts'
import { EntryViewerProvider } from './contexts/EntryViewerContext'
import './index.css'
import { entryViewerRegistry } from './lib/viewers/EntryViewerRegistry'
import { registerDefaultEntryViewers } from './lib/viewers/registerEntryViewers'

// Disable StrictMode in production to avoid React 19 double-rendering issues
const StrictModeWrapper = import.meta.env.DEV ? React.StrictMode : React.Fragment

// Initialize entry viewers (must be done before rendering)
try {
  console.log('[Main] Registering entry viewers...')
  registerDefaultEntryViewers(entryViewerRegistry)
  console.log('[Main] ✅ Entry viewers registered successfully')
} catch (error) {
  console.error('[Main] ❌ Failed to register entry viewers:', error)
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <StrictModeWrapper>
    <ErrorBoundary>
      <CatalogProvider>
        <EntryViewerProvider registry={entryViewerRegistry}>
          <App />
        </EntryViewerProvider>
      </CatalogProvider>
    </ErrorBoundary>
  </StrictModeWrapper>,
)
