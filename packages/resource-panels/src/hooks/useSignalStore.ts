import { useState, useCallback, useEffect, useRef } from 'react'
import type { BaseSignal } from '../core/types'

/**
 * Internal store for persistent signals
 */
interface SignalStore {
  [resourceId: string]: {
    [signalType: string]: BaseSignal[]
  }
}

const signalStore: SignalStore = {}

/**
 * Hook for managing persistent signals for a resource
 * 
 * This hook provides access to persistent signals that have been received
 * and stored, along with methods to clear them.
 * 
 * @example
 * ```tsx
 * function MyViewer({ resourceId }: { resourceId: string }) {
 *   const { 
 *     persistentSignals,     // All persistent signals
 *     getSignalsOfType,      // Get persistent signals of a specific type
 *     clearAllSignals,       // Clear all persistent signals
 *     clearSignalsOfType,    // Clear persistent signals of a type
 *     clearSignal            // Clear a specific signal by ID
 *   } = useSignalStore(resourceId)
 *   
 *   // Get all persistent verse-navigation signals
 *   const verseSignals = getSignalsOfType('verse-navigation')
 *   
 *   // Clear all persistent signals when component unmounts
 *   useEffect(() => {
 *     return () => clearAllSignals()
 *   }, [])
 *   
 *   return <div>...</div>
 * }
 * ```
 */
export function useSignalStore(resourceId: string) {
  const [, forceUpdate] = useState(0)
  const isMountedRef = useRef(true)

  useEffect(() => {
    isMountedRef.current = true
    return () => {
      isMountedRef.current = false
    }
  }, [])

  /**
   * Get all persistent signals for this resource
   */
  const persistentSignals = signalStore[resourceId] || {}

  /**
   * Get persistent signals of a specific type
   */
  const getSignalsOfType = useCallback(
    <T extends BaseSignal>(signalType: string): T[] => {
      return (signalStore[resourceId]?.[signalType] || []) as T[]
    },
    [resourceId]
  )

  /**
   * Get the most recent persistent signal of a specific type
   */
  const getLatestSignal = useCallback(
    <T extends BaseSignal>(signalType: string): T | null => {
      const signals = getSignalsOfType<T>(signalType)
      return signals.length > 0 ? signals[signals.length - 1] : null
    },
    [getSignalsOfType]
  )

  /**
   * Clear all persistent signals for this resource
   */
  const clearAllSignals = useCallback(() => {
    if (signalStore[resourceId]) {
      delete signalStore[resourceId]
      if (isMountedRef.current) {
        forceUpdate(prev => prev + 1)
      }
    }
  }, [resourceId])

  /**
   * Clear persistent signals of a specific type
   */
  const clearSignalsOfType = useCallback(
    (signalType: string) => {
      if (signalStore[resourceId]?.[signalType]) {
        delete signalStore[resourceId][signalType]
        if (isMountedRef.current) {
          forceUpdate(prev => prev + 1)
        }
      }
    },
    [resourceId]
  )

  /**
   * Clear a specific persistent signal by ID
   */
  const clearSignal = useCallback(
    (signalType: string, signalId: string) => {
      if (signalStore[resourceId]?.[signalType]) {
        signalStore[resourceId][signalType] = signalStore[resourceId][signalType].filter(
          s => s.id !== signalId
        )
        if (signalStore[resourceId][signalType].length === 0) {
          delete signalStore[resourceId][signalType]
        }
        if (isMountedRef.current) {
          forceUpdate(prev => prev + 1)
        }
      }
    },
    [resourceId]
  )

  /**
   * Check if there are any persistent signals of a specific type
   */
  const hasSignalsOfType = useCallback(
    (signalType: string): boolean => {
      return (signalStore[resourceId]?.[signalType]?.length || 0) > 0
    },
    [resourceId]
  )

  /**
   * Get count of persistent signals of a specific type
   */
  const getSignalCount = useCallback(
    (signalType: string): number => {
      return signalStore[resourceId]?.[signalType]?.length || 0
    },
    [resourceId]
  )

  return {
    /**
     * All persistent signals organized by type
     */
    persistentSignals,

    /**
     * Get persistent signals of a specific type
     */
    getSignalsOfType,

    /**
     * Get the most recent persistent signal of a type
     */
    getLatestSignal,

    /**
     * Clear all persistent signals for this resource
     */
    clearAllSignals,

    /**
     * Clear persistent signals of a specific type
     */
    clearSignalsOfType,

    /**
     * Clear a specific persistent signal by ID
     */
    clearSignal,

    /**
     * Check if there are any persistent signals of a type
     */
    hasSignalsOfType,

    /**
     * Get count of persistent signals of a type
     */
    getSignalCount,
  }
}

/**
 * Internal function to add a signal to the store (used by useSignalHandler)
 */
export function _addSignalToStore(resourceId: string, signal: BaseSignal) {
  if (!signal.persistent) return // Only store persistent signals

  if (!signalStore[resourceId]) {
    signalStore[resourceId] = {}
  }
  if (!signalStore[resourceId][signal.type]) {
    signalStore[resourceId][signal.type] = []
  }

  // Add signal (or replace if it has an ID)
  if (signal.id) {
    // Remove existing signal with same ID
    signalStore[resourceId][signal.type] = signalStore[resourceId][signal.type].filter(
      s => s.id !== signal.id
    )
  }

  signalStore[resourceId][signal.type].push(signal)
}

/**
 * Hook that automatically clears all non-persistent signals when navigating away
 * 
 * This should be used at the resource component root to ensure ephemeral
 * messages are cleared when the user navigates to a different resource.
 * 
 * @example
 * ```tsx
 * function MyResourceViewer({ resourceId }: { resourceId: string }) {
 *   useSignalCleanup(resourceId)
 *   
 *   // ... rest of component
 * }
 * ```
 */
export function useSignalCleanup(resourceId: string) {
  useEffect(() => {
    // Cleanup function runs when component unmounts (resource changes)
    return () => {
      // Clear all non-persistent signals for this resource
      if (signalStore[resourceId]) {
        Object.keys(signalStore[resourceId]).forEach(signalType => {
          signalStore[resourceId][signalType] = signalStore[resourceId][signalType].filter(
            signal => signal.persistent === true
          )
          if (signalStore[resourceId][signalType].length === 0) {
            delete signalStore[resourceId][signalType]
          }
        })
      }
    }
  }, [resourceId])
}

