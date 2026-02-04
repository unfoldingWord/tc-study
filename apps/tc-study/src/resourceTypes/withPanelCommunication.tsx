/**
 * Higher-Order Component: withPanelCommunication
 * 
 * Wraps resource viewer components with resource-panels communication support.
 * This eliminates boilerplate and provides a consistent pattern for inter-panel communication.
 * 
 * @example
 * ```tsx
 * // Simple usage - automatic setup
 * export const MyViewer = withPanelCommunication(
 *   MyViewerComponent,
 *   'my-resource-type'
 * )
 * 
 * // Advanced usage - with signal handlers
 * export const MyViewer = withPanelCommunication(
 *   MyViewerComponent,
 *   'my-resource-type',
 *   {
 *     // Define what signals this viewer can send
 *     sends: ['verse-navigation', 'token-click'],
 *     
 *     // Define what signals this viewer handles
 *     receives: {
 *       'verse-navigation': (props, signal) => {
 *         props.onNavigate?.(signal.verse)
 *       },
 *       'scroll-sync': (props, signal) => {
 *         props.onScrollSync?.(signal.scroll)
 *       }
 *     },
 *     
 *     // Metadata for better filtering
 *     metadata: (props) => ({
 *       language: props.language,
 *       subject: props.subject
 *     })
 *   }
 * )
 * ```
 */

import { useResourcePanel, useSignal, useSignalHandler, type BaseSignal, type ResourceMetadata } from '@bt-synergy/resource-panels'
import React, { ComponentType, useCallback } from 'react'
import type { StudioSignal } from '../signals/studioSignals'

export interface PanelCommunicationConfig<TProps = any> {
  /**
   * Signal types this viewer can send
   * Used for documentation and IntelliSense
   */
  sends?: string[]
  
  /**
   * Signal handlers - what signals this viewer responds to
   * Key: signal type
   * Value: handler function that receives props and signal
   */
  receives?: {
    [signalType: string]: (props: TProps, signal: any) => void
  }
  
  /**
   * Resource metadata function
   * Returns metadata for better signal filtering
   */
  metadata?: (props: TProps) => Partial<ResourceMetadata>
  
  /**
   * Debug mode - logs all signal activity
   */
  debug?: boolean
}

/**
 * Props injected into wrapped components
 */
export interface InjectedPanelProps {
  /**
   * Send a signal to other resources
   * 
   * @example
   * ```tsx
   * // Send verse navigation to all scripture resources
   * sendSignal<VerseNavigationSignal>('verse-navigation', {
   *   verse: { book: 'JHN', chapter: 3, verse: 16 }
   * })
   * ```
   */
  sendSignal: <T extends BaseSignal>(
    signalType: string,
    signalData: Omit<T, 'type' | 'sourceResourceId' | 'sourceResourceType' | 'timestamp'>
  ) => void
  
  /**
   * Send a signal to a specific panel
   */
  sendToPanel: <T extends BaseSignal>(
    panelId: string,
    signalType: string,
    signalData: Omit<T, 'type' | 'sourceResourceId' | 'sourceResourceType' | 'timestamp'>
  ) => void
  
  /**
   * Send a signal to a specific resource
   */
  sendToResource: <T extends BaseSignal>(
    resourceId: string,
    signalType: string,
    signalData: Omit<T, 'type' | 'sourceResourceId' | 'sourceResourceType' | 'timestamp'>
  ) => void
}

/**
 * HOC: Wraps a viewer component with panel communication support
 */
export function withPanelCommunication<TProps extends Record<string, any>>(
  WrappedComponent: ComponentType<TProps & InjectedPanelProps>,
  resourceType: string,
  config: PanelCommunicationConfig<TProps> = {}
) {
  const displayName = WrappedComponent.displayName || WrappedComponent.name || 'Component'
  
  const WithPanelCommunication = (props: TProps & { resourceId: string; resourceKey?: string }) => {
    const { resourceId, resourceKey } = props
    const debug = config.debug || false
    
    // ✨ Setup resource-panels
    useResourcePanel(resourceId, resourceType)
    
    // Build metadata for filtering
    const metadata = config.metadata?.(props) || {}
    const resourceMetadata: ResourceMetadata = {
      type: resourceType,
      ...metadata
    }
    
    if (debug) {
      console.log(`[${displayName}] Panel communication initialized`, {
        resourceId,
        resourceKey,
        resourceType,
        metadata: resourceMetadata
      })
    }
    
    // ✨ Generic signal sending functions
    const createSender = useCallback(<T extends BaseSignal>(signalType: string) => {
      const sender = useSignal<T>(signalType as any, resourceId)
      return sender
    }, [resourceId])
    
    // Create a map of signal senders for all declared signal types
    const signalSenders = React.useMemo(() => {
      const senders: Record<string, any> = {}
      if (config.sends) {
        config.sends.forEach(signalType => {
          senders[signalType] = createSender(signalType)
        })
      }
      return senders
    }, [createSender])
    
    // ✨ Generic sendSignal function
    const sendSignal = useCallback(<T extends BaseSignal>(
      signalType: string,
      signalData: Omit<T, 'type' | 'sourceResourceId' | 'sourceResourceType' | 'timestamp'>
    ) => {
      // Get or create sender for this signal type
      let sender = signalSenders[signalType]
      if (!sender) {
        sender = createSender(signalType)
        signalSenders[signalType] = sender
      }
      
      if (debug) {
        console.log(`[${displayName}] Sending signal:`, signalType, signalData)
      }
      
      sender.sendSignal(signalData)
    }, [signalSenders, createSender, debug])
    
    const sendToPanel = useCallback(<T extends BaseSignal>(
      panelId: string,
      signalType: string,
      signalData: Omit<T, 'type' | 'sourceResourceId' | 'sourceResourceType' | 'timestamp'>
    ) => {
      let sender = signalSenders[signalType]
      if (!sender) {
        sender = createSender(signalType)
        signalSenders[signalType] = sender
      }
      
      if (debug) {
        console.log(`[${displayName}] Sending signal to panel ${panelId}:`, signalType, signalData)
      }
      
      sender.sendToPanel(panelId, signalData)
    }, [signalSenders, createSender, debug])
    
    const sendToResource = useCallback(<T extends BaseSignal>(
      targetResourceId: string,
      signalType: string,
      signalData: Omit<T, 'type' | 'sourceResourceId' | 'sourceResourceType' | 'timestamp'>
    ) => {
      let sender = signalSenders[signalType]
      if (!sender) {
        sender = createSender(signalType)
        signalSenders[signalType] = sender
      }
      
      if (debug) {
        console.log(`[${displayName}] Sending signal to resource ${targetResourceId}:`, signalType, signalData)
      }
      
      sender.sendToResource(targetResourceId, signalData)
    }, [signalSenders, createSender, debug])
    
    // ✨ Setup signal handlers from config
    if (config.receives) {
      Object.entries(config.receives).forEach(([signalType, handler]) => {
        // eslint-disable-next-line react-hooks/rules-of-hooks
        useSignalHandler<StudioSignal>(
          signalType as any,
          resourceId,
          useCallback((signal: any) => {
            if (debug) {
              console.log(`[${displayName}] Received signal:`, signalType, signal)
            }
            handler(props, signal)
          }, [props, handler, debug]),
          { resourceMetadata }
        )
      })
    }
    
    // ✨ Render wrapped component with injected props
    return (
      <WrappedComponent
        {...props}
        sendSignal={sendSignal}
        sendToPanel={sendToPanel}
        sendToResource={sendToResource}
      />
    )
  }
  
  WithPanelCommunication.displayName = `withPanelCommunication(${displayName})`
  
  return WithPanelCommunication
}

/**
 * Type helper for components that will be wrapped
 * Use this to ensure your component accepts the injected props
 */
export type WithPanelCommunicationProps<TProps = {}> = TProps & InjectedPanelProps
