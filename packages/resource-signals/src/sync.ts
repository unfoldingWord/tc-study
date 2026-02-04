/**
 * Synchronization Signals
 * 
 * Signals for synchronizing state between resources
 */

import type { BaseSignal } from './index'

/**
 * Scroll Sync Signal
 * Synchronize scrolling between resources (e.g., parallel Bibles)
 */
export interface ScrollSyncSignal extends BaseSignal {
  type: 'scroll-sync'
  scroll: {
    verseRef: string
    percentage: number      // 0-1 scroll position
    book: string
    chapter: number
    verse: number
  }
}

