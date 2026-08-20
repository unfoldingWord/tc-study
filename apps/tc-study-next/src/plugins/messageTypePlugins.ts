/**
 * Custom message type plugins for the linked-panels system
 * Registers signal types for resource-panels communication
 */

import { createPlugin } from '@bt-synergy/resource-panels'
import type {
  EntryLinkClickSignal,
  NotesTokenGroupsSignal,
  ObsFrameHighlightSignal,
  ObsFrameQuotesSignal,
  ScriptureContentRequestSignal,
  ScriptureContentResponseSignal,
  ScriptureTokensBroadcastSignal,
  TokenClickSignal,
  VerseFilterSignal,
} from '../signals/studioSignals'
import { useEntryModalStore } from '../features/entries'
import type { LinkClickEvent } from './types'

/**
 * Validator for token-click signals (from @bt-synergy/resource-panels)
 */
function isTokenClickSignal(content: unknown): content is TokenClickSignal {
  if (!content || typeof content !== 'object') return false

  const message = content as TokenClickSignal

  if (message.type !== 'token-click') return false
  if (message.lifecycle !== 'event' && message.lifecycle !== 'request' && message.lifecycle !== 'response') {
    return false
  }
  if (typeof message.sourceResourceId !== 'string') return false
  if (typeof message.timestamp !== 'number') return false

  // null token = clear active highlight / helps token filter (toggle-off)
  if (message.token === null) return true

  if (!message.token || typeof message.token !== 'object') return false
  if (typeof message.token.id !== 'string') return false
  if (typeof message.token.content !== 'string') return false
  if (typeof message.token.semanticId !== 'string') return false
  if (typeof message.token.verseRef !== 'string') return false
  if (typeof message.token.position !== 'number') return false

  // Optional: alignedSemanticIds for cross-panel highlighting
  if (message.token.alignedSemanticIds !== undefined) {
    if (!Array.isArray(message.token.alignedSemanticIds)) return false
    for (const id of message.token.alignedSemanticIds) {
      if (typeof id !== 'string') return false
    }
  }

  return true
}

/**
 * Plugin for token-click signals (resource-panels)
 * Handles word/token selection across scripture panels
 */
export const tokenClickPlugin = createPlugin({
  name: 'token-click-signal-plugin',
  version: '2.0.0',
  description: 'Plugin for token-click signals from @bt-synergy/resource-panels',
  messageTypes: {
    'token-click': {} as TokenClickSignal,
  },
  validators: {
    'token-click': isTokenClickSignal,
  },
})

// ===== VERSE FILTER PLUGIN =====

function isVerseFilterSignal(content: unknown): content is VerseFilterSignal {
  if (!content || typeof content !== 'object') return false
  const msg = content as VerseFilterSignal
  if (msg.type !== 'verse-filter') return false
  if (msg.lifecycle !== 'event') return false
  if (typeof msg.sourceResourceId !== 'string') return false
  if (typeof msg.timestamp !== 'number') return false
  // null filter = clear a prior scripture-driven verse filter
  if (msg.filter === null) return true
  if (!msg.filter || typeof msg.filter !== 'object') return false
  if (typeof msg.filter.chapter !== 'number') return false
  if (msg.filter.verse !== undefined && typeof msg.filter.verse !== 'number') return false
  return true
}

export const verseFilterPlugin = createPlugin({
  name: 'verse-filter-plugin',
  version: '1.0.0',
  description: 'Plugin for verse/chapter filter signals from scripture viewers',
  messageTypes: { 'verse-filter': {} as VerseFilterSignal },
  validators: { 'verse-filter': isVerseFilterSignal },
})

/**
 * Validator for link-click messages
 */
function isLinkClickEvent(content: unknown): content is LinkClickEvent {
  if (!content || typeof content !== 'object') return false

  const message = content as LinkClickEvent

  if (message.type !== 'link-click') return false
  if (message.lifecycle !== 'event') return false
  if (!message.link || typeof message.link !== 'object') return false
  if (typeof message.link.url !== 'string') return false
  if (typeof message.link.text !== 'string') return false
  if (message.link.resourceType !== undefined && typeof message.link.resourceType !== 'string') {
    return false
  }
  if (message.link.resourceId !== undefined && typeof message.link.resourceId !== 'string') {
    return false
  }
  if (typeof message.sourceResourceId !== 'string') return false
  if (typeof message.timestamp !== 'number') return false

  return true
}

/**
 * Plugin for link-click messages
 * Handles navigation between related resources (e.g., TW links)
 */
export const linkClickPlugin = createPlugin({
  name: 'link-click-plugin',
  version: '1.0.0',
  description: 'Plugin for link click events in resource viewers',
  messageTypes: {
    'link-click': {} as LinkClickEvent,
  },
  validators: {
    'link-click': isLinkClickEvent,
  },
})

/**
 * Validator for scripture-content-request signals
 */
function isScriptureContentRequestSignal(content: unknown): content is ScriptureContentRequestSignal {
  if (!content || typeof content !== 'object') return false
  const message = content as ScriptureContentRequestSignal
  if (message.type !== 'scripture-content-request') return false
  if (message.lifecycle !== 'event' && message.lifecycle !== 'request') return false
  if (!message.request || typeof message.request !== 'object') return false
  if (typeof message.request.book !== 'string') return false
  if (typeof message.request.chapter !== 'number') return false
  if (typeof message.sourceResourceId !== 'string') return false
  if (typeof message.timestamp !== 'number') return false
  return true
}

/**
 * Plugin for scripture-content-request signals
 */
export const scriptureContentRequestPlugin = createPlugin({
  name: 'scripture-content-request-plugin',
  version: '1.0.0',
  description: 'Plugin for scripture content request signals',
  messageTypes: {
    'scripture-content-request': {} as ScriptureContentRequestSignal,
  },
  validators: {
    'scripture-content-request': isScriptureContentRequestSignal,
  },
})

/**
 * Validator for scripture-content-response signals
 */
function isScriptureContentResponseSignal(content: unknown): content is ScriptureContentResponseSignal {
  if (!content || typeof content !== 'object') return false
  const message = content as ScriptureContentResponseSignal
  if (message.type !== 'scripture-content-response') return false
  if (message.lifecycle !== 'event' && message.lifecycle !== 'response') return false
  if (!message.response || typeof message.response !== 'object') return false
  if (typeof message.response.requestId !== 'string') return false
  if (typeof message.response.resourceId !== 'string') return false
  if (typeof message.response.resourceKey !== 'string') return false
  if (typeof message.response.book !== 'string') return false
  if (typeof message.response.chapter !== 'number') return false
  if (typeof message.response.hasContent !== 'boolean') return false
  if (typeof message.sourceResourceId !== 'string') return false
  if (typeof message.timestamp !== 'number') return false
  return true
}

/**
 * Plugin for scripture-content-response signals
 */
export const scriptureContentResponsePlugin = createPlugin({
  name: 'scripture-content-response-plugin',
  version: '1.0.0',
  description: 'Plugin for scripture content response signals',
  messageTypes: {
    'scripture-content-response': {} as ScriptureContentResponseSignal,
  },
  validators: {
    'scripture-content-response': isScriptureContentResponseSignal,
  },
})

// ===== SCRIPTURE TOKENS BROADCAST PLUGIN =====

/**
 * Validator for scripture-tokens-broadcast signals
 */
function isScriptureTokensBroadcastSignal(content: unknown): content is ScriptureTokensBroadcastSignal {
  if (!content || typeof content !== 'object') return false

  const message = content as ScriptureTokensBroadcastSignal

  if (message.type !== 'scripture-tokens-broadcast') return false
  if (message.lifecycle !== 'state') return false
  if (message.stateKey !== 'current-scripture-tokens') return false
  if (typeof message.sourceResourceId !== 'string') return false
  if (!message.reference || typeof message.reference !== 'object') return false
  if (!Array.isArray(message.tokens)) return false
  if (!message.resourceMetadata || typeof message.resourceMetadata !== 'object') return false
  if (typeof message.timestamp !== 'number') return false

  return true
}

/**
 * Plugin for scripture-tokens-broadcast signals
 * Handles broadcasting of scripture tokens from active panels
 */
export const scriptureTokensBroadcastPlugin = createPlugin({
  name: 'scripture-tokens-broadcast-plugin',
  version: '1.0.0',
  messageTypes: {
    'scripture-tokens-broadcast': {} as ScriptureTokensBroadcastSignal,
  },
  validators: {
    'scripture-tokens-broadcast': isScriptureTokensBroadcastSignal,
  },
})

// ===== NOTES TOKEN GROUPS PLUGIN =====

function isNotesTokenGroupsSignal(content: unknown): content is NotesTokenGroupsSignal {
  if (!content || typeof content !== 'object') return false
  const message = content as NotesTokenGroupsSignal
  if (message.type !== 'notes-token-groups') return false
  if (message.lifecycle !== 'state') return false
  if (
    message.stateKey !== 'current-notes-token-groups-tn' &&
    message.stateKey !== 'current-notes-token-groups-twl'
  ) {
    return false
  }
  if (typeof message.sourceResourceId !== 'string') return false
  if (!Array.isArray(message.tokenGroups)) return false
  for (const g of message.tokenGroups) {
    if (!g || typeof g !== 'object') return false
    if (typeof g.sourceId !== 'string') return false
    if (!Array.isArray(g.semanticIds)) return false
    for (const id of g.semanticIds) {
      if (typeof id !== 'string') return false
    }
  }
  if (!message.resourceMetadata || typeof message.resourceMetadata !== 'object') return false
  if (typeof message.resourceMetadata.id !== 'string') return false
  if (typeof message.resourceMetadata.language !== 'string') return false
  if (typeof message.resourceMetadata.type !== 'string') return false
  if (typeof message.timestamp !== 'number') return false
  return true
}

export const notesTokenGroupsPlugin = createPlugin({
  name: 'notes-token-groups-plugin',
  version: '1.0.0',
  description: 'TN/TWL broadcast of quote semantic IDs for scripture underlining',
  messageTypes: {
    'notes-token-groups': {} as NotesTokenGroupsSignal,
  },
  validators: {
    'notes-token-groups': isNotesTokenGroupsSignal,
  },
})

// ===== ENTRY LINK CLICK PLUGIN =====

/**
 * Validator for entry-link-click signals
 */
function isEntryLinkClickSignal(content: unknown): content is EntryLinkClickSignal {
  if (!content || typeof content !== 'object') return false

  const message = content as EntryLinkClickSignal

  if (message.type !== 'entry-link-click') return false
  if (message.lifecycle !== 'event' && message.lifecycle !== 'request' && message.lifecycle !== 'response') {
    return false
  }
  if (!message.link || typeof message.link !== 'object') return false
  if (typeof message.link.resourceType !== 'string') return false
  if (typeof message.link.resourceId !== 'string') return false
  if (typeof message.link.entryId !== 'string') return false
  if (typeof message.link.text !== 'string') return false
  if (typeof message.sourceResourceId !== 'string') return false
  if (typeof message.timestamp !== 'number') return false

  return true
}

/**
 * Handler for entry-link-click signals
 * Opens the entry modal when a TW/TA link is clicked (e.g. from TWL or Notes viewer)
 */
function handleEntryLinkClick(message: { content: EntryLinkClickSignal }) {
  const signal = message.content
  const resourceKey = `${signal.link.resourceId}#${signal.link.entryId}`
  useEntryModalStore.getState().openModal(resourceKey)
}

/**
 * Plugin for entry-link-click signals
 * Handles navigation to entry-organized resources (Translation Words, Translation Academy, etc.)
 */
export const entryLinkClickPlugin = createPlugin({
  name: 'entry-link-click-plugin',
  version: '1.0.0',
  description: 'Plugin for entry link click signals (Translation Words, Translation Academy, etc.)',
  messageTypes: {
    'entry-link-click': {} as EntryLinkClickSignal,
  },
  validators: {
    'entry-link-click': isEntryLinkClickSignal,
  },
  handlers: {
    'entry-link-click': handleEntryLinkClick,
  },
})

// ===== OBS FRAME HIGHLIGHT PLUGIN =====

function isObsFrameHighlightSignal(content: unknown): content is ObsFrameHighlightSignal {
  if (!content || typeof content !== 'object') return false
  const message = content as ObsFrameHighlightSignal
  if (message.type !== 'obs-frame-highlight') return false
  if (message.lifecycle !== 'event') return false
  if (typeof message.sourceResourceId !== 'string') return false
  if (typeof message.timestamp !== 'number') return false
  if (message.highlight === null) return true
  const h = message.highlight
  if (typeof h.storyNumber !== 'number') return false
  if (typeof h.frameNumber !== 'number') return false
  const hasWordPick = Array.isArray(h.overlappingSourceIds) && h.overlappingSourceIds.length > 0
  const hasLegacy = typeof h.quote === 'string' && typeof h.occurrence === 'number'
  if (!hasWordPick && !hasLegacy) return false
  if (hasWordPick) {
    for (const id of h.overlappingSourceIds!) {
      if (typeof id !== 'string') return false
    }
    if (h.wordIndex !== undefined && typeof h.wordIndex !== 'number') return false
  }
  if (h.rowId !== undefined && typeof h.rowId !== 'string') return false
  if (h.kind !== undefined && h.kind !== 'tn' && h.kind !== 'twl') return false
  return true
}

export const obsFrameHighlightPlugin = createPlugin({
  name: 'obs-frame-highlight-plugin',
  version: '1.0.0',
  description: 'OBS frame substring highlight (TN/TWL ↔ ObsViewer)',
  messageTypes: { 'obs-frame-highlight': {} as ObsFrameHighlightSignal },
  validators: { 'obs-frame-highlight': isObsFrameHighlightSignal },
})

// ===== OBS FRAME QUOTES STATE PLUGIN =====

function isObsFrameQuotesSignal(content: unknown): content is ObsFrameQuotesSignal {
  if (!content || typeof content !== 'object') return false
  const message = content as ObsFrameQuotesSignal
  if (message.type !== 'obs-frame-quotes') return false
  if (message.lifecycle !== 'state') return false
  if (
    message.stateKey !== 'current-obs-frame-quotes-tn' &&
    message.stateKey !== 'current-obs-frame-quotes-twl'
  ) {
    return false
  }
  if (typeof message.sourceResourceId !== 'string') return false
  if (typeof message.storyNumber !== 'number') return false
  if (typeof message.frameNumber !== 'number') return false
  if (!Array.isArray(message.quotes)) return false
  for (const q of message.quotes) {
    if (!q || typeof q !== 'object') return false
    if (typeof q.sourceId !== 'string') return false
    if (q.kind !== 'tn' && q.kind !== 'twl') return false
    if (typeof q.quote !== 'string') return false
    if (typeof q.occurrence !== 'number') return false
    if (q.startWord !== undefined && typeof q.startWord !== 'number') return false
    if (q.endWord !== undefined && typeof q.endWord !== 'number') return false
  }
  if (typeof message.timestamp !== 'number') return false
  return true
}

export const obsFrameQuotesPlugin = createPlugin({
  name: 'obs-frame-quotes-plugin',
  version: '1.0.0',
  description: 'OBS TN/TWL quote broadcast for clickable frame text',
  messageTypes: { 'obs-frame-quotes': {} as ObsFrameQuotesSignal },
  validators: { 'obs-frame-quotes': isObsFrameQuotesSignal },
})
