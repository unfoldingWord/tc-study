import { useEffect, useRef } from 'react'
import { useMessaging } from 'linked-panels'
import type { BaseSignal, SignalType, ResourceType, ResourceMetadata, ResourceFilter } from '../core/types'
import { _addSignalToStore } from './useSignalStore'
import { matchesFilter, normalizeMetadata, normalizeFilter } from '../utils/filterMatching'

/**
 * Hook for handling incoming signals
 * 
 * This wraps the low-level useMessaging hook with a simpler,
 * type-safe interface for receiving specific signal types.
 * 
 * @example
 * ```tsx
 * function TranslationWordsViewer({ resourceId }: { resourceId: string }) {
 *   // Handle token clicks
 *   useSignalHandler<TokenClickSignal>(
 *     'token-click',
 *     resourceId,
 *     (signal) => {
 *       // Look up word article for the clicked token
 *       const wordId = signal.token.semanticId
 *       loadWordArticle(wordId)
 *     }
 *   )
 *   
 *   // Handle verse navigation
 *   useSignalHandler<VerseNavigationSignal>(
 *     'verse-navigation',
 *     resourceId,
 *     (signal) => {
 *       // Update view to show words for this verse
 *       const { book, chapter, verse } = signal.reference
 *       loadWordsForVerse(book, chapter, verse)
 *     }
 *   )
 *   
 *   return <div>...</div>
 * }
 * ```
 */
export function useSignalHandler<T extends BaseSignal>(
  signalType: SignalType<T>,
  resourceId: string,
  handler: (signal: T) => void,
  options?: {
    /**
     * Only handle signals from specific resources
     */
    fromResources?: string[]
    
    /**
     * Only handle signals matching this source filter
     * 
     * Supports multi-dimensional filtering (type, tags, categories, etc.)
     */
    fromFilter?: ResourceFilter
    
    /**
     * @deprecated Use fromFilter.type instead
     * Only handle signals from specific resource types
     */
    fromResourceTypes?: ResourceType[]
    
    /**
     * Only handle signals with specific targetResourceId
     * (or signals with no targetResourceId for broadcast)
     */
    onlyTargeted?: boolean
    
    /**
     * This resource's metadata (for filtering targetFilter)
     * 
     * If specified, signals with targetFilter will only be handled
     * if this resource's metadata matches the filter.
     */
    resourceMetadata?: ResourceType | ResourceMetadata
    
    /**
     * @deprecated Use resourceMetadata instead
     * This resource's type (for filtering targetResourceTypes)
     */
    resourceType?: ResourceType
    
    /**
     * Log received signals (for debugging)
     */
    debug?: boolean
  }
) {
  const handlerRef = useRef(handler)
  handlerRef.current = handler

  // Normalize metadata for backward compatibility
  const myMetadata: ResourceMetadata = typeof options?.resourceMetadata === 'string'
    ? { type: options.resourceMetadata }
    : options?.resourceMetadata || (options?.resourceType ? { type: options.resourceType } : {})

  // Set up event listener using useMessaging (from linked-panels)
  useMessaging({
    resourceId,
    eventTypes: [signalType],
    onEvent: (message: any) => {
      const signal = message as T

      // Debug logging
      if (options?.debug) {
        console.log(`📨 [${resourceId}] Received ${signalType}:`, signal)
      }

      // Filter by source resource if specified
      if (options?.fromResources && options.fromResources.length > 0) {
        if (!options.fromResources.includes(signal.sourceResourceId)) {
          if (options?.debug) {
            console.log(
              `🚫 [${resourceId}] Ignoring ${signalType} from ${signal.sourceResourceId} (not in fromResources filter)`
            )
          }
          return
        }
      }

      // Filter by source metadata/filter
      const sourceMetadata = normalizeMetadata(signal.sourceMetadata, signal.sourceResourceType)
      const fromFilter = options?.fromFilter || (options?.fromResourceTypes ? { type: options.fromResourceTypes } : undefined)
      
      if (fromFilter && !matchesFilter(sourceMetadata, fromFilter)) {
        if (options?.debug) {
          console.log(
            `🚫 [${resourceId}] Ignoring ${signalType} from source (doesn't match fromFilter)`,
            { sourceMetadata, fromFilter }
          )
        }
        return
      }

      // Filter by target filter
      const targetFilter = normalizeFilter(signal.targetFilter, signal.targetResourceTypes)
      
      if (targetFilter && !matchesFilter(myMetadata, targetFilter)) {
        if (options?.debug) {
          console.log(
            `🚫 [${resourceId}] Ignoring ${signalType} (doesn't match targetFilter)`,
            { myMetadata, targetFilter }
          )
        }
        return
      }

      // Filter by target if onlyTargeted is true
      if (options?.onlyTargeted) {
        const hasTarget = 'targetResourceId' in signal && signal.targetResourceId
        if (!hasTarget || signal.targetResourceId !== resourceId) {
          if (options?.debug) {
            console.log(
              `🚫 [${resourceId}] Ignoring ${signalType} (not targeted to this resource)`
            )
          }
          return
        }
      } else {
        // If signal has a target and it's not us, ignore it
        const hasTarget = 'targetResourceId' in signal && signal.targetResourceId
        if (hasTarget && signal.targetResourceId !== resourceId) {
          if (options?.debug) {
            console.log(
              `🚫 [${resourceId}] Ignoring ${signalType} (targeted to ${signal.targetResourceId})`
            )
          }
          return
        }
      }

      // Store persistent signals
      if (signal.persistent) {
        _addSignalToStore(resourceId, signal)
      }

      // Call the handler
      try {
        handlerRef.current(signal)
      } catch (error) {
        console.error(`❌ [${resourceId}] Error handling ${signalType}:`, error)
      }
    },
  })

  useEffect(() => {
    if (options?.debug) {
      console.log(`👂 [${resourceId}] Listening for ${signalType}`)
    }
  }, [resourceId, signalType, options?.debug])
}

/**
 * Hook for handling multiple signal types with a single handler
 * 
 * This is useful when you want to handle multiple related signals
 * in the same way.
 * 
 * @example
 * ```tsx
 * function MyViewer({ resourceId }: { resourceId: string }) {
 *   // Handle both token clicks and link clicks
 *   useMultiSignalHandler(
 *     ['token-click', 'link-click'],
 *     resourceId,
 *     (signal) => {
 *       if (signal.type === 'token-click') {
 *         // Handle token
 *       } else if (signal.type === 'link-click') {
 *         // Handle link
 *       }
 *     }
 *   )
 * }
 * ```
 */
export function useMultiSignalHandler(
  signalTypes: string[],
  resourceId: string,
  handler: (signal: BaseSignal) => void,
  options?: {
    fromResources?: string[]
    fromResourceTypes?: ResourceType[]
    onlyTargeted?: boolean
    resourceType?: ResourceType
    debug?: boolean
  }
) {
  const handlerRef = useRef(handler)
  handlerRef.current = handler

  useMessaging({
    resourceId,
    eventTypes: signalTypes,
    onEvent: (message: any) => {
      const signal = message as BaseSignal

      // Debug logging
      if (options?.debug) {
        console.log(`📨 [${resourceId}] Received ${signal.type}:`, signal)
      }

      // Apply same filters as useSignalHandler
      if (options?.fromResources && options.fromResources.length > 0) {
        if (!options.fromResources.includes(signal.sourceResourceId)) {
          return
        }
      }

      // Filter by source resource type
      if (options?.fromResourceTypes && options.fromResourceTypes.length > 0) {
        if (!signal.sourceResourceType || !options.fromResourceTypes.includes(signal.sourceResourceType)) {
          return
        }
      }

      // Filter by target resource type
      if (signal.targetResourceTypes && signal.targetResourceTypes.length > 0) {
        if (!options?.resourceType || !signal.targetResourceTypes.includes(options.resourceType)) {
          return
        }
      }

      if (options?.onlyTargeted) {
        const hasTarget = 'targetResourceId' in signal && signal.targetResourceId
        if (!hasTarget || signal.targetResourceId !== resourceId) {
          return
        }
      } else {
        const hasTarget = 'targetResourceId' in signal && signal.targetResourceId
        if (hasTarget && signal.targetResourceId !== resourceId) {
          return
        }
      }

      // Store persistent signals
      if (signal.persistent) {
        _addSignalToStore(resourceId, signal)
      }

      try {
        handlerRef.current(signal)
      } catch (error) {
        console.error(`❌ [${resourceId}] Error handling ${signal.type}:`, error)
      }
    },
  })

  useEffect(() => {
    if (options?.debug) {
      console.log(`👂 [${resourceId}] Listening for [${signalTypes.join(', ')}]`)
    }
  }, [resourceId, signalTypes, options?.debug])
}

