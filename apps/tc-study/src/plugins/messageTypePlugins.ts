/**
 * Custom message type plugins for the linked-panels system
 * Registers signal types for resource-panels communication
 */

import { createPlugin, type MessageTypePlugin } from 'linked-panels'
import type { EntryLinkClickSignal, NotesTokenGroupsSignal, ScriptureContentRequestSignal, ScriptureContentResponseSignal, ScriptureTokensBroadcastSignal, TokenClickSignal, VerseFilterSignal } from '../signals/studioSignals'
import { useStudyStore } from '../store/studyStore'
import type { LinkClickEvent } from './types'

/**
 * Validator for token-click signals (from @bt-synergy/resource-panels)
 */
function isTokenClickSignal(content: unknown): content is TokenClickSignal {
  if (!content || typeof content !== 'object') {
    console.log('[TOKEN-CLICK VALIDATION] ❌ Message is not an object')
    return false
  }

  const message = content as any

  if (message.type !== 'token-click') {
    console.log('[TOKEN-CLICK VALIDATION] ❌ Wrong type:', message.type)
    return false
  }

  if (message.lifecycle !== 'event' && message.lifecycle !== 'request' && message.lifecycle !== 'response') {
    console.log('[TOKEN-CLICK VALIDATION] ❌ Invalid lifecycle:', message.lifecycle)
    return false
  }

  if (!message.token || typeof message.token !== 'object') {
    console.log('[TOKEN-CLICK VALIDATION] ❌ Invalid token object')
    return false
  }

  if (typeof message.token.id !== 'string') {
    console.log('[TOKEN-CLICK VALIDATION] ❌ Invalid token.id:', message.token.id)
    return false
  }

  if (typeof message.token.content !== 'string') {
    console.log('[TOKEN-CLICK VALIDATION] ❌ Invalid token.content:', message.token.content)
    return false
  }

  if (typeof message.token.semanticId !== 'string') {
    console.log('[TOKEN-CLICK VALIDATION] ❌ Invalid token.semanticId (must be string):', message.token.semanticId, typeof message.token.semanticId)
    return false
  }

  if (typeof message.token.verseRef !== 'string') {
    console.log('[TOKEN-CLICK VALIDATION] ❌ Invalid token.verseRef:', message.token.verseRef)
    return false
  }

  if (typeof message.token.position !== 'number') {
    console.log('[TOKEN-CLICK VALIDATION] ❌ Invalid token.position:', message.token.position)
    return false
  }

  // Optional: alignedSemanticIds for cross-panel highlighting
  if (message.token.alignedSemanticIds !== undefined) {
    if (!Array.isArray(message.token.alignedSemanticIds)) {
      console.log('[TOKEN-CLICK VALIDATION] ❌ alignedSemanticIds must be an array:', message.token.alignedSemanticIds)
      return false
    }
    // Validate each ID is a string
    for (const id of message.token.alignedSemanticIds) {
      if (typeof id !== 'string') {
        console.log('[TOKEN-CLICK VALIDATION] ❌ alignedSemanticIds must contain only strings:', id, typeof id)
        return false
      }
    }
  }

  if (typeof message.sourceResourceId !== 'string') {
    console.log('[TOKEN-CLICK VALIDATION] ❌ Invalid sourceResourceId:', message.sourceResourceId)
    return false
  }

  if (typeof message.timestamp !== 'number') {
    console.log('[TOKEN-CLICK VALIDATION] ❌ Invalid timestamp:', message.timestamp)
    return false
  }

  console.log('[TOKEN-CLICK VALIDATION] ✅ All checks passed!')
  return true
}

/**
 * Handler for token-click signals
 */
function handleTokenClickSignal(message: any) {
  const signal = message.content as TokenClickSignal
  console.log(`🎯 Token Click Signal: ${signal.token.content} from ${signal.sourceResourceId}`)
}

/**
 * Plugin for token-click signals (resource-panels)
 * Handles word/token selection across scripture panels
 */
export const tokenClickPlugin: MessageTypePlugin<TokenClickSignal> = createPlugin({
  name: 'token-click-signal-plugin',
  version: '2.0.0',
  description: 'Plugin for token-click signals from @bt-synergy/resource-panels',
  
  messageTypes: {
    'token-click': {} as TokenClickSignal
  },
  
  validators: {
    'token-click': isTokenClickSignal
  },
  
  handlers: {
    'token-click': handleTokenClickSignal
  }
})

// ===== VERSE FILTER PLUGIN =====

function isVerseFilterSignal(content: unknown): content is VerseFilterSignal {
  if (!content || typeof content !== 'object') return false
  const msg = content as any
  if (msg.type !== 'verse-filter') return false
  if (msg.lifecycle !== 'event') return false
  if (!msg.filter || typeof msg.filter !== 'object') return false
  if (typeof msg.filter.chapter !== 'number') return false
  if (msg.filter.verse !== undefined && typeof msg.filter.verse !== 'number') return false
  if (typeof msg.sourceResourceId !== 'string') return false
  if (typeof msg.timestamp !== 'number') return false
  return true
}

function handleVerseFilterSignal(message: any) {
  const signal = message.content as VerseFilterSignal
  console.log(`📍 Verse Filter: ch ${signal.filter.chapter}${signal.filter.verse !== undefined ? `:${signal.filter.verse}` : ''} from ${signal.sourceResourceId}`)
}

export const verseFilterPlugin: MessageTypePlugin<VerseFilterSignal> = createPlugin({
  name: 'verse-filter-plugin',
  version: '1.0.0',
  description: 'Plugin for verse/chapter filter signals from scripture viewers',
  messageTypes: { 'verse-filter': {} as VerseFilterSignal },
  validators: { 'verse-filter': isVerseFilterSignal },
  handlers: { 'verse-filter': handleVerseFilterSignal },
})

/**
 * Validator for link-click messages
 */
function isLinkClickEvent(content: unknown): content is LinkClickEvent {
  if (!content || typeof content !== 'object') {
    console.log('[LINK-CLICK VALIDATION] ❌ Message is not an object')
    return false
  }

  const message = content as any

  if (message.type !== 'link-click') {
    console.log('[LINK-CLICK VALIDATION] ❌ Wrong type:', message.type)
    return false
  }

  if (message.lifecycle !== 'event') {
    console.log('[LINK-CLICK VALIDATION] ❌ Wrong lifecycle:', message.lifecycle)
    return false
  }

  if (!message.link || typeof message.link !== 'object') {
    console.log('[LINK-CLICK VALIDATION] ❌ Invalid link object')
    return false
  }

  if (typeof message.link.url !== 'string') {
    console.log('[LINK-CLICK VALIDATION] ❌ Invalid link.url:', message.link.url)
    return false
  }

  if (typeof message.link.text !== 'string') {
    console.log('[LINK-CLICK VALIDATION] ❌ Invalid link.text:', message.link.text)
    return false
  }

  // Check optional fields if present
  if (message.link.resourceType !== undefined && typeof message.link.resourceType !== 'string') {
    console.log('[LINK-CLICK VALIDATION] ❌ Invalid link.resourceType:', message.link.resourceType)
    return false
  }

  if (message.link.resourceId !== undefined && typeof message.link.resourceId !== 'string') {
    console.log('[LINK-CLICK VALIDATION] ❌ Invalid link.resourceId:', message.link.resourceId)
    return false
  }

  if (typeof message.sourceResourceId !== 'string') {
    console.log('[LINK-CLICK VALIDATION] ❌ Invalid sourceResourceId:', message.sourceResourceId)
    return false
  }

  if (typeof message.timestamp !== 'number') {
    console.log('[LINK-CLICK VALIDATION] ❌ Invalid timestamp:', message.timestamp)
    return false
  }

  console.log('[LINK-CLICK VALIDATION] ✅ All checks passed!')
  return true
}

/**
 * Handler for link-click messages
 */
function handleLinkClick(message: any) {
  const event = message.content as LinkClickEvent
  console.log(`🔗 Link Click: ${event.link.text} (${event.link.url}) from ${event.sourceResourceId}`)
}

/**
 * Plugin for link-click messages
 * Handles navigation between related resources (e.g., TW links)
 */
export const linkClickPlugin: MessageTypePlugin<LinkClickEvent> = createPlugin({
  name: 'link-click-plugin',
  version: '1.0.0',
  description: 'Plugin for link click events in resource viewers',
  
  messageTypes: {
    'link-click': {} as LinkClickEvent
  },
  
  validators: {
    'link-click': isLinkClickEvent
  },
  
  handlers: {
    'link-click': handleLinkClick
  }
})

/**
 * Validator for scripture-content-request signals
 */
function isScriptureContentRequestSignal(content: unknown): content is ScriptureContentRequestSignal {
  if (!content || typeof content !== 'object') return false
  const message = content as any
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
 * Handler for scripture-content-request signals
 */
function handleScriptureContentRequest(message: any) {
  const signal = message.content as ScriptureContentRequestSignal
  console.log(`📤 Scripture Content Request: ${signal.request.book} ${signal.request.chapter} from ${signal.sourceResourceId}`)
}

/**
 * Plugin for scripture-content-request signals
 */
export const scriptureContentRequestPlugin: MessageTypePlugin<ScriptureContentRequestSignal> = createPlugin({
  name: 'scripture-content-request-plugin',
  version: '1.0.0',
  description: 'Plugin for scripture content request signals',
  
  messageTypes: {
    'scripture-content-request': {} as ScriptureContentRequestSignal
  },
  
  validators: {
    'scripture-content-request': isScriptureContentRequestSignal
  },
  
  handlers: {
    'scripture-content-request': handleScriptureContentRequest
  }
})

/**
 * Validator for scripture-content-response signals
 */
function isScriptureContentResponseSignal(content: unknown): content is ScriptureContentResponseSignal {
  if (!content || typeof content !== 'object') return false
  const message = content as any
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
 * Handler for scripture-content-response signals
 */
function handleScriptureContentResponse(message: any) {
  const signal = message.content as ScriptureContentResponseSignal
  console.log(`📥 Scripture Content Response: ${signal.response.book} ${signal.response.chapter} from ${signal.sourceResourceId} (hasContent: ${signal.response.hasContent})`)
}

/**
 * Plugin for scripture-content-response signals
 */
export const scriptureContentResponsePlugin: MessageTypePlugin<ScriptureContentResponseSignal> = createPlugin({
  name: 'scripture-content-response-plugin',
  version: '1.0.0',
  description: 'Plugin for scripture content response signals',
  
  messageTypes: {
    'scripture-content-response': {} as ScriptureContentResponseSignal
  },
  
  validators: {
    'scripture-content-response': isScriptureContentResponseSignal
  },
  
  handlers: {
    'scripture-content-response': handleScriptureContentResponse
  }
})

// ===== SCRIPTURE TOKENS BROADCAST PLUGIN =====

/**
 * Validator for scripture-tokens-broadcast signals
 */
function isScriptureTokensBroadcastSignal(content: unknown): content is ScriptureTokensBroadcastSignal {
  if (!content || typeof content !== 'object') {
    return false
  }

  const message = content as any

  if (message.type !== 'scripture-tokens-broadcast') {
    return false
  }

  if (message.lifecycle !== 'state') {
    return false
  }

  if (message.stateKey !== 'current-scripture-tokens') {
    return false
  }

  if (typeof message.sourceResourceId !== 'string') {
    return false
  }

  if (!message.reference || typeof message.reference !== 'object') {
    return false
  }

  if (!Array.isArray(message.tokens)) {
    return false
  }

  if (!message.resourceMetadata || typeof message.resourceMetadata !== 'object') {
    return false
  }

  if (typeof message.timestamp !== 'number') {
    return false
  }

  return true
}

/**
 * Handler for scripture-tokens-broadcast signals
 */
function handleScriptureTokensBroadcast(message: any) {
  const signal = message.content as ScriptureTokensBroadcastSignal
  // Only log when there are actual tokens to broadcast
  if (signal.tokens.length > 0) {
    console.log(`📡 Scripture Tokens Broadcast from ${signal.sourceResourceId}:`, {
      reference: signal.reference,
      tokenCount: signal.tokens.length,
    })
  }
}

/**
 * Plugin for scripture-tokens-broadcast signals
 * Handles broadcasting of scripture tokens from active panels
 */
export const scriptureTokensBroadcastPlugin: MessageTypePlugin<ScriptureTokensBroadcastSignal> = createPlugin({
  name: 'scripture-tokens-broadcast-plugin',
  version: '1.0.0',
  
  messageTypes: {
    'scripture-tokens-broadcast': {} as ScriptureTokensBroadcastSignal
  },
  
  validators: {
    'scripture-tokens-broadcast': isScriptureTokensBroadcastSignal
  },
  
  handlers: {
    'scripture-tokens-broadcast': handleScriptureTokensBroadcast
  }
})

// ===== NOTES TOKEN GROUPS PLUGIN =====

function isNotesTokenGroupsSignal(content: unknown): content is NotesTokenGroupsSignal {
  if (!content || typeof content !== 'object') return false
  const message = content as any
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

function handleNotesTokenGroupsSignal(message: any) {
  const signal = message.content as NotesTokenGroupsSignal
  const count = signal.tokenGroups.reduce((n, g) => n + g.semanticIds.length, 0)
  if (count > 0) {
    console.log(`📎 Notes token groups from ${signal.sourceResourceId}: ${signal.tokenGroups.length} groups, ${count} semantic ids`)
  }
}

export const notesTokenGroupsPlugin: MessageTypePlugin<NotesTokenGroupsSignal> = createPlugin({
  name: 'notes-token-groups-plugin',
  version: '1.0.0',
  description: 'TN/TWL broadcast of quote semantic IDs for scripture underlining',
  messageTypes: {
    'notes-token-groups': {} as NotesTokenGroupsSignal,
  },
  validators: {
    'notes-token-groups': isNotesTokenGroupsSignal,
  },
  handlers: {
    'notes-token-groups': handleNotesTokenGroupsSignal,
  },
})

// ===== ENTRY LINK CLICK PLUGIN =====

/**
 * Validator for entry-link-click signals
 */
function isEntryLinkClickSignal(content: unknown): content is EntryLinkClickSignal {
  if (!content || typeof content !== 'object') {
    return false
  }

  const message = content as any

  if (message.type !== 'entry-link-click') {
    return false
  }

  if (message.lifecycle !== 'event' && message.lifecycle !== 'request' && message.lifecycle !== 'response') {
    return false
  }

  if (!message.link || typeof message.link !== 'object') {
    return false
  }

  if (typeof message.link.resourceType !== 'string') {
    return false
  }

  if (typeof message.link.resourceId !== 'string') {
    return false
  }

  if (typeof message.link.entryId !== 'string') {
    return false
  }

  if (typeof message.link.text !== 'string') {
    return false
  }

  if (typeof message.sourceResourceId !== 'string') {
    return false
  }

  if (typeof message.timestamp !== 'number') {
    return false
  }

  return true
}

/**
 * Handler for entry-link-click signals
 * Opens the entry modal when a TW/TA link is clicked (e.g. from TWL or Notes viewer)
 */
function handleEntryLinkClick(message: any) {
  const signal = message.content as EntryLinkClickSignal
  console.log(`🔗 Entry Link Click: ${signal.link.text} (${signal.link.resourceId}#${signal.link.entryId}) from ${signal.sourceResourceId}`)
  const resourceKey = `${signal.link.resourceId}#${signal.link.entryId}`
  useStudyStore.getState().openModal(resourceKey)
}

/**
 * Plugin for entry-link-click signals
 * Handles navigation to entry-organized resources (Translation Words, Translation Academy, etc.)
 */
export const entryLinkClickPlugin: MessageTypePlugin<EntryLinkClickSignal> = createPlugin({
  name: 'entry-link-click-plugin',
  version: '1.0.0',
  description: 'Plugin for entry link click signals (Translation Words, Translation Academy, etc.)',
  
  messageTypes: {
    'entry-link-click': {} as EntryLinkClickSignal
  },
  
  validators: {
    'entry-link-click': isEntryLinkClickSignal
  },
  
  handlers: {
    'entry-link-click': handleEntryLinkClick
  }
})


