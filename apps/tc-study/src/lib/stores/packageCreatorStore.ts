/**
 * Package Creator Store
 * Zustand store for package creation wizard
 */

import { create } from 'zustand'
import type { Door43Resource } from '@bt-synergy/door43-api'

export interface Door43Language {
  code: string
  name: string
  direction?: 'ltr' | 'rtl'
}

export interface Door43Organization {
  id: string
  name: string
  url?: string
}

export interface PackageManifest {
  metadata?: {
    title?: string
    description?: string
  }
}

interface PackageCreatorState {
  // Selection state
  selectedLanguages: Set<string>
  selectedOrganizations: Set<string>
  selectedResources: Map<string, Door43Resource>
  
  // Available options
  availableLanguages: Door43Language[]
  availableOrganizations: Door43Organization[]
  
  // Loading states
  loadingLanguages: boolean
  loadingOrganizations: boolean
  
  // Manifest
  manifest: PackageManifest
  
  // Actions
  toggleLanguage: (code: string) => void
  toggleOrganization: (id: string) => void
  toggleResource: (resource: Door43Resource) => void
  
  setAvailableLanguages: (languages: Door43Language[]) => void
  setAvailableOrganizations: (orgs: Door43Organization[]) => void
  setLoadingLanguages: (loading: boolean) => void
  setLoadingOrganizations: (loading: boolean) => void
  
  updateMetadata: (metadata: Partial<PackageManifest['metadata']>) => void
  generateManifest: () => PackageManifest
  
  getLanguageDisplayName: (code: string) => string
  
  // Reset
  reset: () => void
}

const initialState = {
  selectedLanguages: new Set<string>(),
  selectedOrganizations: new Set<string>(),
  selectedResources: new Map<string, Door43Resource>(),
  availableLanguages: [],
  availableOrganizations: [],
  loadingLanguages: false,
  loadingOrganizations: false,
  manifest: {},
}

export const usePackageCreatorStore = create<PackageCreatorState>((set, get) => ({
  ...initialState,
  
  toggleLanguage: (code: string) => {
    set((state) => {
      const newSet = new Set(state.selectedLanguages)
      if (newSet.has(code)) {
        newSet.delete(code)
      } else {
        newSet.add(code)
      }
      return { selectedLanguages: newSet }
    })
  },
  
  toggleOrganization: (id: string) => {
    set((state) => {
      const newSet = new Set(state.selectedOrganizations)
      if (newSet.has(id)) {
        newSet.delete(id)
      } else {
        newSet.add(id)
      }
      return { selectedOrganizations: newSet }
    })
  },
  
  toggleResource: (resource: Door43Resource) => {
    set((state) => {
      const key = `${resource.owner}_${resource.language}_${resource.id}`
      const newMap = new Map(state.selectedResources)
      if (newMap.has(key)) {
        newMap.delete(key)
      } else {
        newMap.set(key, resource)
      }
      return { selectedResources: newMap }
    })
  },
  
  setAvailableLanguages: (languages: Door43Language[]) => {
    set({ availableLanguages: languages })
  },
  
  setAvailableOrganizations: (orgs: Door43Organization[]) => {
    set({ availableOrganizations: orgs })
  },
  
  setLoadingLanguages: (loading: boolean) => {
    set({ loadingLanguages: loading })
  },
  
  setLoadingOrganizations: (loading: boolean) => {
    set({ loadingOrganizations: loading })
  },
  
  updateMetadata: (metadata: Partial<PackageManifest['metadata']>) => {
    set((state) => ({
      manifest: {
        ...state.manifest,
        metadata: {
          ...state.manifest.metadata,
          ...metadata,
        },
      },
    }))
  },
  
  generateManifest: () => {
    const state = get()
    return {
      metadata: {
        title: state.manifest.metadata?.title || 'Untitled Package',
        description: state.manifest.metadata?.description || '',
      },
    }
  },
  
  getLanguageDisplayName: (code: string) => {
    const state = get()
    const lang = state.availableLanguages.find(l => l.code === code)
    return lang?.name || code
  },
  
  reset: () => {
    set(initialState)
  },
}))