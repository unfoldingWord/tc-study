/**
 * Package Manifest Types for Web Creator
 * Simplified from mobile app types for web use
 */

export type ResourceType = 
  | 'scripture'
  | 'notes'
  | 'questions'
  | 'words'
  | 'words_links'
  | 'academy'
  | 'stories';

export type ResourceRole = 
  | 'anchor'
  | 'primary'
  | 'supplementary'
  | 'reference'
  | 'background';

export type ResourceStatus =
  | 'pending'
  | 'available'
  | 'cached'
  | 'outdated'
  | 'error'
  | 'not_found';

export type PackageStatus =
  | 'draft'
  | 'ready'
  | 'downloading'
  | 'cached'
  | 'error'
  | 'updating';

export interface ResourceLocation {
  type: 'bundled' | 'phone' | 'sdcard' | 'web' | 'url';
  path: string;
  format: 'compressed' | 'uncompressed';
}

export interface ResourceMetadata {
  id: string;
  type: string;
  subjects: string[];
  books?: Array<{ code: string; name: string }>;
  articles?: Array<{ id: string; title: string }>;
  version: string;
  size: number;
  lastUpdated: string;
  owner: string;
  language: string;
  languageName?: string;
  format?: string;
  description?: string;
  sourceUrl?: string;
  releaseUrl?: string;
  commitSha?: string;
}

export interface ResourceManifestEntry {
  id: string;
  type: ResourceType;
  metadata: ResourceMetadata;
  contentLocation: ResourceLocation;
  status: ResourceStatus;
  role: ResourceRole;
  panelId: string;
  order: number;
}

export interface PanelConfig {
  id: string;
  title: string;
  description?: string;
  resourceIds: string[];
  defaultResourceId: string;
  visible: boolean;
  closable: boolean;
  resizable: boolean;
  width?: number;
  minWidth?: number;
  maxWidth?: number;
}

export interface PanelLayout {
  panels: PanelConfig[];
  layoutVersion: string;
}

export interface PackageManifest {
  formatVersion: string;
  id: string;
  name: string;
  description?: string;
  version: string;
  primaryOrganization?: string;
  primaryLanguage?: string;
  createdAt: string;
  updatedAt: string;
  createdBy?: string;
  resources: ResourceManifestEntry[];
  panelLayout: PanelLayout;
  passageSetIds?: string[];
  config: {
    defaultServer: string;
    offlineEnabled: boolean;
    autoUpdate: boolean;
    updateFrequency?: 'daily' | 'weekly' | 'monthly' | 'manual';
  };
  metadata?: {
    author?: string;
    license?: string;
    category?: string;
    tags?: string[];
  };
  stats: {
    totalSize?: number;
    downloadedSize?: number;
    resourceCount?: number;
    organizations?: string[];
    languages?: string[];
    subjects?: string[];
    estimatedSize?: number;
  };
  status: PackageStatus;
}

// Door43 types - re-export from door43-api for compatibility
export type { Door43Resource, Door43Language } from '@bt-synergy/door43-api'
export type { Door43Owner as Door43Organization } from '@bt-synergy/door43-api'