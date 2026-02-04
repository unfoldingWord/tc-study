/**
 * OPTIONAL Signal Registry
 * 
 * This is an EXAMPLE of how you might document your signals.
 * You can create your own registry or not use one at all!
 * 
 * The registry provides metadata for signal discovery and documentation,
 * but it's not required for the library to function.
 */

import type { BaseSignal, ResourceType } from '../core/types'
import type { CommonSignal } from '../examples/commonSignals'

/**
 * Metadata about a signal type
 */
export interface SignalMetadata {
  /** Signal type identifier */
  type: string
  /** Human-readable name */
  name: string
  /** Description of what this signal represents */
  description: string
  /** Common use cases */
  useCases: string[]
  /** Resource types that typically send this signal */
  commonSenderTypes: ResourceType[]
  /** Resource types that typically receive this signal */
  commonReceiverTypes: ResourceType[]
  /** Resources that typically send this signal (descriptive) */
  commonSenders: string[]
  /** Resources that typically receive this signal (descriptive) */
  commonReceivers: string[]
  /** Example of the signal data */
  example: any
}

/**
 * Central registry of all known signal types
 * 
 * This is used for:
 * - Documentation generation
 * - Developer tooling (autocomplete, IntelliSense)
 * - Runtime validation (optional)
 * - Signal discovery
 */
export const SIGNAL_REGISTRY: Record<string, SignalMetadata> = {
  'token-click': {
    type: 'token-click',
    name: 'Token Click',
    description: 'Sent when a user clicks on a word/token in a text resource',
    useCases: [
      'Show translation words article for clicked word',
      'Display word definition in a popup',
      'Highlight related words in other resources',
      'Filter notes by selected word'
    ],
    commonSenderTypes: ['scripture', 'original-language'],
    commonReceiverTypes: ['translation-words', 'translation-notes', 'lexicon', 'concordance'],
    commonSenders: [
      'Scripture Viewer (Bible, Aligned Bible)',
      'Greek New Testament Viewer',
      'Hebrew Old Testament Viewer'
    ],
    commonReceivers: [
      'Translation Words Viewer',
      'Translation Words Links Viewer',
      'Translation Notes Viewer',
      'Dictionary/Lexicon Viewers'
    ],
    example: {
      type: 'token-click',
      lifecycle: 'event',
      sourceResourceId: 'en_ult',
      timestamp: Date.now(),
      token: {
        id: 'token-jhn-1-1-4',
        content: 'λόγος',
        semanticId: 'G3056',
        verseRef: 'JHN 1:1',
        position: 4,
        transliteration: 'logos',
        meaning: 'word'
      }
    }
  },
  
  'link-click': {
    type: 'link-click',
    name: 'Link Click',
    description: 'Sent when a user clicks on a hyperlink',
    useCases: [
      'Navigate to referenced resource',
      'Open related article',
      'Follow cross-reference',
      'Load linked content'
    ],
    commonSenderTypes: ['translation-words', 'translation-notes', 'translation-academy', 'commentary'],
    commonReceiverTypes: ['translation-words', 'translation-academy', 'scripture', 'custom'],
    commonSenders: [
      'Translation Words Viewer',
      'Translation Notes Viewer',
      'Translation Academy Viewer'
    ],
    commonReceivers: [
      'Any resource viewer (depending on link type)',
      'Resource panel manager'
    ],
    example: {
      type: 'link-click',
      lifecycle: 'event',
      sourceResourceId: 'en_tn',
      timestamp: Date.now(),
      link: {
        url: 'rc://en/tw/dict/bible/kt/love',
        text: 'love',
        resourceType: 'translation-words',
        resourceId: 'en_tw'
      }
    }
  },
  
  'verse-navigation': {
    type: 'verse-navigation',
    name: 'Verse Navigation',
    description: 'Sent when navigating to a specific Bible verse',
    useCases: [
      'Synchronize all Bible-related resources to same verse',
      'Load notes for the current verse',
      'Update verse-dependent UI elements',
      'Track reading progress'
    ],
    commonSenderTypes: ['scripture', 'translation-notes', 'translation-questions', 'commentary', 'lexicon'],
    commonReceiverTypes: ['scripture', 'translation-notes', 'translation-questions', 'translation-words-links', 'commentary'],
    commonSenders: [
      'Scripture Viewer',
      'Verse selector UI',
      'Search results'
    ],
    commonReceivers: [
      'Scripture Viewer (all types)',
      'Translation Notes Viewer',
      'Translation Words Links Viewer',
      'Translation Questions Viewer'
    ],
    example: {
      type: 'verse-navigation',
      lifecycle: 'event',
      sourceResourceId: 'en_ult',
      timestamp: Date.now(),
      reference: {
        book: 'JHN',
        chapter: 3,
        verse: 16
      }
    }
  },
  
  'resource-load-request': {
    type: 'resource-load-request',
    name: 'Resource Load Request',
    description: 'Request to load a specific resource in a panel',
    useCases: [
      'Open linked resource in new panel',
      'Switch current panel to different resource',
      'Load resource in response to user action',
      'Implement resource navigation'
    ],
    commonSenderTypes: ['translation-words', 'translation-notes', 'translation-academy', 'commentary', 'scripture'],
    commonReceiverTypes: ['custom'], // System-level, not a specific resource type
    commonSenders: [
      'Any resource viewer (via link clicks)',
      'Resource selector UI',
      'Search results'
    ],
    commonReceivers: [
      'Resource Panels Provider (system-level)'
    ],
    example: {
      type: 'resource-load-request',
      lifecycle: 'request',
      sourceResourceId: 'en_tn',
      timestamp: Date.now(),
      resourceId: 'en_tw_love',
      panelId: 'panel-2',
      context: {
        from: 'link-click',
        sourceLink: 'rc://en/tw/dict/bible/kt/love'
      }
    }
  },
  
  'selection-change': {
    type: 'selection-change',
    name: 'Selection Change',
    description: 'Sent when text selection changes in a resource',
    useCases: [
      'Show contextual information for selected text',
      'Filter related content',
      'Enable selection-based actions',
      'Update highlighting in other resources'
    ],
    commonSenderTypes: ['scripture', 'original-language', 'commentary', 'translation-notes'],
    commonReceiverTypes: ['translation-notes', 'translation-words', 'commentary', 'custom'],
    commonSenders: [
      'Scripture Viewer',
      'Any text-based resource viewer'
    ],
    commonReceivers: [
      'Translation Notes Viewer',
      'Translation Words Viewer',
      'Contextual toolbar'
    ],
    example: {
      type: 'selection-change',
      lifecycle: 'event',
      sourceResourceId: 'en_ult',
      timestamp: Date.now(),
      selection: {
        text: 'For God so loved the world',
        reference: {
          book: 'JHN',
          chapter: 3,
          verse: 16
        },
        startOffset: 0,
        endOffset: 28
      }
    }
  }
}

/**
 * Get metadata for a specific signal type
 */
export function getSignalMetadata(type: string): SignalMetadata | undefined {
  return SIGNAL_REGISTRY[type]
}

/**
 * Get all registered signal types
 */
export function getAllSignalTypes(): string[] {
  return Object.keys(SIGNAL_REGISTRY)
}

/**
 * Get all signals that are commonly sent by a resource type
 */
export function getSignalsSentBy(resourceType: string): SignalMetadata[] {
  return Object.values(SIGNAL_REGISTRY).filter(meta =>
    meta.commonSenders.some(sender =>
      sender.toLowerCase().includes(resourceType.toLowerCase())
    )
  )
}

/**
 * Get all signals that are commonly received by a resource type
 */
export function getSignalsReceivedBy(resourceType: string): SignalMetadata[] {
  return Object.values(SIGNAL_REGISTRY).filter(meta =>
    meta.commonReceivers.some(receiver =>
      receiver.toLowerCase().includes(resourceType.toLowerCase())
    )
  )
}

/**
 * Search signal registry by keyword
 */
export function searchSignals(keyword: string): SignalMetadata[] {
  const lowerKeyword = keyword.toLowerCase()
  return Object.values(SIGNAL_REGISTRY).filter(meta =>
    meta.name.toLowerCase().includes(lowerKeyword) ||
    meta.description.toLowerCase().includes(lowerKeyword) ||
    meta.useCases.some(useCase => useCase.toLowerCase().includes(lowerKeyword))
  )
}

