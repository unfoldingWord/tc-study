import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import { CatalogProvider } from './contexts'
import { EntryViewerProvider } from './contexts/EntryViewerContext'
import './index.css'
import { entryViewerRegistry } from './lib/viewers/EntryViewerRegistry'
import { registerDefaultEntryViewers } from './lib/viewers/registerEntryViewers'

// Initialize Entry Viewer Registry with default viewers
registerDefaultEntryViewers(entryViewerRegistry)

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <CatalogProvider>
      <EntryViewerProvider registry={entryViewerRegistry}>
        <App />
      </EntryViewerProvider>
    </CatalogProvider>
  </React.StrictMode>,
)
