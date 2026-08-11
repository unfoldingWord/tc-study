/**
 * Contract STATE signal shapes used by tc-study viewers.
 *
 * Apps may use richer local types (e.g. OptimizedToken[]) as long as they
 * match these keys/lifecycles. Prefer `useResourceState` / `useResourceStateSender`
 * over importing `useCurrentState` / `useResourceAPI` from linked-panels.
 */

import type { BaseStateSignal } from '../core/types'
import {
  RESOURCE_STATE_KEYS,
  type ObsFrameQuotesStateKey,
  type ResourceStateKey,
} from './keys'

/**
 * Minimal token shape for scripture-tokens STATE.
 * Apps may widen (e.g. OptimizedToken[]) — no index signature so structural
 * subtypes remain assignable.
 */
export interface ScriptureStateToken {
  id?: number | string
  text?: string
  type?: string
}

/**
 * Scripture tokens broadcast — STATE from scripture viewers.
 * Receivers: WordsLinks, Notes/CombinedHelps quote builders.
 * Ownership: single writer (app-enforced); not multi-publisher LWW.
 */
export interface ScriptureTokensStateSignal extends BaseStateSignal {
  type: 'scripture-tokens-broadcast'
  stateKey: typeof RESOURCE_STATE_KEYS.SCRIPTURE_TOKENS
  reference: {
    book: string
    chapter: number
    verse: number
    endChapter?: number
    endVerse?: number
  }
  tokens: ScriptureStateToken[]
  resourceMetadata: {
    id: string
    language: string
    languageDirection?: 'ltr' | 'rtl'
    type: string
  }
}

export type NotesTokenGroupsStateKey =
  | typeof RESOURCE_STATE_KEYS.NOTES_TOKEN_GROUPS_TN
  | typeof RESOURCE_STATE_KEYS.NOTES_TOKEN_GROUPS_TWL

export interface NotesTokenGroupEntry {
  sourceId: string
  semanticIds: string[]
}

/**
 * Notes token groups — STATE from TN / TWL / CombinedHelps.
 * Receivers: ScriptureViewer underlining (`useUnderlinedTokens`).
 */
export interface NotesTokenGroupsStateSignal extends BaseStateSignal {
  type: 'notes-token-groups'
  stateKey: NotesTokenGroupsStateKey
  tokenGroups: NotesTokenGroupEntry[]
  resourceMetadata: {
    id: string
    language: string
    type: string
  }
}

export interface ObsFrameQuoteEntry {
  sourceId: string
  kind: 'tn' | 'twl'
  quote: string
  occurrence: number
  startWord?: number
  endWord?: number
  wordRanges?: Array<{ startWord: number; endWord: number }>
}

/**
 * OBS frame quotes — STATE from TN / TWL / CombinedHelps (OBS mode).
 * Per-publisher keys (`OBS_FRAME_QUOTES_TN` / `_TWL`); ObsViewer merges.
 */
export interface ObsFrameQuotesStateSignal extends BaseStateSignal {
  type: 'obs-frame-quotes'
  stateKey: ObsFrameQuotesStateKey
  storyNumber: number
  frameNumber: number
  quotes: ObsFrameQuoteEntry[]
  frameQuoteMap?: Record<number, ObsFrameQuoteEntry[]>
}

/** Union of package-defined STATE contracts */
export type CommonStateSignal =
  | ScriptureTokensStateSignal
  | NotesTokenGroupsStateSignal
  | ObsFrameQuotesStateSignal

/** Map known state keys → primary signal type (for docs / Team Viewers). */
export type StateSignalForKey<K extends ResourceStateKey> =
  K extends typeof RESOURCE_STATE_KEYS.SCRIPTURE_TOKENS
    ? ScriptureTokensStateSignal
    : K extends NotesTokenGroupsStateKey
      ? NotesTokenGroupsStateSignal
      : K extends ObsFrameQuotesStateKey
        ? ObsFrameQuotesStateSignal
        : BaseStateSignal
