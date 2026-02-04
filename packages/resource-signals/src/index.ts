/**
 * @bt-synergy/resource-signals
 * 
 * Platform-agnostic signal definitions for resource inter-communication.
 * Works on Web, React Native, and any future platforms.
 * 
 * @example
 * ```typescript
 * import { VerseNavigationSignal, SIGNAL_REGISTRY } from '@bt-synergy/resource-signals'
 * 
 * // Use in any platform
 * sendSignal<VerseNavigationSignal>('verse-navigation', {
 *   verse: { book: 'JHN', chapter: 3, verse: 16 }
 * })
 * ```
 */

// Re-export all signal categories
export * from './navigation'
export * from './content'
export * from './links'
export * from './lifecycle'
export * from './sync'

// Re-export registry
export * from './registry'

// Base signal type (platform-agnostic)
export interface BaseSignal {
  type: string
  lifecycle?: 'event' | 'request'
  sourceResourceId: string
  sourceResourceType?: string
  timestamp: number
  persistent?: boolean
  id?: string
  targetResourceId?: string
  targetPanelId?: string
}

