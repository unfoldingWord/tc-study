/**
 * Viewer Enhancer
 * 
 * Automatically enhances resource viewer components with panel communication capabilities
 */

import React, { ComponentType, useEffect } from 'react'
import type { ResourceViewerProps } from './base-types'
import { useResourcePanel, useSignal, useSignalHandler } from '@bt-synergy/resource-panels'
import type { BaseSignal } from '@bt-synergy/resource-panels'
import type { CommunicationConfig } from './types'

/**
 * Enhanced viewer props - includes panel communication methods
 */
export interface EnhancedViewerProps extends ResourceViewerProps {
  /** Send a signal to other resources */
  sendSignal: <T extends BaseSignal>(
    signalType: string,
    data: Omit<T, 'sourceResourceId' | 'timestamp'>,
    options?: { panelId?: string; resourceId?: string }
  ) => void
  
  /** Send a signal to a specific panel */
  sendToPanel: <T extends BaseSignal>(
    panelId: string,
    signalType: string,
    data: Omit<T, 'sourceResourceId' | 'timestamp'>
  ) => void
  
  /** Send a signal to a specific resource */
  sendToResource: <T extends BaseSignal>(
    resourceId: string,
    signalType: string,
    data: Omit<T, 'sourceResourceId' | 'timestamp'>
  ) => void
  
  /** Current resource ID in the panel system */
  resourceId: string
}

/**
 * Enhances a viewer component with panel communication capabilities
 * 
 * @param BaseViewer - The original viewer component
 * @param config - Communication configuration
 * @returns Enhanced viewer component with signal capabilities
 */
export function enhanceViewer(
  BaseViewer: ComponentType<ResourceViewerProps>,
  config?: CommunicationConfig
): ComponentType<ResourceViewerProps> {
  // If communication is explicitly disabled, return original viewer
  if (config?.enabled === false) {
    return BaseViewer
  }
  
  const EnhancedViewer: React.FC<ResourceViewerProps> = (props) => {
    const { resourceId: panelResourceId, api } = useResourcePanel(props.resource.id)
    
    // Create signal sender
    const signalSender = useSignal(config?.metadata?.type || 'unknown', 'ephemeral')
    
    // Set up signal handlers from config
    if (config?.handlers) {
      for (const handlerConfig of config.handlers) {
        // eslint-disable-next-line react-hooks/rules-of-hooks
        useSignalHandler(
          handlerConfig.signalType,
          'ephemeral',
          (signal) => {
            handlerConfig.handler(signal, { props, api })
          },
          {
            resourceMetadata: config.metadata,
            fromFilter: handlerConfig.fromFilter,
          }
        )
      }
    }
    
    // Create convenience methods
    const sendSignal = <T extends BaseSignal>(
      signalType: string,
      data: Omit<T, 'sourceResourceId' | 'timestamp'>,
      options?: { panelId?: string; resourceId?: string }
    ) => {
      signalSender.sendSignal({
        type: signalType,
        ...data,
      } as any, options)
    }
    
    const sendToPanel = <T extends BaseSignal>(
      panelId: string,
      signalType: string,
      data: Omit<T, 'sourceResourceId' | 'timestamp'>
    ) => {
      sendSignal(signalType, data, { panelId })
    }
    
    const sendToResource = <T extends BaseSignal>(
      resourceId: string,
      signalType: string,
      data: Omit<T, 'sourceResourceId' | 'timestamp'>
    ) => {
      sendSignal(signalType, data, { resourceId })
    }
    
    // Pass enhanced props to base viewer
    const enhancedProps: EnhancedViewerProps = {
      ...props,
      sendSignal,
      sendToPanel,
      sendToResource,
      resourceId: panelResourceId,
    }
    
    return <BaseViewer {...enhancedProps} />
  }
  
  EnhancedViewer.displayName = `Enhanced(${BaseViewer.displayName || BaseViewer.name || 'Viewer'})`
  
  return EnhancedViewer
}

/**
 * Get the appropriate viewer for the current platform
 * 
 * @param viewer - Single viewer or platform-specific viewers
 * @returns The viewer component for the current platform
 */
export function getPlatformViewer(
  viewer: ComponentType<ResourceViewerProps> | { web: ComponentType<ResourceViewerProps>; native: ComponentType<ResourceViewerProps> }
): ComponentType<ResourceViewerProps> {
  // If it's a single component, return it
  if (typeof viewer === 'function') {
    return viewer
  }
  
  // Otherwise, detect platform and return appropriate viewer
  // Check for React Native environment
  const isNative = typeof globalThis !== 'undefined' && 
    (globalThis as any).navigator?.product === 'ReactNative'
  
  return isNative ? viewer.native : viewer.web
}

