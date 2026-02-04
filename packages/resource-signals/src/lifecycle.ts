/**
 * Resource Lifecycle Signals
 * 
 * Signals for resource loading states and errors
 */

import type { BaseSignal } from './index'

/**
 * Resource Loaded Signal
 * When a resource finishes loading content
 */
export interface ResourceLoadedSignal extends BaseSignal {
  type: 'resource-loaded'
  resource: {
    resourceId: string
    resourceType: string
    currentLocation?: {
      book?: string
      chapter?: number
      verse?: number
    }
  }
}

/**
 * Resource Error Signal
 * When a resource encounters an error
 */
export interface ResourceErrorSignal extends BaseSignal {
  type: 'resource-error'
  error: {
    resourceId: string
    resourceType: string
    message: string
    code?: string
    recoverable: boolean
  }
}

/**
 * Content Change Signal
 * When content is edited/updated (for translation drafting, notes, etc.)
 */
export interface ContentChangeSignal extends BaseSignal {
  type: 'content-change'
  change: {
    resourceId: string
    location: string        // verse ref, entry id, etc.
    content: string
    timestamp: number
  }
}

