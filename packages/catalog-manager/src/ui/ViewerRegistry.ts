/**
 * ViewerRegistry - Manages resource viewer components
 * 
 * Provides dynamic component resolution based on resource metadata.
 * Viewers are registered with a `canHandle` function that determines
 * if they can display a given resource.
 */

import type { ComponentType } from 'react'
import type { ResourceMetadata } from '../types'
import type { ResourceViewerProps } from '@bt-synergy/resource-types'

export type ResourceViewer = ComponentType<ResourceViewerProps>

export interface ViewerDefinition {
  resourceType: string
  displayName: string
  component: ResourceViewer
  canHandle: (metadata: ResourceMetadata) => boolean
}

export class ViewerRegistry {
  private viewers: ViewerDefinition[] = []
  private debug: boolean

  constructor(debug: boolean = false) {
    this.debug = debug
  }

  /**
   * Register a viewer component
   */
  registerViewer(viewer: ViewerDefinition): void {
    // Check for duplicates
    const existing = this.viewers.find(v => v.resourceType === viewer.resourceType)
    if (existing) {
      console.warn(`Viewer for '${viewer.resourceType}' already registered, replacing...`)
      this.viewers = this.viewers.filter(v => v.resourceType !== viewer.resourceType)
    }

    this.viewers.push(viewer)
    
    if (this.debug) {
      console.log(`✅ Registered viewer: ${viewer.displayName} (${viewer.resourceType})`)
    }
  }

  /**
   * Get a viewer component for a resource
   * Returns the first viewer whose canHandle function returns true
   */
  getViewer(metadata: ResourceMetadata): ResourceViewer | null {
    for (const viewer of this.viewers) {
      try {
        if (viewer.canHandle(metadata)) {
          if (this.debug) {
            console.log(`📺 Found viewer for resource: ${viewer.displayName} (${viewer.resourceType})`)
          }
          return viewer.component
        }
      } catch (error) {
        console.error(`Error in canHandle for viewer '${viewer.resourceType}':`, error)
      }
    }

    if (this.debug) {
      console.warn(`⚠️ No viewer found for resource type: ${metadata.type || 'unknown'}, subject: ${metadata.subject || 'unknown'}`)
    }

    return null
  }

  /**
   * Get viewer by resource type ID
   */
  getViewerByType(resourceType: string): ResourceViewer | null {
    const viewer = this.viewers.find(v => v.resourceType === resourceType)
    return viewer ? viewer.component : null
  }

  /**
   * Get all registered viewers
   */
  getAllViewers(): ViewerDefinition[] {
    return [...this.viewers]
  }

  /**
   * Check if a viewer is registered for a resource type
   */
  hasViewer(resourceType: string): boolean {
    return this.viewers.some(v => v.resourceType === resourceType)
  }

  /**
   * Unregister a viewer
   */
  unregisterViewer(resourceType: string): boolean {
    const before = this.viewers.length
    this.viewers = this.viewers.filter(v => v.resourceType !== resourceType)
    const removed = this.viewers.length < before
    
    if (removed && this.debug) {
      console.log(`🗑️ Unregistered viewer: ${resourceType}`)
    }
    
    return removed
  }

  /**
   * Clear all registered viewers
   */
  clear(): void {
    this.viewers = []
    if (this.debug) {
      console.log('🗑️ Cleared all viewers')
    }
  }
}

