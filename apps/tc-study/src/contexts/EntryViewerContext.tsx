/**
 * Entry Viewer Context
 * 
 * Provides access to the Entry Viewer Registry throughout the application
 */

import { createContext, useContext, type ReactNode } from 'react'
import { EntryViewerRegistry } from '../lib/viewers/EntryViewerRegistry'

const EntryViewerContext = createContext<EntryViewerRegistry | null>(null)

interface EntryViewerProviderProps {
  children: ReactNode
  registry: EntryViewerRegistry
}

export function EntryViewerProvider({ children, registry }: EntryViewerProviderProps) {
  return (
    <EntryViewerContext.Provider value={registry}>
      {children}
    </EntryViewerContext.Provider>
  )
}

/**
 * Hook to access the Entry Viewer Registry
 */
export function useEntryViewerRegistry(): EntryViewerRegistry {
  const registry = useContext(EntryViewerContext)
  
  if (!registry) {
    throw new Error('useEntryViewerRegistry must be used within an EntryViewerProvider')
  }
  
  return registry
}
