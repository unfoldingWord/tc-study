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
        registry.register(translationWordsResourceType)
        registry.register(translationWordsLinksResourceType)
        registry.register(translationAcademyResourceType)
        registry.register(translationNotesResourceType)
        
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
