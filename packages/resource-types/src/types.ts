/**
 * Resource Type Definition Types
 * 
 * Defines the structure for resource type plugins
 */

import type { ResourceLoader, ResourceViewerProps } from './base-types'
import type { BaseSignal, ResourceMetadata } from '@bt-synergy/resource-panels'
import type { ComponentType } from 'react'

/**
 * API filters for Door43 catalog requests
 */
export interface APIFilters {
  subjects?: string[]
  stage?: string
  topic?: string
  language?: string
  owner?: string
}

/**
 * Resource type feature flags
 */
export interface ResourceTypeFeatures {
  highlighting?: boolean
  bookmarking?: boolean
  search?: boolean
  navigation?: boolean
  printing?: boolean
  export?: boolean
  [key: string]: boolean | undefined
}

/**
 * Setting option for select-type settings
 */
export interface SettingOption {
  value: string
  label: string
}

/**
 * Resource type setting definition
 */
export type ResourceTypeSetting =
  | {
      type: 'boolean'
      label: string
      description?: string
      default: boolean
    }
  | {
      type: 'select'
      label: string
      description?: string
      default: string
      options: SettingOption[]
    }
  | {
      type: 'number'
      label: string
      description?: string
      default: number
      min?: number
      max?: number
    }
  | {
      type: 'string'
      label: string
      description?: string
      default: string
      placeholder?: string
    }

/**
 * Resource type settings schema
 */
export interface ResourceTypeSettings {
  [key: string]: ResourceTypeSetting
}

/**
 * Loader configuration
 */
export interface LoaderConfig {
  enableMemoryCache?: boolean
  memoryCacheSize?: number
  debug?: boolean
  [key: string]: any
}

/**
 * Platform-specific viewer components
 */
export interface PlatformViewers {
  /** Web viewer component (React DOM) */
  web: ComponentType<ResourceViewerProps>
  /** Native viewer component (React Native) */
  native: ComponentType<ResourceViewerProps>
}

/**
 * Signal handler configuration
 */
export interface SignalHandlerConfig<T extends BaseSignal = BaseSignal> {
  /** Signal type to handle */
  signalType: string
  /** Handler function */
  handler: (signal: T, context: any) => void
  /** Filter for incoming signals */
  fromFilter?: any
}

/**
 * Resource dependency specification
 * Defines requirements for dependent resources
 */
export interface ResourceDependency {
  /** The resource type ID that is required (e.g., 'words', 'scripture') */
  resourceType: string
  
  /** Require same language as the dependent resource */
  sameLanguage?: boolean
  
  /** Require same owner/organization as the dependent resource */
  sameOwner?: boolean
  
  /** Require specific language (fixed, e.g., 'en') */
  language?: string
  
  /** Require specific owner/organization (fixed, e.g., 'unfoldingWord') */
  owner?: string
}

/**
 * Communication configuration for a resource type
 */
export interface CommunicationConfig {
  /** Resource metadata for signal filtering */
  metadata?: Partial<ResourceMetadata>
  
  /** Signal handlers this resource type implements */
  handlers?: SignalHandlerConfig[]
  
  /** Signals this resource type emits (for documentation) */
  emits?: string[]
  
  /** Whether to enable panel communication (default: true) */
  enabled?: boolean
}

/**
 * Complete resource type definition
 * 
 * This is the main interface for defining a resource type plugin.
 * All resource types must implement this interface.
 */
export interface ResourceTypeDefinition {
  // ===== IDENTIFICATION =====
  /** Unique identifier for the resource type (e.g., 'scripture', 'notes') */
  id: string
  
  /** Human-readable display name */
  displayName: string
  
  /** Description of what this resource type handles */
  description?: string
  
  /** Icon name (for UI display) */
  icon?: string
  
  // ===== DOOR43 MAPPING =====
  /** Door43 subjects this resource type handles (e.g., ['Bible', 'Aligned Bible']) */
  subjects: string[]
  
  /** Alternative identifiers that map to this resource type */
  aliases?: string[]
  
  // ===== DATA LAYER =====
  /** Loader class constructor (must implement ResourceLoader interface) */
  loader: new (config: any) => ResourceLoader
  
  /** Configuration for the loader */
  loaderConfig?: LoaderConfig
  
  /**
   * Download priority for background downloading
   * Lower number = higher priority (downloads first)
   * Typical values:
   * - 1-10: Critical resources (e.g., primary scripture)
   * - 11-50: Important resources (e.g., translation helps)
   * - 51-100: Optional resources (e.g., secondary references)
   * @default 50
   */
  downloadPriority?: number
  
  /**
   * Optional ingredients generator function
   * 
   * If provided, this function will be called during metadata creation to generate
   * ingredients dynamically from the repository. This is useful for resources where
   * the catalog API doesn't provide complete ingredients (e.g., Translation Words).
   * 
   * The generator receives:
   * - door43Resource: The Door43 resource from catalog API
   * - door43Client: An instance of Door43ApiClient for fetching files
   * 
   * It should return a Promise that resolves to an array of ingredient objects.
   * 
   * @example
   * ```typescript
   * ingredientsGenerator: async (door43Resource, door43Client) => {
   *   // Generate ingredients from repository files
   *   const files = await door43Client.listRepositoryFilesRecursive(...)
   *   return files.map(file => ({ identifier: file.path, ... }))
   * }
   * ```
   */
  ingredientsGenerator?: (
    door43Resource: any,
    door43Client: any
  ) => Promise<any[]>
  
  // ===== DEPENDENCIES =====
  /**
   * Optional dependencies on other resource types
   * These resources must be available when this resource is added
   * 
   * Can be:
   * 1. Simple string: 'words' - any org/language
   * 2. Object with rules:
   *    - { resourceType: 'words' } - any org/language
   *    - { resourceType: 'words', sameLanguage: true } - must be same language
   *    - { resourceType: 'words', sameOwner: true } - must be same org
   *    - { resourceType: 'words', sameLanguage: true, sameOwner: true } - both
   *    - { resourceType: 'words', language: 'en' } - specific language
   *    - { resourceType: 'words', owner: 'unfoldingWord' } - specific org
   *    - { resourceType: 'words', sameLanguage: true, owner: 'unfoldingWord' } - mixed
   * 
   * @example
   * ```typescript
   * // Translation Words Links depends on Translation Words (same language & org)
   * dependencies: [{ 
   *   resourceType: 'words', 
   *   sameLanguage: true, 
   *   sameOwner: true 
   * }]
   * 
   * // Always require English Translation Words from unfoldingWord
   * dependencies: [{ 
   *   resourceType: 'words', 
   *   language: 'en', 
   *   owner: 'unfoldingWord' 
   * }]
   * ```
   */
  dependencies?: Array<string | ResourceDependency>
  
  // ===== UI LAYER =====
  /** 
   * Viewer component - either a single component or platform-specific components
   * 
   * Single viewer (works on both platforms):
   * ```typescript
   * viewer: MyViewer
   * ```
   * 
   * Platform-specific viewers:
   * ```typescript
   * viewer: {
   *   web: MyWebViewer,
   *   native: MyNativeViewer
   * }
   * ```
   */
  viewer: ComponentType<ResourceViewerProps> | PlatformViewers
  
  // ===== COMMUNICATION =====
  /** 
   * Panel communication configuration
   * Automatically enhances viewer with signal capabilities
   */
  communication?: CommunicationConfig
  
  // ===== FEATURES =====
  /** Feature flags indicating what capabilities this resource type supports */
  features?: ResourceTypeFeatures
  
  // ===== SETTINGS =====
  /** User-configurable settings for this resource type */
  settings?: ResourceTypeSettings
  
  // ===== METADATA =====
  /** Version of this resource type definition */
  version?: string
  
  /** Author of this resource type */
  author?: string
  
  /** License for this resource type */
  license?: string
}

/**
 * Helper function to define a resource type with type checking and auto-enhancement
 * 
 * Features:
 * - Validates required fields
 * - Automatically enhances viewer with panel communication
 * - Supports platform-specific viewers (web/native)
 * - Handles signal registration and discovery
 * 
 * @example Basic usage:
 * ```typescript
 * export const scriptureResourceType = defineResourceType({
 *   id: 'scripture',
 *   displayName: 'Scripture',
 *   subjects: ['Bible', 'Aligned Bible'],
 *   loader: ScriptureLoader,
 *   viewer: ScriptureViewer,
 * })
 * ```
 * 
 * @example With communication:
 * ```typescript
 * export const scriptureResourceType = defineResourceType({
 *   id: 'scripture',
 *   displayName: 'Scripture',
 *   subjects: ['Bible', 'Aligned Bible'],
 *   loader: ScriptureLoader,
 *   viewer: ScriptureViewer,
 *   communication: {
 *     metadata: { type: 'scripture', tags: ['bible'] },
 *     handlers: [{
 *       signalType: 'verse-navigation',
 *       handler: (signal, context) => {
 *         context.props.onNavigate(signal.verse)
 *       }
 *     }],
 *     emits: ['verse-navigation', 'token-click']
 *   }
 * })
 * ```
 * 
 * @example Platform-specific viewers:
 * ```typescript
 * export const scriptureResourceType = defineResourceType({
 *   id: 'scripture',
 *   displayName: 'Scripture',
 *   subjects: ['Bible', 'Aligned Bible'],
 *   loader: ScriptureLoader,
 *   viewer: {
 *     web: ScriptureViewerWeb,
 *     native: ScriptureViewerNative
 *   }
 * })
 * ```
 */
export function defineResourceType(definition: ResourceTypeDefinition): ResourceTypeDefinition {
  // Validate required fields
  if (!definition.id) {
    throw new Error('Resource type definition must have an id')
  }
  if (!definition.displayName) {
    throw new Error('Resource type definition must have a displayName')
  }
  if (!definition.subjects || definition.subjects.length === 0) {
    throw new Error('Resource type definition must have at least one subject')
  }
  if (!definition.loader) {
    throw new Error('Resource type definition must have a loader')
  }
  if (!definition.viewer) {
    throw new Error('Resource type definition must have a viewer')
  }
  
  // Note: Viewer enhancement happens at runtime in the registry
  // to avoid circular dependencies with React hooks
  
  return definition
}


