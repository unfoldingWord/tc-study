/**
 * Package Store - Manages saved collections (resource packages)
 * 
 * Uses @bt-synergy/package-storage for persistence via IndexedDB
 */

import {
  IndexedDBPackageStorage,
  PackageManager,
  type ResourcePackage
} from '@bt-synergy/package-storage'
import { create } from 'zustand'
import { immer } from 'zustand/middleware/immer'

interface PackageStoreState {
  // Package manager instance
  packageManager: PackageManager | null
  
  // State
  packages: ResourcePackage[]
  activePackageId: string | null
  loading: boolean
  error: string | null
}

interface PackageStoreActions {
  // Initialization
  initialize: () => Promise<void>
  
  // Package management
  loadPackages: () => Promise<void>
  savePackage: (pkg: ResourcePackage) => Promise<void>
  deletePackage: (packageId: string) => Promise<void>
  setActivePackage: (packageId: string | null) => void
  uninstallPackage: (packageId: string) => Promise<void>
  
  // Queries
  getPackage: (packageId: string) => ResourcePackage | null
}

type PackageStore = PackageStoreState & PackageStoreActions

export const usePackageStore = create<PackageStore>()(
  immer((set, get) => ({
    // Initial state
    packageManager: null,
    packages: [],
    activePackageId: null,
    loading: false,
    error: null,
    
    // Initialize package manager with IndexedDB
    initialize: async () => {
      try {
        console.log('📦 Initializing PackageManager...')
        
        // Create IndexedDB storage adapter
        const storage = new IndexedDBPackageStorage({
          dbName: 'tc-study-collections',
          storeName: 'packages',
          version: 1
        })
        
        // Create package manager (catalog will be null for now - packages are just metadata)
        // Note: IndexedDB storage auto-initializes on first access
        const packageManager = new PackageManager(storage, null as any)
        
        set((state) => {
          state.packageManager = packageManager
        })
        
        console.log('✅ PackageManager initialized')
        
        // Load packages
        await get().loadPackages()
      } catch (error) {
        console.error('❌ Failed to initialize PackageManager:', error)
        set((state) => {
          state.error = error instanceof Error ? error.message : 'Failed to initialize'
        })
      }
    },
    
    // Load all packages from storage
    loadPackages: async () => {
      const { packageManager } = get()
      if (!packageManager) {
        console.warn('⚠️ PackageManager not initialized')
        return
      }
      
      try {
        set((state) => {
          state.loading = true
          state.error = null
        })
        
        const packages = await packageManager.listPackages()
        console.log('📦 Loaded packages:', packages.length)
        
        set((state) => {
          state.packages = packages
          state.loading = false
        })
      } catch (error) {
        console.error('❌ Failed to load packages:', error)
        set((state) => {
          state.error = error instanceof Error ? error.message : 'Failed to load packages'
          state.loading = false
        })
      }
    },
    
    // Save a package (create or update)
    savePackage: async (pkg: ResourcePackage) => {
      const { packageManager } = get()
      if (!packageManager) {
        throw new Error('PackageManager not initialized')
      }
      
      try {
        // Check if package exists
        const existing = await packageManager.getPackage(pkg.id)
        
        if (existing) {
          // Update existing
          await packageManager.updatePackage(pkg.id, pkg)
          console.log('📦 Updated package:', pkg.id)
        } else {
          // Create new
          await packageManager.createPackage(pkg)
          console.log('📦 Created package:', pkg.id)
        }
        
        // Reload packages
        await get().loadPackages()
      } catch (error) {
        console.error('❌ Failed to save package:', error)
        throw error
      }
    },
    
    // Delete a package
    deletePackage: async (packageId: string) => {
      const { packageManager } = get()
      if (!packageManager) {
        throw new Error('PackageManager not initialized')
      }
      
      try {
        await packageManager.deletePackage(packageId)
        console.log('📦 Deleted package:', packageId)
        
        // Clear active if deleted
        if (get().activePackageId === packageId) {
          set((state) => {
            state.activePackageId = null
          })
        }
        
        // Reload packages
        await get().loadPackages()
      } catch (error) {
        console.error('❌ Failed to delete package:', error)
        throw error
      }
    },
    
    // Set active package
    setActivePackage: (packageId: string | null) => {
      set((state) => {
        state.activePackageId = packageId
      })
    },
    
    // Alias for deletePackage (used by Collections page)
    uninstallPackage: async (packageId: string) => {
      return get().deletePackage(packageId)
    },
    
    // Get package by ID
    getPackage: (packageId: string) => {
      return get().packages.find(p => p.id === packageId) || null
    },
  }))
)

// Auto-initialize on first use
usePackageStore.getState().initialize()
