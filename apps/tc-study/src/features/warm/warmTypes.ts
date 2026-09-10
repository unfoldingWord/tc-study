/**
 * Warm-lane job types — small postMessage payloads (keys + stamps only).
 */

import type { PrepareTier } from '../prepare/prepareKeys'

export type WarmLane = 1 | 2 | 3

/**
 * finished = wrote; cached = already present or true empty-chapter;
 * blocked = local SoT or UHB/UGNT USFM missing (retry after download; no DCS);
 * noop = cancelled / other missing inputs (do not mark coverage).
 */
export type WarmJobOutcome = 'finished' | 'cached' | 'blocked' | 'noop'

export type WarmJobKind =
  | 'prepare-unit'
  | 'quote-chapter'
  | 'align-chapter'
  | 'prepare-article'

export interface WarmJobBase {
  /** Stable dedupe key for the scheduler. */
  jobKey: string
  lane: WarmLane
  kind: WarmJobKind
  /** Language code for pane-switch cancel (owner/lang/id → lang). */
  languageCode?: string
  resourceKey: string
  bookId: string
}

export interface WarmPrepareUnitJob extends WarmJobBase {
  kind: 'prepare-unit'
  typeId: string
  unit: number
  tier: PrepareTier | 'both'
}

export interface WarmQuoteChapterJob extends WarmJobBase {
  kind: 'quote-chapter'
  chapter: number
  helpsStamp: string
  olKey: string
  olStamp: string
  /** 'notes' | 'words-links' — which source to read. */
  helpsType: 'notes' | 'words-links'
}

export interface WarmAlignChapterJob extends WarmJobBase {
  kind: 'align-chapter'
  chapter: number
  helpsStamp: string
  olKey: string
  olStamp: string
  targetKey: string
  targetStamp: string
  helpsType: 'notes' | 'words-links'
  textLanguage?: string
}

export interface WarmPrepareArticleJob extends WarmJobBase {
  kind: 'prepare-article'
  typeId: string
  /** Article / entry id within the resource. */
  unit: string
  tier: PrepareTier | 'both'
}

export type WarmJob =
  | WarmPrepareUnitJob
  | WarmQuoteChapterJob
  | WarmAlignChapterJob
  | WarmPrepareArticleJob

export type WarmInMsg =
  | { id: string; type: 'enqueue'; job: WarmJob }
  | { id: string; type: 'cancel'; resourceKey?: string; bookId?: string; languageCode?: string }
  | { id: string; type: 'stats' }

export type WarmOutMsg =
  | { id: string; type: 'ok'; result?: unknown }
  | { id: string; type: 'error'; message: string }
  | {
      id: string
      type: 'done'
      jobKey: string
      kind: WarmJobKind
      lane: WarmLane
      outcome: WarmJobOutcome
    }
  | {
      id: string
      type: 'stats'
      queueDepth: number
      byLane: { 1: number; 2: number; 3: number }
    }
