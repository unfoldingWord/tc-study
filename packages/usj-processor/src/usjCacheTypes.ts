import type { UsjToolVersions } from './versions'
import type { AlignmentMap } from './usfmTools'

/** Minimal USJ document stored as cache SoT. */
export type CachedUsjDocument = {
  type?: string
  version?: string
  content?: unknown[]
}

/**
 * Book-level USJ SoT payload under `scripture-usj:{resourceKey}:{bookId}`.
 * Chapter chunks store `{ number, content: nodes[] }`; alignments per chapter under `:alignments`.
 */
export interface UsjScriptureCacheContent {
  book: string
  bookCode: string
  metadata: {
    version: string
    toolVersions: UsjToolVersions
    processingDate: string
    bookCode: string
    bookName: string
  }
  /** Full USJ (when not chunked) or omitted on chunked manifest. */
  usj?: CachedUsjDocument
  /** Full alignment map (when not chunked) or omitted on chunked manifest. */
  alignmentMap?: AlignmentMap
  /**
   * Per-chapter USJ node slices for IndexedDB chunking.
   * Present on logical entry before split / after reassemble.
   */
  chapters?: Array<{ number: number; content: unknown[] }>
}
