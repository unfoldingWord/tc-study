import { useRef, useEffect } from 'react'
import { useResourceAPI } from 'linked-panels'
import type { BaseSignal, ResourceType } from '../core/types'

/**
 * High-level hook for accessing resource panel functionality
 * 
 * This wraps the low-level linked-panels API with a simpler interface
 * focused on the most common use cases.
 * 
 * @example
 * ```tsx
 * function MyResourceViewer({ resourceId, resourceType }: { 
 *   resourceId: string
 *   resourceType: ResourceType
 * }) {
 *   const panel = useResourcePanel(resourceId, resourceType)
 *   
 *   // Use panel.send() to send signals
 *   // Signals automatically include resourceType
 *   
 *   return <div>...</div>
 * }
 * ```
 */
export function useResourcePanel(resourceId: string, resourceType?: ResourceType) {
  const api = useResourceAPI(resourceId)
  const apiRef = useRef(api)
  apiRef.current = api

  useEffect(() => {
    console.log(`🎨 [useResourcePanel] Initialized for resource: ${resourceId} (type: ${resourceType || 'unspecified'})`)
  }, [resourceId, resourceType])

  return {
    /**
     * Resource ID for this panel
     */
    resourceId,

    /**
     * Send a signal to all resources or specific targets
     * 
     * @example
     * ```ts
     * // Send to all resources
     * panel.send({
     *   type: 'token-click',
     *   lifecycle: 'event',
     *   sourceResourceId: resourceId,
     *   timestamp: Date.now(),
     *   token: { ... }
     * })
     * 
     * // Send to specific panel
     * panel.send(signal, { panelId: 'panel-2' })
     * 
     * // Send to specific resource
     * panel.send(signal, { resourceId: 'en_tn' })
     * ```
     */
    send: <T extends BaseSignal>(
      signal: Omit<T, 'sourceResourceId' | 'timestamp'>,
      options?: {
        /** Send to specific panel */
        panelId?: string
        /** Send to specific resource */
        resourceId?: string
      }
    ) => {
      const fullSignal: T = {
        ...signal,
        sourceResourceId: resourceId,
        timestamp: Date.now(),
      } as T

      if (!apiRef.current?.messaging) {
        console.warn(`⚠️ [${resourceId}] Panel messaging API not available`)
        return
      }

      if (options?.panelId) {
        // Send to specific panel
        ;(apiRef.current.messaging as any).sendToPanel(options.panelId, fullSignal)
        console.log(`📤 [${resourceId}] Sent ${signal.type} to panel ${options.panelId}`)
      } else if (options?.resourceId) {
        // Send to specific resource (via broadcast with target)
        const targetedSignal = { ...fullSignal, targetResourceId: options.resourceId }
        ;(apiRef.current.messaging as any).sendToAll(targetedSignal)
        console.log(`📤 [${resourceId}] Sent ${signal.type} to resource ${options.resourceId}`)
      } else {
        // Send to all
        ;(apiRef.current.messaging as any).sendToAll(fullSignal)
        console.log(`📤 [${resourceId}] Sent ${signal.type} to all resources`)
      }
    },

    /**
     * Low-level linked-panels API (for advanced use cases)
     */
    api: apiRef.current,
  }
}

