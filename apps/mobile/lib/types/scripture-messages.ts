/**
 * Message types for scripture token broadcasting via linked-panels
 */

import { BaseMessageContent } from 'linked-panels';
import type { OptimizedToken } from '../services/usfm-processor';

/**
 * Scripture tokens broadcast message
 * This is a STATE message sent reactively by scripture resources when notes
 * resources request tokens via notes-token-groups-broadcast. The message persists
 * in the state, allowing notes resources to access token data for quote building.
 */
export interface ScriptureTokensBroadcast extends BaseMessageContent {
  type: 'scripture-tokens-broadcast';
  lifecycle: 'state';
  stateKey: 'current-scripture-tokens'; // Fixed key for current scripture tokens
  
  /** The resource ID that is broadcasting the tokens */
  sourceResourceId: string;
  
  /** Current navigation reference */
  reference: {
    book: string;
    chapter: number;
    verse: number;
    endChapter?: number;
    endVerse?: number;
  };
  
  /** List of tokens from the filtered verse range */
  tokens: OptimizedToken[];
  
  /** Resource metadata for context */
  resourceMetadata: {
    id: string;
    language: string;
    languageDirection?: 'ltr' | 'rtl';
    type: string;
  };
  
  /** Timestamp when the broadcast was sent */
  timestamp: number;
}

/**
 * Note token group for highlighting specific notes in scripture
 */
export interface NoteTokenGroup {
  noteId: string;
  noteReference: string;
  quote: string;
  occurrence: number;
  tokens: OptimizedToken[];
  colorIndex: number; // Index for color cycling to ensure consistent colors between source and target
}

/**
 * Notes token groups broadcast message
 * This allows notes resources to send groups of tokens to scripture resources
 * for highlighting different notes with different colors. When notes resources
 * broadcast token groups, scripture resources respond by sending their tokens
 * back via scripture-tokens-broadcast (reactive request-response pattern).
 */
export interface NotesTokenGroupsBroadcast extends BaseMessageContent {
  type: 'notes-token-groups-broadcast';
  lifecycle: 'state';
  stateKey: 'current-notes-token-groups';
  
  /** The notes resource ID that is broadcasting the token groups */
  sourceResourceId: string;
  
  /** Current navigation reference */
  reference: {
    book: string;
    chapter: number;
    verse: number;
    endChapter?: number;
    endVerse?: number;
  };
  
  /** Groups of tokens, one per note */
  tokenGroups: NoteTokenGroup[];
  
  /** Resource metadata for context */
  resourceMetadata: {
    id: string;
    language: string;
    languageDirection?: 'ltr' | 'rtl';
    type: string;
  };
  
  /** Timestamp when the broadcast was sent */
  timestamp: number;
}

/**
 * Token click broadcast message
 * This is an EVENT message for when a user clicks on a token in scripture
 * Used for filtering notes by clicked tokens (non-persistent)
 */
export interface TokenClickBroadcast extends BaseMessageContent {
  type: 'token-click-broadcast';
  lifecycle: 'event';
  
  /** The clicked token information */
  clickedToken: {
    id: number;
    content: string;
    semanticId: string;
    alignedSemanticIds?: string[];
    verseRef: string;
  };
  
  /** The resource ID that detected the click */
  sourceResourceId: string;
  
  /** Timestamp when the click occurred */
  timestamp: number;
}

/**
 * Note selection broadcast message
 * This is an EVENT message for when a user clicks on a note in the NotesViewer
 * Used for highlighting the selected note's tokens as active
 * When selectedNote is null, it indicates clearing/deselecting the current selection
 */
export interface NoteSelectionBroadcast extends BaseMessageContent {
  type: 'note-selection-broadcast';
  lifecycle: 'event';
  
  /** The selected note information, or null to clear selection */
  selectedNote: {
    noteId: string;
    tokenGroupId: string; // The corresponding token group ID for underlining
    quote: string;
    reference: string;
  } | null;
  
  /** The resource ID that detected the selection */
  sourceResourceId: string;
  
  /** Timestamp when the selection occurred */
  timestamp: number;
}

/**
 * Verse reference filter broadcast message
 * This is an EVENT message for when a user clicks on a verse number in the scripture viewer
 * Used for filtering notes/TWL by verse reference (secondary filter type)
 */
export interface VerseReferenceFilterBroadcast extends BaseMessageContent {
  type: 'verse-reference-filter-broadcast';
  lifecycle: 'event';
  
  /** The verse reference to filter by */
  verseReference: {
    book: string;
    chapter: number;
    verse: number;
  };
  
  /** The resource ID that initiated the verse filter */
  sourceResourceId: string;
  
  /** Timestamp when the verse filter was applied */
  timestamp: number;
}

/**
 * Message registry for scripture-related messages
 */
export interface ScriptureMessageTypes {
  'scripture-tokens-broadcast': ScriptureTokensBroadcast;
  'notes-token-groups-broadcast': NotesTokenGroupsBroadcast;
  'token-click-broadcast': TokenClickBroadcast;
  'note-selection-broadcast': NoteSelectionBroadcast;
  'verse-reference-filter-broadcast': VerseReferenceFilterBroadcast;
}
