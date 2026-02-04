/**
 * Context Types for BT Studio
 * 
 * These types define the shape of our Zustand-based contexts
 * following the architecture from ARCHITECTURE.md
 */

import { LinkedPanelsConfig } from 'linked-panels'
import React from 'react'
import type { OptimizedChapter, OptimizedScripture, OptimizedToken, OptimizedVerse } from '../services/usfm-processor'
import type { ProcessedContent } from './processed-content'

// ============================================================================
// RESOURCE TYPES
// ============================================================================

export interface BaseResource {
  id: string
  type: ResourceType
  title?: string
  description?: string
  metadata?: Record<string, unknown>
}

export enum ResourceType {
  SCRIPTURE = 'scripture',
  NOTES = 'notes', 
  WORDS = 'words',
  WORDS_LINKS = 'words-links',
  QUESTIONS = 'questions',
  ACADEMY = 'academy',
  AUDIO = 'audio',
  VIDEO = 'video',
  ALIGNMENT = 'alignment'
}

export interface ScriptureResource extends BaseResource {
  type: ResourceType.SCRIPTURE
  language: string
  owner: string
  repository: string
  books: Record<string, OptimizedBook>
}

export interface OptimizedBook {
  bookCode: string
  title: string
  chapters: OptimizedChapter[]
  metadata?: Record<string, unknown>
  // Optimized format metadata
  meta: {
    type: 'untokenized' | 'original' | 'aligned'
    totalChapters: number
    totalVerses: number
    totalParagraphs: number
    hasAlignments: boolean
    processingDate: string
    version: string
  }
}

// USFM Processor Types - Now using optimized format
export type ProcessedVerse = OptimizedVerse & {
  // Add legacy compatibility properties for gradual migration
  reference?: string; // Computed from chapter and verse number
  alignments?: WordAlignment[];
  wordTokens?: OptimizedToken[]; // Alias to tokens
  alignmentGroups?: never; // Removed in optimized format
};

export type ProcessedParagraph = OptimizedVerse['paragraphId'] extends number 
  ? {
      id: number;
      type: 'paragraph' | 'quote';
      style: 'p' | 'q' | 'q1' | 'q2' | 'm' | 'mi' | 'pc' | 'pr' | 'cls';
      indentLevel: number;
      startVerse: number;
      endVerse: number;
      verseCount: number;
      verseNumbers: number[];
      combinedText: string;
      verses: ProcessedVerse[];
    }
  : never;

export type ProcessedChapter = OptimizedChapter;

// Token type aliases
export type WordToken = OptimizedToken & {
  // Legacy compatibility properties
  uniqueId?: string; // Computed from semantic ID
  content?: string; // Alias to text
  occurrence?: number; // No longer used in optimized format
  totalOccurrences?: number; // No longer used in optimized format
  verseRef?: string; // Computed from context
  position?: { start: number; end: number }; // No longer used in optimized format
  type?: 'word' | 'text' | 'punctuation'; // Inferred from content
  isHighlightable?: boolean; // Always true for tokens with align data
  alignmentId?: string; // No longer used
  alignmentGroupId?: string; // No longer used
  alignedOriginalWordIds?: string[]; // No longer used - use align array
  alignment?: {
    strong: string;
    lemma: string;
    morph: string;
    sourceContent: string;
    sourceWordId?: string;
    alignmentGroupId?: string;
  }; // Legacy - data now embedded in original language tokens
};

// Scripture type aliases
export type ProcessedScripture = OptimizedScripture;

export interface TranslatorSection {
  start: {
    chapter: number;
    verse: number;
    reference: { chapter: string; verse: string };
  };
  end: {
    chapter: number;
    verse: number;
    reference: { chapter: string; verse: string };
  };
}

export interface WordAlignment {
  verseRef: string;
  sourceWords: string[];
  targetWords: string[];
  alignmentData: {
    strong: string;
    lemma: string;
    morph: string;
    occurrence: string;
    occurrences: string;
  }[];
}

// ============================================================================
// NAVIGATION TYPES
// ============================================================================

export interface NavigationReference {
  book: string
  chapter?: number
  verse?: number
  endChapter?: number
  endVerse?: number
}

export interface NavigationState {
  currentBook: string
  currentReference: NavigationReference
  availableBooks: BookInfo[]
  
  // Navigation history
  navigationHistory: NavigationReference[]
  historyIndex: number
  maxHistorySize: number
  
  // Persistence state
  isInitialized: boolean
  isRestoring: boolean
  saveTimeout: NodeJS.Timeout | null
}

export interface BookInfo {
  code: string
  name: string
  chapters?: number  // Optional - will be populated from processed content
  testament: 'OT' | 'NT'
}

// ============================================================================
// RESOURCE ADAPTER TYPES (from architecture)
// ============================================================================

export interface BaseResourceAdapter {
  resourceType: ResourceType;
  organizationType: 'book' | 'entry';
  serverId: string;
  resourceId: string;
  
  getResourceMetadata(server: string, owner: string, language: string): Promise<ResourceMetadata>;
  isResourceAvailable(server: string, owner: string, language: string): Promise<boolean>;
  getResourceInfo(): ResourceAdapterInfo;
  configure(config: AdapterConfig): void;
  
  // SHA-based change detection (optional)
  hasContentChanged?(server: string, owner: string, language: string, contentId: string, cachedSha?: string): Promise<boolean>;
  getCurrentSha?(server: string, owner: string, language: string, contentId: string): string | undefined;
}

export interface BookOrganizedAdapter extends BaseResourceAdapter {
  organizationType: 'book';
  
  getResourceMetadata(server: string, owner: string, language: string): Promise<ResourceMetadata>;
  getBookContent(server: string, owner: string, language: string, bookCode: string): Promise<any>;
  getAvailableBooks(server: string, owner: string, language: string): BookInfo[];
  isBookAvailable(server: string, owner: string, language: string, bookCode: string): Promise<boolean>;
}

export interface ResourceMetadata {
  id: string;                    // Resource identifier (ult, ust, tn, ta, etc.)
  resourceKey?: string;          // Composite key (server/owner/language/id) - generated by storage
  server: string;               // Source server (door43.org)
  owner: string;                // Resource owner (unfoldingword)
  language: string;             // Language code (en, es, fr)
  type: ResourceType;           // Category (scripture, notes, words, academy)
  title: string;                // Display title
  description: string;          // Resource description
  name: string;                 // Internal name (used as panel resource ID)
  version: string;              // Resource version
  lastUpdated: Date;            // Last modification date
  available: boolean;           // Availability status
  toc: TableOfContents;         // Structure/navigation data
  isAnchor: boolean;            // Whether this is the anchor resource
  
  // Language metadata from Door43 API
  languageDirection?: 'rtl' | 'ltr';  // Text direction from API
  languageTitle?: string;             // Human-readable language name
  languageIsGL?: boolean;             // Gateway Language flag
  // SHA-based change detection
  commitSha?: string;           // Git commit SHA for the entire resource
  fileHashes?: Record<string, string>; // File-level SHA hashes (bookCode -> SHA)
}

export interface TableOfContents {
  books?: BookInfo[];           // For scripture resources
  articles?: ArticleInfo[];     // For academy resources
  entries?: EntryInfo[];        // For other resource types
}

export interface ArticleInfo {
  id: string;
  title: string;
  category: string;
  description?: string;
}

export interface EntryInfo {
  id: string;
  title: string;
  category: string;
  description?: string;
  tags?: string[];
  dependencies?: string[];  // Other entries this entry references
}

export interface ScriptureMetadata extends ResourceMetadata {
  books: BookInfo[];
  hasAlignments: boolean;
  hasSections: boolean;
  usfmVersion: string;
  processingVersion: string;
}

export interface NotesMetadata extends ResourceMetadata {
  resourceId: string;           // 'tn' for Translation Notes
  repoName: string;            // Repository name (e.g., 'en_tn')
  fullName: string;            // Full repository name
  htmlUrl: string;             // Repository HTML URL
  cloneUrl: string;            // Repository clone URL
  defaultBranch: string;       // Default branch (usually 'master')
  availableBooks: BookInfo[];  // Available books with notes
  format: string;              // Content format ('tsv')
  markdownSupport: boolean;    // Whether markdown processing is enabled
}

export interface QuestionsMetadata extends ResourceMetadata {
  resourceId: string;           // 'tq' for Translation Questions
  repoName: string;            // Repository name (e.g., 'en_tq')
  fullName: string;            // Full repository name
  htmlUrl: string;             // Repository HTML URL
  cloneUrl: string;            // Repository clone URL
  defaultBranch: string;       // Default branch (usually 'master')
  availableBooks: BookInfo[];  // Available books with questions
  format: string;              // Content format ('tsv')
  markdownSupport: boolean;    // Whether markdown processing is enabled (false for questions)
}

export interface ResourceAdapterInfo {
  name: string;
  description: string;
  supportedServers: string[];
  fallbackOptions: string[];
  processingCapabilities: string[];
}

export interface AdapterConfig {
  timeout?: number;
  retryAttempts?: number;
  retryDelay?: number;
  fallbackOptions?: string[];
  processingCapabilities: string[];
}

// ============================================================================
// STORAGE ADAPTER INTERFACES
// ============================================================================

export interface StorageAdapter {
  // Metadata operations
  getResourceMetadata(server: string, owner: string, language: string): Promise<ResourceMetadata[]>;
  saveResourceMetadata(metadata: ResourceMetadata[]): Promise<void>;
  
  // Content operations
  getResourceContent(key: string): Promise<ResourceContent | null>;
  saveResourceContent(content: ResourceContent): Promise<void>;
  
  // Batch operations (with transaction support)
  getMultipleContent(keys: string[]): Promise<ResourceContent[]>;
  saveMultipleContent(contents: ResourceContent[]): Promise<void>;
  
  // Transaction support
  beginTransaction(): Promise<StorageTransaction>;
  
  // Cache management
  clearExpiredContent(): Promise<void>;
  clearAllContent(): Promise<void>;
  
  // Storage info and quotas
  getStorageInfo(): Promise<StorageInfo>;
  checkQuota(): Promise<QuotaInfo>;
}

export interface StorageTransaction {
  save(content: ResourceContent): Promise<void>;
  delete(key: string): Promise<void>;
  commit(): Promise<void>;
  rollback(): Promise<void>;
}

export interface ResourceContent {
  key: string;                  // Unique identifier (full path)
  resourceKey: string;          // Foreign key to metadata (server/owner/language/resourceId)
  resourceId: string;           // Reference to metadata
  server: string;               // Source server
  owner: string;                // Resource owner
  language: string;             // Language code
  type: ResourceType;           // Resource category
  bookCode?: string;            // Book code (for scripture/notes)
  articleId?: string;           // Article ID (for academy)
  content: ProcessedContent;    // Actual content data
  lastFetched: Date;            // When content was last retrieved
  cachedUntil?: Date;           // Cache expiration
  checksum?: string;            // Content integrity hash
  size: number;                 // Content size in bytes
  // SHA-based change detection
  sourceSha?: string;           // SHA of the source file (from Door43)
  sourceCommit?: string;        // Git commit SHA when content was fetched
}

// ProcessedContent is now imported from './processed-content'

export interface QuotaInfo {
  used: number;
  available: number;
  total: number;
  nearLimit: boolean;  // true when >80% used
}

export interface StorageInfo {
  totalSize: number;
  availableSpace: number;
  itemCount: number;
  lastCleanup: Date;
}

// ============================================================================
// RESOURCE MANAGER INTERFACES
// ============================================================================

export interface ResourceManager {
  // Initialization
  initialize(storageAdapter: StorageAdapter, resourceAdapters: ResourceAdapter[]): Promise<void>;
  
  // Metadata operations
  getResourceMetadata(server: string, owner: string, language: string): Promise<ResourceMetadata[]>;
  getOrFetchMetadataForAdapter(adapter: ResourceAdapter, server: string, owner: string, language: string): Promise<ResourceMetadata | null>;
  registerMetadataMapping(metadata: ResourceMetadata, adapter: ResourceAdapter): void;
  
  // Content operations (main orchestration method)
  getOrFetchContent(key: string, resourceType: ResourceType): Promise<ProcessedContent | null>;
  
  // Batch operations
  preloadContent(keys: string[], resourceType: ResourceType): Promise<void>;
  
  // Cache management
  clearExpiredContent(): Promise<void>;
  invalidateCache(key: string): Promise<void>;
  
  // Storage info
  getStorageInfo(): Promise<StorageInfo>;
}

export type ResourceAdapter = BookOrganizedAdapter | EntryOrganizedAdapter;

export interface EntryOrganizedAdapter extends BaseResourceAdapter {
  organizationType: 'entry';
  
  // Get content for a specific entry
  getEntryContent(server: string, owner: string, language: string, 
                 entryId: string): Promise<ProcessedContent>;
  
  // Get list of available entries
  getAvailableEntries(server: string, owner: string, language: string): Promise<EntryInfo[]>;
  
  // Check if specific entry is available
  isEntryAvailable(server: string, owner: string, language: string, 
                  entryId: string): Promise<boolean>;
}

export class ResourceError extends Error {
  constructor(message: string, public code: string) {
    super(message);
    this.name = 'ResourceError';
  }
}

// Content type interfaces are now imported from './processed-content'

// ============================================================================
// WORKSPACE TYPES
// ============================================================================

export interface WorkspaceState {
  // Current workspace configuration
  owner: string
  language: string
  server: string
  
  // Resource management (enhanced with ResourceManager)
  resourceManager: ResourceManager | null
  resources: Record<string, BaseResource>
  resourceMetadata: Record<string, ResourceMetadata>
  
  // Anchor resource (primary scripture for navigation)
  anchorResource: ResourceMetadata | null
  anchorResourceId: string | null  // The actual found resource ID (ult, glt, ulb)
  
  // Resource configuration (new architecture)
  resourceConfigs: any[]  // AppResourceConfig[] - using any to avoid circular import
  processedResourceConfig: any | null  // ProcessedResourceConfig - using any to avoid circular import
  
  // Package management
  activePackage: any | null  // ResourcePackage - using any to avoid circular import
  customPanelLayout: any | null  // PanelLayout - using any to avoid circular import
  
  // Panel configuration
  panelConfig: LinkedPanelsConfig | null
  
  // Loading states
  initializing: boolean
  workspaceReady: boolean  // Workspace is ready (resources loaded)
  navigationReady: boolean // Navigation is ready (anchor content loaded)
  appReady: boolean  // App is fully ready (workspace + navigation + anchor content)
  loadingStates: Record<string, LoadingState>
  
  // Error handling
  errors: Record<string, string>
  
  // Storage information
  storageInfo: StorageInfo | null
}


export interface LoadingState {
  loading: boolean
  progress?: number
  message?: string
}

// ============================================================================
// STORE ACTIONS
// ============================================================================

export interface WorkspaceActions {
  // Workspace management
  initializeWorkspace: (
    owner: string, 
    language: string, 
    server?: string,
    resourceMode?: 'minimal' | 'default' | 'comprehensive'
  ) => Promise<void>
  resetWorkspace: () => void
  
  // Resource metadata management
  refreshResourceMetadata: () => Promise<void>
  loadInitialAnchorContent: (bookCode?: string) => Promise<void>
  clearCache: () => Promise<void>
  
  // Content management (delegates to ResourceManager)
  getOrFetchContent: (key: string, resourceType: ResourceType) => Promise<ProcessedContent | null>
  preloadContent: (keys: string[], resourceType: ResourceType) => Promise<void>
  
  // Anchor resource management
  setAnchorResource: (resource: ResourceMetadata) => void
  getAnchorResource: () => ResourceMetadata | null
  
  // Legacy resource management (for backward compatibility)
  loadResource: (resourceType: ResourceType, resourceId: string) => Promise<BaseResource | null>
  loadScriptureResource: (resourceId: string) => Promise<BaseResource | null>
  getResource: (resourceId: string) => BaseResource | null
  isResourceAvailable: (resourceId: string) => boolean
  
  // Panel configuration management
  updatePanelConfig: (config: LinkedPanelsConfig) => void
  getPanelConfig: () => LinkedPanelsConfig | null
  
  // Package management
  setActivePackage: (pkg: any) => void  // ResourcePackage - using any to avoid circular import
  getActivePackage: () => any | null
  
  // Panel layout management
  moveResourceToPanel: (resourceId: string, targetPanelId: string, position?: number) => void
  reorderResourcesInPanel: (panelId: string, orderedIds: string[]) => void
  resetPanelLayout: () => void
  getPanelLayout: () => any | null  // PanelLayout - using any to avoid circular import
  
  // Cache and storage management  
  getStorageInfo: () => Promise<StorageInfo>
  refreshStorageInfo: () => Promise<void>
  
  // Loading state management
  setLoadingState: (key: string, state: LoadingState) => void
  clearLoadingState: (key: string) => void
  
  // Error management
  setError: (key: string, error: string) => void
  clearError: (key: string) => void
  clearAllErrors: () => void
  
  // Navigation readiness tracking
  setNavigationReady: (ready: boolean) => void
  isWorkspaceReady: () => boolean
  isNavigationReady: () => boolean
  isAppReady: () => boolean
}

export interface NavigationActions {
  // Navigation
  // Core navigation actions
  navigateToBook: (bookCode: string) => void
  navigateToReference: (reference: NavigationReference) => void
  navigateToChapter: (chapter: number) => void
  navigateToVerse: (verse: number) => void
  navigateToRange: (startChapter: number, startVerse: number, endChapter?: number, endVerse?: number) => void
  
  // History navigation (platform-agnostic)
  canGoBack: () => boolean
  canGoForward: () => boolean
  goBack: () => void
  goForward: () => void
  clearHistory: () => void
  
  // History inspection
  getHistoryAt: (index: number) => NavigationReference | null
  getHistoryLength: () => number
  getCurrentHistoryIndex: () => number
  
  // URL synchronization
  updateURL: (reference: NavigationReference) => void
  parseURLReference: (ref: string) => NavigationReference | null
  
  // Book management
  setAvailableBooks: (books: BookInfo[]) => void
  getBookInfo: (bookCode: string) => BookInfo | null
  
  // Content loading (two-step process)
  loadBookContent: (bookCode: string) => Promise<ProcessedContent | null>
  
  // Chapter/verse info (async - loads content if needed)
  getChapterCount: (bookCode: string) => Promise<number>
  getVerseCount: (bookCode: string, chapter: number) => Promise<number>
  
  // Sections info (async - loads content if needed)
  getBookSections: (bookCode: string) => Promise<TranslatorSection[]>
  
  // Persistence actions
  saveNavigationState: () => Promise<void>
  loadNavigationState: () => Promise<any>
  restoreNavigationState: (persistedState: any) => Promise<void>
  clearNavigationState: () => Promise<void>
  setInitialized: (initialized: boolean) => void
}

// ============================================================================
// COMBINED STORE TYPES
// ============================================================================

export interface WorkspaceStore extends WorkspaceState, WorkspaceActions {}

export interface NavigationStore extends NavigationState, NavigationActions {}

// ============================================================================
// CONTEXT PROVIDER PROPS
// ============================================================================

export interface WorkspaceProviderProps {
  children: React.ReactNode
  initialOwner?: string
  initialLanguage?: string
  initialServer?: string
}

export interface NavigationProviderProps {
  children: React.ReactNode
  initialBook?: string
  initialReference?: NavigationReference
}
