/**
 * Cross-platform resource action types for BT Synergy apps
 * 
 * These interfaces work with both React (web) and React Native.
 * Apps provide platform-specific implementations.
 */

/**
 * Export format options
 */
export type ExportFormat = 
  | 'json'
  | 'usfm'
  | 'text'
  | 'markdown'
  | 'pdf'
  | 'docx'
  | 'html';

/**
 * Download progress information
 */
export interface DownloadProgress {
  /** Resource being downloaded */
  resourceId: string;
  /** Total bytes to download (if known) */
  totalBytes?: number;
  /** Bytes downloaded so far */
  downloadedBytes: number;
  /** Progress percentage (0-100) */
  percentage: number;
  /** Current download stage */
  stage: 'pending' | 'downloading' | 'processing' | 'complete' | 'error';
  /** Error message if stage is 'error' */
  error?: string;
}

/**
 * Download options
 */
export interface DownloadOptions {
  /** Force re-download even if cached */
  force?: boolean;
  /** Progress callback */
  onProgress?: (progress: DownloadProgress) => void;
  /** Priority (higher = download sooner) */
  priority?: number;
}

/**
 * Resource metadata update
 */
export interface ResourceUpdate {
  /** Display name */
  name?: string;
  /** Description */
  description?: string;
  /** Custom tags */
  tags?: string[];
  /** Custom metadata */
  metadata?: Record<string, any>;
}

/**
 * Share options
 */
export interface ShareOptions {
  /** Share title */
  title?: string;
  /** Share message/text */
  message?: string;
  /** Share URL */
  url?: string;
  /** Share method (platform-specific) */
  method?: 'native' | 'copy' | 'email' | 'clipboard';
}

/**
 * Export options
 */
export interface ExportOptions {
  /** Export format */
  format: ExportFormat;
  /** Include metadata in export */
  includeMetadata?: boolean;
  /** Platform-specific save options */
  saveOptions?: {
    /** Suggested filename */
    filename?: string;
    /** MIME type */
    mimeType?: string;
  };
}

/**
 * Resource collection reference
 */
export interface CollectionRef {
  /** Collection ID */
  id: string;
  /** Collection name (optional, for display) */
  name?: string;
}

/**
 * Cross-platform resource actions provider interface
 * 
 * Apps implement this interface to provide platform-specific resource management.
 * Resource viewers use this interface through hooks.
 * 
 * @example Web implementation
 * ```ts
 * const actions: ResourceActionsProvider = {
 *   downloadResource: async (id, options) => {
 *     const response = await fetch(`/api/resources/${id}/download`);
 *     // ... handle download
 *   },
 *   shareResource: async (id, options) => {
 *     if (navigator.share) {
 *       await navigator.share({ url: `/resource/${id}` });
 *     } else {
 *       await navigator.clipboard.writeText(`/resource/${id}`);
 *     }
 *   },
 *   // ...
 * }
 * ```
 * 
 * @example React Native implementation
 * ```ts
 * const actions: ResourceActionsProvider = {
 *   downloadResource: async (id, options) => {
 *     // Use react-native-fs or expo-file-system
 *   },
 *   shareResource: async (id, options) => {
 *     await Share.share({ message: options?.message });
 *   },
 *   // ...
 * }
 * ```
 */
export interface ResourceActionsProvider {
  // ===== RESOURCE MANAGEMENT =====
  
  /**
   * Download a resource for offline use
   * @param resourceId Resource identifier
   * @param options Download options
   */
  downloadResource(resourceId: string, options?: DownloadOptions): Promise<void>;
  
  /**
   * Delete/remove a resource
   * @param resourceId Resource identifier
   * @param deleteLocalOnly Only delete local cached copy
   */
  deleteResource(resourceId: string, deleteLocalOnly?: boolean): Promise<void>;
  
  /**
   * Update resource metadata
   * @param resourceId Resource identifier
   * @param updates Metadata updates
   */
  updateResource(resourceId: string, updates: ResourceUpdate): Promise<void>;
  
  /**
   * Refresh resource data from source
   * @param resourceId Resource identifier
   */
  refreshResource(resourceId: string): Promise<void>;
  
  /**
   * Check if resource is available offline
   * @param resourceId Resource identifier
   */
  isResourceAvailableOffline(resourceId: string): Promise<boolean>;
  
  /**
   * Get resource download progress
   * @param resourceId Resource identifier
   */
  getDownloadProgress(resourceId: string): Promise<DownloadProgress | null>;
  
  // ===== COLLECTIONS =====
  
  /**
   * Add resource to a collection
   * @param resourceId Resource identifier
   * @param collectionRef Collection reference
   */
  addToCollection(resourceId: string, collectionRef: CollectionRef): Promise<void>;
  
  /**
   * Remove resource from a collection
   * @param resourceId Resource identifier
   * @param collectionId Collection identifier
   */
  removeFromCollection(resourceId: string, collectionId: string): Promise<void>;
  
  /**
   * Get collections containing this resource
   * @param resourceId Resource identifier
   */
  getResourceCollections(resourceId: string): Promise<CollectionRef[]>;
  
  // ===== SHARING & EXPORT =====
  
  /**
   * Share a resource
   * @param resourceId Resource identifier
   * @param options Share options
   */
  shareResource(resourceId: string, options?: ShareOptions): Promise<void>;
  
  /**
   * Export resource data
   * @param resourceId Resource identifier
   * @param options Export options
   */
  exportResource(resourceId: string, options: ExportOptions): Promise<void>;
  
  /**
   * Copy resource text/content to clipboard
   * @param resourceId Resource identifier
   * @param contentId Optional specific content (e.g., verse reference)
   */
  copyToClipboard(resourceId: string, contentId?: string): Promise<void>;
}

/**
 * Optional subset of resource actions
 * Apps can implement partial actions if some features aren't supported
 */
export type PartialResourceActionsProvider = Partial<ResourceActionsProvider>;
