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
 *     sends: ['verse-navigation', 'token-click'],
 *     receives: {
 *       'verse-navigation': (props, signal) => {
 *         props.onNavigate?.(signal.verse)
 *       },
 *     },
 *     metadata: (props) => ({
 *       language: props.language,
 *       subject: props.subject
 *     })
 *   }
 * )
 * ```
 */

import {
  useMultiSignalHandler,
  useResourcePanel,
  type BaseSignal,
  type ResourceMetadata,
} from '@bt-synergy/resource-panels'
import { ComponentType, useCallback, useMemo, useRef } from 'react'

export interface PanelCommunicationConfig<TProps = unknown> {
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
    [signalType: string]: (props: TProps, signal: BaseSignal) => void
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

type WithPanelProps<TProps> = TProps & { resourceId: string; resourceKey?: string }

/**
 * HOC: Wraps a viewer component with panel communication support
 */
export function withPanelCommunication<TProps extends object>(
  WrappedComponent: ComponentType<TProps & InjectedPanelProps>,
  resourceType: string,
  config: PanelCommunicationConfig<TProps> = {}
) {
  const displayName = WrappedComponent.displayName || WrappedComponent.name || 'Component'
  // Fixed at HOC creation time — safe for unconditional hook registration
  const receiveTypes = Object.keys(config.receives ?? {})

  const WithPanelCommunication = (props: WithPanelProps<TProps>) => {
    const { resourceId } = props
    const propsRef = useRef(props)
    propsRef.current = props

    const panel = useResourcePanel(resourceId, resourceType)

    const resourceMetadata: ResourceMetadata = useMemo(
      () => ({
        type: resourceType,
        ...(config.metadata?.(props) || {}),
      }),
      // metadata() may read arbitrary props; recompute when props identity changes
      // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional props identity
      [props, resourceType]
    )

    const sendSignal = useCallback(
      <T extends BaseSignal>(
        signalType: string,
        signalData: Omit<T, 'type' | 'sourceResourceId' | 'sourceResourceType' | 'timestamp'>
      ) => {
        panel.send<T>({
          type: signalType,
          ...signalData,
          sourceMetadata: resourceMetadata,
          sourceResourceType: resourceType,
        } as Omit<T, 'sourceResourceId' | 'timestamp'>)
      },
      [panel, resourceMetadata]
    )

    const sendToPanel = useCallback(
      <T extends BaseSignal>(
        panelId: string,
        signalType: string,
        signalData: Omit<T, 'type' | 'sourceResourceId' | 'sourceResourceType' | 'timestamp'>
      ) => {
        panel.send<T>(
          {
            type: signalType,
            ...signalData,
            sourceMetadata: resourceMetadata,
            sourceResourceType: resourceType,
          } as Omit<T, 'sourceResourceId' | 'timestamp'>,
          { panelId }
        )
      },
      [panel, resourceMetadata]
    )

    const sendToResource = useCallback(
      <T extends BaseSignal>(
        targetResourceId: string,
        signalType: string,
        signalData: Omit<T, 'type' | 'sourceResourceId' | 'sourceResourceType' | 'timestamp'>
      ) => {
        panel.send<T>(
          {
            type: signalType,
            ...signalData,
            sourceMetadata: resourceMetadata,
            sourceResourceType: resourceType,
          } as Omit<T, 'sourceResourceId' | 'timestamp'>,
          { resourceId: targetResourceId }
        )
      },
      [panel, resourceMetadata]
    )

    // Single top-level multi-handler — never call hooks inside loops/callbacks
    useMultiSignalHandler(
      receiveTypes,
      resourceId,
      (signal) => {
        const handler = config.receives?.[signal.type]
        if (handler) {
          handler(propsRef.current, signal)
        }
      },
      { resourceType, debug: config.debug }
    )

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
export type WithPanelCommunicationProps<TProps = object> = TProps & InjectedPanelProps
