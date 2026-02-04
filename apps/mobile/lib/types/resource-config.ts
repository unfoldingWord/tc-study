/**
 * Resource Configuration Interface
 * 
 * This file defines the interface for declaring which resources the app should load,
 * how they should be configured, and how they should be rendered.
 */

import { LinkedPanelsConfig } from 'linked-panels';
import { ComponentType } from 'react';
import { ResourceType } from './context';

// Import types from context (using type-only imports to prevent circular dependencies)
import type {
    NavigationReference,
    ResourceAdapter,
    ResourceContent,
    ResourceMetadata
} from './context';

// ============================================================================
// CORE RESOURCE DECLARATION INTERFACE
// ============================================================================

/**
 * Resource Usage Mode - How the resource is accessed and displayed
 */
export enum ResourceUsageMode {
  PANEL = 'panel',           // Appears in a dedicated panel with UI
  ON_DEMAND = 'on-demand',   // Available for popups, modals, contextual display
  BACKGROUND = 'background', // Used internally, not directly user-accessible
  GLOBAL = 'global'          // Available globally, accessed by smart components
}

/**
 * Smart Panel Entry - Dynamic panel entries that can access global resources
 */
export interface SmartPanelEntry {
  panelEntryId: string;
  component: React.ComponentType<any>;
  
  // Dynamic configuration based on context
  getDynamicConfig: (context: {
    testament?: 'OT' | 'NT';
    currentBook?: string;
    navigation?: any;
  }) => {
    title: string;
    description: string;
    icon: string;
  };
  
  // Which global resources this entry can access
  accessibleResources: string[]; // Array of global resource IDs
  category: PanelCategory;
  usageMode: ResourceUsageMode;
  loadPriority: number;
}

/**
 * Main interface for declaring app resources
 * The first resource in the array becomes the anchor resource
 */
export interface AppResourceConfig {
  // Panel identification (for linked-panels communication)
  panelResourceId: string;           // e.g., 'ult-scripture', 'ust-scripture', 'tn-notes'
  
  // Adapter configuration
  adapterType: AdapterType;          // Which adapter class to use
  adapterConfig: AdapterConfiguration; // Configuration for the adapter
  
  // Panel configuration
  panelConfig: PanelConfiguration;   // How to render and display
  
  // Usage mode (how this resource is accessed)
  usageMode: ResourceUsageMode;      // 'panel', 'on-demand', or 'background'
  
  // Loading priority
  isAnchor?: boolean;               // If true, this is the anchor resource (overrides array position)
  loadPriority?: number;            // Loading order (lower = higher priority)
  
  // Resource-specific parameters (override app defaults)
  server?: string;                  // Override default server (e.g., 'git.door43.org')
  owner?: string;                   // Override default owner (e.g., 'unfoldingWord')
  language?: string;                // Override default language (e.g., 'hbo', 'el-x-koine')
}

/**
 * Processed app resource configuration (after adapter creation and metadata loading)
 */
export interface ProcessedAppResourceConfig {
  panelResourceId: string;
  adapter: ResourceAdapter;
  panelConfig: PanelConfiguration;
  metadata: ResourceMetadata;
  isAnchor: boolean;
  loadPriority: number;
  actualTitle: string;              // Final title (metadata.title || config.title)
  actualDescription: string;        // Final description (metadata.description || config.description)
}

// ============================================================================
// ADAPTER CONFIGURATION
// ============================================================================

/**
 * Available adapter types
 */
export enum AdapterType {
  DOOR43_SCRIPTURE = 'door43-scripture',     // Reusable for ULT, GLT, ULB, UST, GST
  DOOR43_NOTES = 'door43-notes',             // Translation Notes (TN)
  DOOR43_WORDS = 'door43-words',             // Translation Words (TW)  
  DOOR43_WORDS_LINKS = 'door43-words-links', // Translation Words Links (TWL)
  DOOR43_ACADEMY = 'door43-academy',         // Translation Academy (TA)
  DOOR43_QUESTIONS = 'door43-questions',     // Translation Questions (TQ)
  DOOR43_AUDIO = 'door43-audio',             // Audio Bible
  DOOR43_VIDEO = 'door43-video',             // Video Bible
  CUSTOM = 'custom'                          // Custom adapter
}

/**
 * Base adapter configuration
 */
export interface BaseAdapterConfig {
  // Server configuration
  server?: string;                   // Default: 'git.door43.org'
  timeout?: number;                  // Request timeout (default: 30000ms)
  retryAttempts?: number;           // Retry attempts (default: 3)
  retryDelay?: number;              // Retry delay (default: 1000ms)
  
  // Validation and caching
  validateContent?: boolean;         // Validate content integrity (default: true)
  cacheExpiry?: number;             // Cache expiry in ms (default: 24h)
}

/**
 * Scripture adapter configuration (for ULT, GLT, ULB, UST, GST, etc.)
 */
export interface ScriptureAdapterConfig extends BaseAdapterConfig {
  // Resource priority list (fallback order)
  resourceIds: string[];            // e.g., ['ult', 'glt', 'ulb'] or ['ust', 'gst']
  
  // Scripture-specific options
  includeAlignments?: boolean;      // Include word alignments (default: true)
  includeSections?: boolean;        // Include section markers (default: true)
  usfmVersion?: string;            // Expected USFM version (default: '3.0')
}

/**
 * Notes/Words adapter configuration
 */
export interface NotesAdapterConfig extends BaseAdapterConfig {
  resourceId: string;               // e.g., 'tn', 'tw'
  markdownProcessor?: 'basic' | 'advanced'; // Markdown processing level
}

/**
 * Academy adapter configuration  
 */
export interface AcademyAdapterConfig extends BaseAdapterConfig {
  resourceId: string;               // e.g., 'ta'
  categories?: string[];            // Filter by categories (default: all)
  includeImages?: boolean;          // Include embedded images (default: true)
}

/**
 * Translation Words adapter configuration
 */
export interface TranslationWordsAdapterConfig extends BaseAdapterConfig {
  resourceId: string;               // e.g., 'tw'
  categories?: string[];            // Filter by categories: 'keyTerm', 'properName', 'generalTerm' (default: all)
  includeStrongsNumbers?: boolean;  // Include Strong's numbers in content (default: true)
}

/**
 * Translation Words Links adapter configuration
 */
export interface TranslationWordsLinksAdapterConfig extends BaseAdapterConfig {
  resourceId: string;               // e.g., 'twl'
  categories?: string[];            // Filter by categories: 'kt', 'names', 'other' (default: all)
  includeOriginalWords?: boolean;   // Include original language words (default: true)
}

/**
 * Custom adapter configuration
 */
export interface CustomAdapterConfig extends BaseAdapterConfig {
  adapterClass: string;             // Class name or import path
  customOptions?: Record<string, any>; // Adapter-specific options
}

/**
 * Union type for all adapter configurations
 */
export type AdapterConfiguration = 
  | ScriptureAdapterConfig
  | NotesAdapterConfig  
  | AcademyAdapterConfig
  | TranslationWordsAdapterConfig
  | TranslationWordsLinksAdapterConfig
  | CustomAdapterConfig;

// ============================================================================
// PANEL CONFIGURATION
// ============================================================================

/**
 * Panel rendering and display configuration
 */
export interface PanelConfiguration {
  // Display properties
  title: string;                    // Panel title (can be overridden by metadata)
  description?: string;             // Panel description (can be overridden by metadata)
  category: PanelCategory;          // Panel category for grouping
  
  // Rendering
  component: ComponentType<ResourceComponentProps>; // React component to render
  icon?: string;                    // Panel icon (optional)
  
  // Visual identifiers (for modals, chips, etc.)
  color?: string;                   // Icon/text color (optional)
  backgroundColor?: string;         // Background color for containers (optional)
  
  // Behavior
  defaultVisible?: boolean;         // Show panel by default (default: true)
  resizable?: boolean;             // Allow panel resizing (default: true)
  closable?: boolean;              // Allow panel closing (default: true)
  
  // Layout hints
  preferredWidth?: number;         // Preferred panel width in pixels
  minWidth?: number;               // Minimum panel width in pixels
  maxWidth?: number;               // Maximum panel width in pixels
}

/**
 * Panel categories for organization
 */
export enum PanelCategory {
  SCRIPTURE = 'scripture',         // Bible translations
  NOTES = 'notes',                // Translation notes and helps
  REFERENCE = 'reference',         // Reference materials (TW, TA)
  MEDIA = 'media',                // Audio/Video content
  TOOLS = 'tools',                // Translation tools
  CUSTOM = 'custom'               // Custom panels
}

/**
 * Props passed to resource components
 */
export interface ResourceComponentProps {
  // Resource identification
  panelResourceId: string;         // The panel resource ID
  resourceMetadata: ResourceMetadata; // Resource metadata
  
  // Content access
  onContentRequest: (key: string) => Promise<ResourceContent | null>;
  
  // Navigation context
  currentReference: NavigationReference;
  onReferenceChange: (ref: NavigationReference) => void;
  
  // Panel state
  isVisible: boolean;
  isActive: boolean;
}


// ============================================================================
// FACTORY INTERFACES
// ============================================================================

/**
 * Adapter factory interface
 */
export interface AdapterFactory {
  createAdapter(
    type: AdapterType, 
    config: AdapterConfiguration,
    resourceType: ResourceType
  ): ResourceAdapter;
}

/**
 * Resource configuration processor
 */
export interface ResourceConfigProcessor {
  process(
    appResourceConfigs: AppResourceConfig[],
    appParams: { server: string; owner: string; language: string },
    adapterFactory: AdapterFactory,
    resourceManager: any, // ResourceManager - using any to avoid circular import
    storageAdapter?: any // StorageAdapter - using any to avoid circular import
  ): Promise<{
    processedConfig: ProcessedAppResourceConfig[];
    panelConfig: LinkedPanelsConfig;
    anchorResource: ProcessedAppResourceConfig;
  }>;
}

/**
 * Processed resource configuration (after metadata loading)
 */
export interface ProcessedResourceConfig {
  // Configured adapters ready for use
  adapters: Map<string, ResourceAdapter>;
  
  // Resource metadata indexed by panelResourceId
  metadata: Map<string, ResourceMetadata>;
  
  // Anchor resource information
  anchorResource: {
    panelResourceId: string;
    metadata: ResourceMetadata;
    adapter: ResourceAdapter;
  };
  
  // Panel configurations enhanced with metadata
  panelConfigs: EnhancedPanelConfig[];
}

/**
 * Enhanced panel configuration (declaration + metadata)
 */
export interface EnhancedPanelConfig extends PanelConfiguration {
  // From declaration
  panelResourceId: string;
  
  // From metadata (overrides declaration where applicable)
  actualTitle: string;              // Final title (metadata.title || config.title)
  actualDescription: string;        // Final description
  
  // Runtime information
  resourceMetadata: ResourceMetadata;
  adapter: ResourceAdapter;
  isAnchor: boolean;
  loadPriority: number;
}

