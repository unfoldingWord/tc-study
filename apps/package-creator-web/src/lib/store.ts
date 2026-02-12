/**
 * Zustand store for package creation state
 */

import { create } from 'zustand'
import type {
  PackageManifest,
  Door43Language,
  Door43Organization,
  Door43Resource,
} from '@/types/manifest'
import { generateManifest as generateManifestFromBuilder } from '@bt-synergy/package-builder'

interface PackageStore {
  // Current package being created
  manifest: Partial<PackageManifest>
  
  // Selection state
  selectedLanguages: Set<string>
  selectedLanguagesInfo: Map<string, Door43Language> // Cache full language info (code -> language)
  selectedOrganizations: Set<string>
  selectedResources: Map<string, Door43Resource> // key: `${owner}_${language}_${id}`
  
  // Available data from Door43
  availableLanguages: Door43Language[]
  availableOrganizations: Door43Organization[]
  availableResources: Door43Resource[]
  
  // Loading states
  loadingLanguages: boolean
  loadingOrganizations: boolean
  loadingResources: boolean
  
  // Actions
  setManifestField: (field: keyof PackageManifest, value: any) => void
  toggleLanguage: (languageCode: string) => void
  toggleOrganization: (orgId: string) => void
  toggleResource: (resource: Door43Resource) => void
  clearSelections: () => void
  
  setAvailableLanguages: (languages: Door43Language[]) => void
  setAvailableOrganizations: (orgs: Door43Organization[]) => void
  setAvailableResources: (resources: Door43Resource[]) => void
  
  setLoadingLanguages: (loading: boolean) => void
  setLoadingOrganizations: (loading: boolean) => void
  setLoadingResources: (loading: boolean) => void
  
  // Helper to get language display name
  getLanguageDisplayName: (languageCode: string) => string
  
  // Generate manifest from selections
  generateManifest: () => PackageManifest
}

const DEFAULT_MANIFEST: Partial<PackageManifest> = {
  formatVersion: '2.0.0',
  name: 'Untitled Package',
  version: '1.0.0',
  config: {
    defaultServer: 'https://git.door43.org',
    offlineEnabled: true,
    autoUpdate: false,
  },
  status: 'draft',
}

export const usePackageStore = create<PackageStore>((set, get) => ({
  manifest: DEFAULT_MANIFEST,
  selectedLanguages: new Set(),
  selectedLanguagesInfo: new Map(),
  selectedOrganizations: new Set(),
  selectedResources: new Map(),
  availableLanguages: [],
  availableOrganizations: [],
  availableResources: [],
  loadingLanguages: false,
  loadingOrganizations: false,
  loadingResources: false,
  
  setManifestField: (field, value) =>
    set((state) => ({
      manifest: { ...state.manifest, [field]: value },
    })),
  
  toggleLanguage: (languageCode) =>
    set((state) => {
      const newSet = new Set(state.selectedLanguages)
      const newInfoMap = new Map(state.selectedLanguagesInfo)
      
      if (newSet.has(languageCode)) {
        newSet.delete(languageCode)
        newInfoMap.delete(languageCode)
      } else {
        newSet.add(languageCode)
        // Cache the full language info
        const langInfo = state.availableLanguages.find(l => l.code === languageCode)
        if (langInfo) {
          newInfoMap.set(languageCode, langInfo)
        }
      }
      
      return { 
        selectedLanguages: newSet,
        selectedLanguagesInfo: newInfoMap
      }
    }),
  
  toggleOrganization: (orgId) =>
    set((state) => {
      const newSet = new Set(state.selectedOrganizations)
      if (newSet.has(orgId)) {
        newSet.delete(orgId)
      } else {
        newSet.add(orgId)
      }
      return { selectedOrganizations: newSet }
    }),
  
  toggleResource: (resource) =>
    set((state) => {
      const key = `${resource.owner}_${resource.language}_${resource.id}`
      const newMap = new Map(state.selectedResources)
      
      if (newMap.has(key)) {
        console.log('Store: Removing resource:', key)
        newMap.delete(key)
      } else {
        console.log('Store: Adding resource:', key, resource.name)
        newMap.set(key, resource)
      }
      
      console.log('Store: Total resources now:', newMap.size)
      return { selectedResources: newMap }
    }),
  
  clearSelections: () =>
    set({
      selectedLanguages: new Set(),
      selectedLanguagesInfo: new Map(),
      selectedOrganizations: new Set(),
      selectedResources: new Map(),
    }),
  
  setAvailableLanguages: (languages) => {
    console.log('Store: setAvailableLanguages called with', languages.length, 'languages')
    set({ availableLanguages: languages })
  },
  setAvailableOrganizations: (orgs) => set({ availableOrganizations: orgs }),
  setAvailableResources: (resources) => set({ availableResources: resources }),
  
  setLoadingLanguages: (loading) => set({ loadingLanguages: loading }),
  setLoadingOrganizations: (loading) => set({ loadingOrganizations: loading }),
  setLoadingResources: (loading) => set({ loadingResources: loading }),
  
  getLanguageDisplayName: (languageCode) => {
    const state = get()
    const langInfo = state.selectedLanguagesInfo.get(languageCode)
    if (langInfo) {
      // Return native name if available, otherwise English name, otherwise code
      return langInfo.name || langInfo.code
    }
    return languageCode
  },
  
  generateManifest: () => {
    const state = get()
    const resources = Array.from(state.selectedResources.values())
    
    console.log('📦 Generating manifest from', resources.length, 'resources')
    console.log('   Resource IDs:', resources.map(r => `${r.owner}_${r.language}_${r.id}`))
    
    // Convert selectedLanguagesInfo Map to the format expected by generateManifest
    const languageInfoMap = new Map(
      Array.from(state.selectedLanguagesInfo.entries()).map(([code, lang]) => [
        code,
        {
          code: lang.code,
          name: lang.name,
          direction: lang.direction,
        }
      ])
    )
    
    // Use the shared package-builder logic
    const manifest = generateManifestFromBuilder(resources, {
      packageName: state.manifest.name,
      packageDescription: state.manifest.description,
      packageVersion: state.manifest.version || '1.0.0',
      config: state.manifest.config,
      createdBy: state.manifest.createdBy,
      languageInfo: languageInfoMap,
    })
    
    console.log('✅ Generated manifest with', manifest.resources.length, 'resources')
    
    // Merge with any additional manifest fields from state; add web-only fields if missing
    const base = { ...manifest, id: state.manifest.id || manifest.id }
    const withLayout = 'panelLayout' in base && base.panelLayout
      ? base
      : { ...base, panelLayout: { panels: [], layoutVersion: '1.0' } }
    const withStatus = 'status' in withLayout && withLayout.status
      ? withLayout
      : { ...withLayout, status: 'draft' as const }
    return withStatus as unknown as PackageManifest
  },
}))

// All utility functions are now imported from @bt-synergy/package-builder