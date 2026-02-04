import { useCallback } from 'react'
import type { BaseSignal, SignalType, ResourceType, ResourceMetadata, ResourceFilter } from '../core/types'
import { useResourcePanel } from './useResourcePanel'

/**
 * Hook for sending a specific type of signal
 * 
 * This is a convenience wrapper around useResourcePanel().send()
 * that provides type-safe signal sending for a specific signal type.
 * 
 * @example
 * ```tsx
 * function ScriptureViewer({ resourceId }: { resourceId: string }) {
 *   const { sendSignal, sendToFiltered, sendToResourceType } = useSignal<TokenClickSignal>(
 *     'token-click',
 *     resourceId,
 *     {
 *       type: 'scripture',
 *       tags: ['NT', 'Gospel'],
 *       language: 'en',
 *       testament: 'NT'
 *     }
 *   )
 *   
 *   const handleTokenClick = (token: TokenData) => {
 *     // Send to all resources
 *     sendSignal({
 *       lifecycle: 'event',
 *       token: { ... }
 *     })
 *     
 *     // Send to English study resources
 *     sendToFiltered({ language: 'en', categories: ['study'] }, {
 *       lifecycle: 'event',
 *       token: { ... }
 *     })
 *     
 *     // Or use convenience method for types
 *     sendToResourceType(['translation-words'], {
 *       lifecycle: 'event',
 *       token: { ... }
 *     })
 *   }
 *   
 *   return <div onClick={() => handleTokenClick(someToken)}>...</div>
 * }
 * ```
 */
export function useSignal<T extends BaseSignal>(
  signalType: SignalType<T>,
  resourceId: string,
  resourceMetadata?: ResourceType | ResourceMetadata
) {
  // Normalize to ResourceMetadata
  const metadata: ResourceMetadata = typeof resourceMetadata === 'string' 
    ? { type: resourceMetadata }
    : resourceMetadata || {}
  
  const panel = useResourcePanel(resourceId, metadata.type)

  /**
   * Send a signal of the specified type
   * 
   * The signal will automatically include:
   * - sourceResourceId (from resourceId parameter)
   * - sourceMetadata (from resourceMetadata parameter)
   * - timestamp (current time)
   * 
   * @param signalData - Signal data (excluding type, sourceResourceId, sourceMetadata, and timestamp)
   * @param options - Optional targeting options
   */
  const sendSignal = useCallback(
    (
      signalData: Omit<T, 'type' | 'sourceResourceId' | 'sourceMetadata' | 'sourceResourceType' | 'timestamp'>,
      options?: {
        panelId?: string
        resourceId?: string
      }
    ) => {
      const signal = {
        type: signalType,
        ...signalData,
        sourceMetadata: metadata,
        // Backward compatibility
        sourceResourceType: metadata.type,
      } as Omit<T, 'sourceResourceId' | 'timestamp'>

      panel.send<T>(signal, options)
    },
    [panel, signalType, metadata]
  )

  /**
   * Send signal to all resources
   */
  const sendToAll = useCallback(
    (signalData: Omit<T, 'type' | 'sourceResourceId' | 'sourceMetadata' | 'sourceResourceType' | 'timestamp'>) => {
      sendSignal(signalData)
    },
    [sendSignal]
  )

  /**
   * Send signal to specific panel
   */
  const sendToPanel = useCallback(
    (
      panelId: string,
      signalData: Omit<T, 'type' | 'sourceResourceId' | 'sourceMetadata' | 'sourceResourceType' | 'timestamp'>
    ) => {
      sendSignal(signalData, { panelId })
    },
    [sendSignal]
  )

  /**
   * Send signal to specific resource
   */
  const sendToResource = useCallback(
    (
      targetResourceId: string,
      signalData: Omit<T, 'type' | 'sourceResourceId' | 'sourceMetadata' | 'sourceResourceType' | 'timestamp'>
    ) => {
      sendSignal(signalData, { resourceId: targetResourceId })
    },
    [sendSignal]
  )

  /**
   * Send signal to resources matching filter criteria
   * 
   * Supports multi-dimensional filtering by type, tags, categories, language, etc.
   * 
   * @example
   * ```tsx
   * // Send to all OT resources
   * sendToFiltered({ tags: ['OT'] }, { lifecycle: 'event', token: { ... } })
   * 
   * // Send to English study resources
   * sendToFiltered({ language: 'en', categories: ['study'] }, { ... })
   * 
   * // Send to NT scripture resources
   * sendToFiltered({ type: ['scripture'], tags: ['NT'] }, { ... })
   * ```
   */
  const sendToFiltered = useCallback(
    (
      filter: ResourceFilter,
      signalData: Omit<T, 'type' | 'sourceResourceId' | 'sourceMetadata' | 'sourceResourceType' | 'timestamp' | 'targetFilter' | 'targetResourceTypes'>
    ) => {
      sendSignal({
        ...signalData,
        targetFilter: filter,
        // Backward compatibility
        targetResourceTypes: filter.type ? (Array.isArray(filter.type) ? filter.type : [filter.type]) : undefined,
      } as any)
    },
    [sendSignal]
  )

  /**
   * Send signal to specific resource type(s)
   * 
   * Convenience method for type-only filtering.
   * For multi-dimensional filtering, use sendToFiltered().
   * 
   * @example
   * ```tsx
   * // Send token click only to translation-words and lexicons
   * sendToResourceType(['translation-words', 'lexicon'], {
   *   lifecycle: 'event',
   *   token: { ... }
   * })
   * ```
   */
  const sendToResourceType = useCallback(
    (
      targetTypes: ResourceType[],
      signalData: Omit<T, 'type' | 'sourceResourceId' | 'sourceMetadata' | 'sourceResourceType' | 'timestamp' | 'targetFilter' | 'targetResourceTypes'>
    ) => {
      sendToFiltered({ type: targetTypes }, signalData)
    },
    [sendToFiltered]
  )

  return {
    /**
     * Send the signal with optional targeting
     */
    sendSignal,
    
    /**
     * Send to all resources (broadcast)
     */
    sendToAll,
    
    /**
     * Send to specific panel
     */
    sendToPanel,
    
    /**
     * Send to specific resource
     */
    sendToResource,
    
    /**
     * Send to resources matching filter criteria
     * 
     * Supports multi-dimensional filtering (type, tags, categories, language, etc.)
     */
    sendToFiltered,
    
    /**
     * Send to specific resource type(s)
     * 
     * Convenience method for type-only filtering.
     * Resources of other types should ignore the signal.
     */
    sendToResourceType,
    
    /**
     * The panel API for advanced use cases
     */
    panel,
  }
}

