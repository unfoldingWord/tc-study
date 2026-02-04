/**
 * Core types for passage set management
 * Based on the mobile app's hierarchical passage set system
 */

// ============================================================================
// Core Reference Types
// ============================================================================

/**
 * A single verse reference
 */
export type VerseRef = number

/**
 * A verse range (e.g., 5-8, 12-15)
 */
export interface VerseRange {
  start: VerseRef
  end?: VerseRef // Optional for single verse
}

/**
 * A chapter reference with optional verse range
 */
export interface ChapterRef {
  chapter: number
  verses?: VerseRange | VerseRange[] // Multiple verse ranges in same chapter
}

/**
 * A reference range within a book (e.g., "1:5-8", "2:1-3:15", "4")
 */
export interface RefRange {
  startChapter: number
  startVerse?: VerseRef
  endChapter?: number // Optional for single chapter
  endVerse?: VerseRef
}

/**
 * Alternative simplified reference format
 */
export type SimpleRef = string // e.g., "1:5-8", "2:1-3:15", "4:1-25"

/**
 * Legacy BCV Reference (for backward compatibility)
 */
export interface BCVReference {
  book: string
  chapter: number
  verse: number
  endChapter?: number
  endVerse?: number
}

// ============================================================================
// Passage Types
// ============================================================================

/**
 * A single passage reference combining book and reference range
 */
export interface Passage {
  /** Three-letter book code (e.g., "JON", "MAT", "GEN") */
  bookCode: string
  
  /** Reference range within the book */
  ref: RefRange | SimpleRef
  
  /** Optional human-readable label */
  label?: string
  
  /** Optional multimedia label (extends or replaces text label) */
  multimediaLabel?: MultimediaLabel
  
  /** Optional metadata */
  metadata?: PassageMetadata
}

// ============================================================================
// Multimedia Label Types
// ============================================================================

/**
 * Represents different types of media that can be used as labels
 */
export type MediaType = 'text' | 'image' | 'audio' | 'video'

/**
 * Base interface for media content
 */
export interface MediaContent {
  /** Type of media */
  type: MediaType
  
  /** Alternative text for accessibility */
  alt?: string
  
  /** Optional caption or description */
  caption?: string
}

/**
 * Text-based label content
 */
export interface TextContent extends MediaContent {
  type: 'text'
  
  /** The text content */
  text: string
  
  /** Optional text formatting/styling hints */
  formatting?: {
    bold?: boolean
    italic?: boolean
    color?: string
    fontSize?: 'small' | 'medium' | 'large'
  }
}

/**
 * Image-based label content
 */
export interface ImageContent extends MediaContent {
  type: 'image'
  
  /** Image URL or file path */
  src: string
  
  /** Image dimensions (optional) */
  dimensions?: {
    width?: number
    height?: number
  }
  
  /** Image format hint */
  format?: 'png' | 'jpg' | 'jpeg' | 'svg' | 'webp'
  
  /** Thumbnail URL for performance (optional) */
  thumbnail?: string
}

/**
 * Audio-based label content
 */
export interface AudioContent extends MediaContent {
  type: 'audio'
  
  /** Audio URL or file path */
  src: string
  
  /** Duration in seconds (optional) */
  duration?: number
  
  /** Audio format */
  format?: 'mp3' | 'wav' | 'ogg' | 'm4a'
  
  /** Whether to auto-play (default: false) */
  autoPlay?: boolean
  
  /** Transcript for accessibility */
  transcript?: string
}

/**
 * Video-based label content (for future use)
 */
export interface VideoContent extends MediaContent {
  type: 'video'
  
  /** Video URL or file path */
  src: string
  
  /** Duration in seconds (optional) */
  duration?: number
  
  /** Video format */
  format?: 'mp4' | 'webm' | 'mov'
  
  /** Poster image URL */
  poster?: string
  
  /** Video dimensions */
  dimensions?: {
    width: number
    height: number
  }
}

/**
 * Union type for all media content types
 */
export type MediaContentType = TextContent | ImageContent | AudioContent | VideoContent

/**
 * Multimedia label that can contain multiple types of content
 */
export interface MultimediaLabel {
  /** Primary content (required) */
  primary: MediaContentType
  
  /** Secondary/alternative content (optional) */
  secondary?: MediaContentType[]
  
  /** Layout hint for multiple content types */
  layout?: 'horizontal' | 'vertical' | 'overlay' | 'tabs'
  
  /** Accessibility preferences */
  accessibility?: {
    /** Preferred content type for screen readers */
    screenReaderPreference?: MediaType
    
    /** High contrast mode support */
    highContrast?: boolean
    
    /** Large text support */
    largeText?: boolean
  }
}

/**
 * Metadata that can be attached to passages or passage groups
 */
export interface PassageMetadata {
  /** Descriptive title */
  title?: string
  
  /** Longer description */
  description?: string
  
  /** Tags for categorization */
  tags?: string[]
  
  /** Difficulty level (1-5) */
  difficulty?: number
  
  /** Estimated reading time in minutes */
  estimatedTime?: number
  
  /** Theme or topic */
  theme?: string
  
  /** Custom properties */
  [key: string]: any
}

// ============================================================================
// Hierarchical Structure Types
// ============================================================================

/**
 * Base interface for all passage set nodes
 */
export interface PassageSetNode {
  /** Unique identifier */
  id: string
  
  /** Node type discriminator */
  type: 'group' | 'passage'
  
  /** Display label (text-based, for backward compatibility) */
  label: string
  
  /** Optional multimedia label (extends or replaces text label) */
  multimediaLabel?: MultimediaLabel
  
  /** Optional description */
  description?: string
  
  /** Optional metadata */
  metadata?: PassageMetadata
  
  /** Optional ordering/sequence number */
  order?: number
}

/**
 * A group node that contains other nodes (groups or passages)
 */
export interface PassageGroup extends PassageSetNode {
  type: 'group'
  
  /** Child nodes */
  children: PassageSetNode[]
  
  /** Group-specific properties */
  groupType?: 'sequential' | 'parallel' | 'optional' | 'alternative'
  
  /** Whether children should be completed in order */
  requiresSequentialCompletion?: boolean
}

/**
 * A leaf node containing actual passage references
 */
export interface PassageLeaf extends PassageSetNode {
  type: 'passage'
  
  /** The actual passage references */
  passages: Passage[]
  
  /** Whether all passages should be read together */
  readTogether?: boolean
}

/**
 * Root container for a complete hierarchical passage set
 */
export interface PassageSet {
  /** Unique identifier for the set */
  id: string
  
  /** Set name/title */
  name: string
  
  /** Set description */
  description?: string
  
  /** Version for schema evolution */
  version: string
  
  /** Creation timestamp */
  createdAt: string
  
  /** Last modified timestamp */
  updatedAt: string
  
  /** Set metadata */
  metadata?: PassageMetadata & {
    /** Total estimated completion time */
    totalTime?: number
    
    /** Number of passages */
    passageCount?: number
    
    /** Set category */
    category?: string
    
    /** Target audience */
    audience?: string[]
    
    /** Author */
    author?: string
    
    /** Is public */
    isPublic?: boolean
  }
  
  /** Root nodes of the hierarchy */
  root: PassageSetNode[]
}

/**
 * Passage Set Metadata (for listing)
 */
export interface PassageSetMetadata {
  id: string
  name: string
  description?: string
  passageCount: number
  tags?: string[]
  category?: string
  author?: string
  createdAt: string
  updatedAt: string
}

/**
 * Passage Set Collection (for sharing multiple sets)
 */
export interface PassageSetCollection {
  id: string
  name: string
  description?: string
  passageSets: PassageSet[]
  createdAt: string
  version: string
}

/**
 * Search/Filter options
 */
export interface PassageSetSearchOptions {
  query?: string
  tags?: string[]
  category?: string
  author?: string
  limit?: number
  offset?: number
}

/**
 * Storage statistics
 */
export interface PassageSetStats {
  totalSets: number
  totalPassages: number
  categories: string[]
  tags: string[]
}

// ============================================================================
// Utility Types
// ============================================================================

/**
 * Flattened view of all passages in a set
 */
export interface FlatPassageList {
  passages: (Passage & { 
    path: string[] // Path through hierarchy
    groupIds: string[] // IDs of parent groups
  })[]
  totalCount: number
}

/**
 * Progress tracking for passage sets
 */
export interface PassageProgress {
  setId: string
  userId?: string
  completedPassages: Set<string> // Passage IDs or paths
  completedGroups: Set<string> // Group IDs
  lastAccessed: string
  progressPercentage: number
}

/**
 * Search/filter criteria for passages
 */
export interface PassageFilter {
  books?: string[] // Book codes
  tags?: string[]
  themes?: string[]
  difficulty?: { min?: number; max?: number }
  estimatedTime?: { min?: number; max?: number }
  textSearch?: string // Search in labels/descriptions
}

// ============================================================================
// Builder Pattern Types
// ============================================================================

/**
 * Builder interface for constructing passage sets
 */
export interface PassageSetBuilder {
  setId(id: string): PassageSetBuilder
  setName(name: string): PassageSetBuilder
  setDescription(description: string): PassageSetBuilder
  setMetadata(metadata: PassageMetadata): PassageSetBuilder
  
  addGroup(id: string, label: string, config?: Partial<PassageGroup>): PassageSetBuilder
  addPassage(groupId: string, passage: Passage): PassageSetBuilder
  addPassages(groupId: string, passages: Passage[]): PassageSetBuilder
  
  build(): PassageSet
}

// ============================================================================
// Common Patterns
// ============================================================================

/**
 * Pre-defined passage set templates
 */
export type PassageSetTemplate = 
  | 'reading-plan' // Sequential daily readings
  | 'topical-study' // Grouped by themes
  | 'curriculum' // Educational sequence
  | 'devotional' // Meditation-focused
  | 'comparative' // Parallel passages
  | 'chronological' // Historical order
  | 'custom' // User-defined

/**
 * Template configuration
 */
export interface TemplateConfig {
  template: PassageSetTemplate
  parameters?: {
    duration?: number // Days, weeks, etc.
    frequency?: 'daily' | 'weekly' | 'custom'
    difficulty?: 'beginner' | 'intermediate' | 'advanced'
    [key: string]: any
  }
}

/**
 * Export format options
 */
export type ExportFormat = 'json' | 'csv' | 'text'

/**
 * Validation result
 */
export interface ValidationResult {
  valid: boolean
  errors: string[]
}
