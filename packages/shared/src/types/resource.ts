/**
 * Resource-related types
 * TODO: Move from apps/mobile/lib/types/
 */

export interface ResourceMetadata {
  server: string;
  owner: string;
  language: string;
  id: string;
  name: string;
  type: string;
  version: string;
  lastUpdated: Date;
  available: boolean;
  isAnchor?: boolean;
}

export interface ResourceContent {
  key: string;
  resourceKey: string;
  resourceId: string;
  server: string;
  owner: string;
  language: string;
  type: string;
  bookCode?: string;
  articleId?: string;
  content: any;
  lastFetched: Date;
  cachedUntil?: Date;
  checksum?: string;
  size: number;
  sourceSha?: string;
  sourceCommit?: string;
}

