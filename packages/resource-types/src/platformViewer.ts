/**
 * Platform viewer selection (no panel dependency).
 */

import type { ComponentType } from 'react'
import type { ResourceViewerProps } from './base-types'

/**
 * Enhanced viewer props - includes optional panel communication methods.
 * Concrete wiring lives in `@bt-synergy/resource-panels` / app HOCs.
 */
export interface EnhancedViewerProps extends ResourceViewerProps {
  /** Send a signal to other resources */
  sendSignal?: (
    signalType: string,
    data: Record<string, unknown>,
    options?: { panelId?: string; resourceId?: string }
  ) => void

  /** Send a signal to a specific panel */
  sendToPanel?: (
    panelId: string,
    signalType: string,
    data: Record<string, unknown>
  ) => void

  /** Send a signal to a specific resource */
  sendToResource?: (
    resourceId: string,
    signalType: string,
    data: Record<string, unknown>
  ) => void

  /** Current resource ID in the panel system */
  resourceId: string
}

/**
 * Get the appropriate viewer for the current platform
 *
 * @param viewer - Single viewer or platform-specific viewers
 * @returns The viewer component for the current platform
 */
export function getPlatformViewer(
  viewer:
    | ComponentType<ResourceViewerProps>
    | {
        web: ComponentType<ResourceViewerProps>
        native: ComponentType<ResourceViewerProps>
      }
): ComponentType<ResourceViewerProps> {
  if (typeof viewer === 'function') {
    return viewer
  }

  const isNative =
    typeof globalThis !== 'undefined' &&
    (globalThis as { navigator?: { product?: string } }).navigator?.product ===
      'ReactNative'

  return isNative ? viewer.native : viewer.web
}
