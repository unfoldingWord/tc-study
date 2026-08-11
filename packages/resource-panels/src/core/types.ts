/**
 * Base signal interface that all signals must implement
 * 
 * This is the core interface - extend it to create your own signal types.
 */
export interface BaseSignal {
  /** Signal type identifier (e.g., 'word-click', 'navigate', 'update') */
  type: string
  
  /**
   * Lifecycle phase of the signal
   *
   * - `event` / `request` / `response`: ephemeral EVENT-style messaging (`useSignal` / `useSignalHandler`)
   * - `state`: persistent STATE messaging keyed by `stateKey` (`useResourceState` / `useResourceStateSender`)
   */
  lifecycle: 'event' | 'request' | 'response' | 'state'
  
  /** Resource that sent the signal */
  sourceResourceId: string
  
  /**
   * Metadata about the source resource
   * 
   * Enables multi-dimensional filtering (type, tags, categories, language, etc.)
   */
  sourceMetadata?: PanelResourceMetadata
  
  /** Timestamp when the signal was sent */
  timestamp: number
  
  /** Optional target resource ID (if signal is intended for a specific resource) */
  targetResourceId?: string
  
  /**
   * Filter criteria for target resources
   * 
   * Only resources matching ALL specified criteria should handle the signal.
   */
  targetFilter?: ResourceFilter
  
  /**
   * Whether this signal should persist until explicitly cleared
   * 
   * - `true`: Message persists across resource navigation and must be cleared manually
   * - `false` or undefined: Message is ephemeral and cleared on next navigation
   */
  persistent?: boolean
  
  /**
   * Unique identifier for this specific signal instance
   * Used for clearing individual messages
   */
  id?: string

  /**
   * Required for `lifecycle: 'state'` messages.
   * Latest message per key wins (supersedes prior state for that key).
   */
  stateKey?: string
  
  // Allow any additional properties
  [key: string]: any
}

/**
 * Base interface for STATE lifecycle signals.
 *
 * STATE messages persist until superseded by a newer message with the same
 * `stateKey` (or cleared). Prefer these hooks over raw linked-panels:
 * - subscribe: `useResourceState`
 * - send: `useResourceStateSender`
 */
export interface BaseStateSignal extends BaseSignal {
  lifecycle: 'state'
  stateKey: string
}

/**
 * Extract the signal type from a signal interface
 */
export type SignalType<T extends BaseSignal> = T['type']

/**
 * Resource type identifiers
 *
 * Prefer canonical short IDs (`notes`, `words`, `academy`, `words-links`)
 * used by tc-study loaders and `@bt-synergy/resource-catalog` RESOURCE_TYPE_IDS.
 * Legacy long forms are still accepted for older examples/docs.
 */
export type ResourceType =
  // Canonical short IDs (preferred)
  | 'scripture'
  | 'words'
  | 'words-links'
  | 'notes'
  | 'questions'
  | 'academy'
  | 'obs'
  | 'obs-notes'
  | 'obs-words-links'
  | 'obs-questions'
  | 'combined-helps'
  | 'obs-combined-helps'
  // Legacy long forms (do not invent in new code)
  | 'translation-words'
  | 'translation-notes'
  | 'translation-questions'
  | 'translation-academy'
  | 'translation-words-links'
  | 'lexicon'
  | 'original-language'
  | 'commentary'
  | 'concordance'
  | 'atlas'
  | 'media'
  | 'custom'
  | string // Allow any custom string

/**
 * Narrow panel/signal filter metadata.
 *
 * NOT the catalog SoT — that lives in `@bt-synergy/resource-catalog` as `ResourceMetadata`.
 * Map catalog records via `toPanelResourceMetadata` before attaching to signals.
 */
export interface PanelResourceMetadata {
  /** Primary resource type */
  type?: ResourceType
  
  /** Tags for flexible categorization */
  tags?: string[]
  
  /** Categories for grouping */
  categories?: string[]
  
  /** Language code (ISO 639-3 or custom) */
  language?: string
  
  /** Subject */
  subject?: string
  
  /** Testament (for Bible-related resources) */
  testament?: 'OT' | 'NT' | 'both'
  
  /** Scope (e.g., "Bible.OT.Psa", "Bible.NT.Mat") */
  scope?: string
  
  /** Owner/organization */
  owner?: string
  
  /** Custom metadata fields - add whatever you need */
  custom?: Record<string, any>
  
  // Allow any additional properties
  [key: string]: any
}

/**
 * @deprecated Use `PanelResourceMetadata`. Catalog SoT is `@bt-synergy/resource-catalog` `ResourceMetadata`.
 */
export type ResourceMetadata = PanelResourceMetadata

/**
 * Filter criteria for targeting signals
 * 
 * All specified criteria must match (AND logic).
 * Arrays within a field use OR logic (any match).
 */
export interface ResourceFilter {
  /** Match any of these resource types */
  type?: ResourceType | ResourceType[]
  
  /** Match any of these tags */
  tags?: string | string[]
  
  /** Match any of these categories */
  categories?: string | string[]
  
  /** Match this language */
  language?: string | string[]
  
  /** Match any of these subjects */
  subject?: string | string[]
  
  /** Match this testament */
  testament?: 'OT' | 'NT' | 'both'
  
  /** Match this scope pattern */
  scope?: string | string[]
  
  /** Match this owner */
  owner?: string | string[]
  
  /** Custom field matchers - add whatever you need */
  custom?: Record<string, any>
  
  // Allow any additional properties
  [key: string]: any
}

