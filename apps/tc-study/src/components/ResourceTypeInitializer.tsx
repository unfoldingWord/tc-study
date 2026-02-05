/**
 * Resource Type Initializer
 * 
 * Registers resource types AFTER contexts are mounted to avoid circular dependencies
 */

import { useEffect, useState } from 'react'
import { useResourceTypeRegistry } from '../contexts'

export function ResourceTypeInitializer() {
  const registry = useResourceTypeRegistry()
  const [initialized, setInitialized] = useState(false)

  useEffect(() => {
    const registerResourceTypes = async () => {
      try {
        console.log('📦 [Initializer] Registering resource types...')
        
        // Dynamic import to avoid circular dependencies
        const {
          scriptureResourceType,
          translationWordsResourceType,
          translationWordsLinksResourceType,
          translationAcademyResourceType,
          translationNotesResourceType
        } = await import('../resourceTypes')
        
        registry.register(scriptureResourceType)
        registry.register(translationWordsLinksResourceType)
        registry.register(translationNotesResourceType)
        
        // TESTING: Register TW and TA without viewers (modal-only resources)
        // We create modified versions that only have the loader, no viewer
        console.log('📦 [Initializer] Registering modal-only resources (TW, TA)...')
        
        // Translation Words (modal-only)
        const twModalOnly = {
          ...translationWordsResourceType,
          viewer: undefined // Remove viewer so it won't appear as a tab
        }
        registry.register(twModalOnly)
        
        // Translation Academy (modal-only)
        const taModalOnly = {
          ...translationAcademyResourceType,
          viewer: undefined // Remove viewer so it won't appear as a tab
        }
        registry.register(taModalOnly)
        
        console.log('📦 [Initializer] ✅ Resource types registered')
        setInitialized(true)
        
        // Signal global readiness
        ;(window as any).__resourceTypesInitialized__ = true
      } catch (error) {
        console.error('📦 [Initializer] ❌ Failed to register resource types:', error)
        // Still mark as initialized to prevent blocking the app
        setInitialized(true)
      }
    }

    registerResourceTypes()
  }, [registry])

  // Don't block rendering - just do initialization in background
  return null
}
