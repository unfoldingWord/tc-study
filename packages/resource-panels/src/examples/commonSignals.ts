/**
 * Common Signal Type Examples
 * 
 * These are OPTIONAL signal definitions that you can use or adapt for your needs.
 * You are NOT required to use these - define your own signals based on your use case!
 * 
 * These examples are provided for Bible/translation apps, but the library works with ANY signal types.
 */

import type { BaseSignal } from '../core/types'

/**
 * EXAMPLE: Word/Token Click Signal
 * 
 * Use when: User clicks on a word in scripture text
 * Common senders: Scripture viewers, original language viewers
 * Common receivers: Lexicons, translation words, translation notes
 * 
 * Feel free to adapt this structure to your needs!
 */
export interface TokenClickSignal extends BaseSignal {
  type: 'token-click'
  token: {
    id: string
    content: string
    semanticId: string  // e.g., Strong's number
    verseRef: string
    position: number
    transliteration?: string
    meaning?: string
  }
  intendedTarget?: string
}

/**
 * EXAMPLE: Link Click Signal
 * 
 * Use when: User clicks a hyperlink in article text
 * Common senders: Translation notes, translation words, articles
 * Common receivers: Any resource that can handle the link type
 * 
 * Adapt to your linking structure!
 */
export interface LinkClickSignal extends BaseSignal {
  type: 'link-click'
  link: {
    url: string
    text: string
    type?: string
    resourceType?: string
    resourceId?: string
  }
}

/**
 * EXAMPLE: Verse Navigation Signal
 * 
 * Use when: User navigates to a different verse
 * Common senders: Scripture viewers, verse selectors
 * Common receivers: All Bible-related resources
 * 
 * Customize the reference structure as needed!
 */
export interface VerseNavigationSignal extends BaseSignal {
  type: 'verse-navigation'
  reference: {
    book: string
    chapter: number
    verse: number
  }
}

/**
 * EXAMPLE: Resource Load Request Signal
 * 
 * Use when: Requesting to load a specific resource
 * Common senders: Any resource (via links)
 * Common receivers: Panel/resource managers
 */
export interface ResourceLoadRequestSignal extends BaseSignal {
  type: 'resource-load-request'
  resourceId: string
  panelId?: string
  context?: Record<string, any>
}

/**
 * EXAMPLE: Selection Change Signal
 * 
 * Use when: User selects text in a resource
 * Common senders: Text-based viewers
 * Common receivers: Contextual tools, translation aids
 */
export interface SelectionChangeSignal extends BaseSignal {
  type: 'selection-change'
  selection: {
    text: string
    reference?: {
      book: string
      chapter: number
      verse: number
    }
    startOffset?: number
    endOffset?: number
  }
}

/**
 * Union type of all example signals
 * 
 * You can create your own union type with YOUR signal types
 */
export type CommonSignal =
  | TokenClickSignal
  | LinkClickSignal
  | VerseNavigationSignal
  | ResourceLoadRequestSignal
  | SelectionChangeSignal

/**
 * Example: How to define your own signals
 * 
 * ```typescript
 * import { BaseSignal } from '@bt-synergy/resource-panels'
 * 
 * export interface MyCustomSignal extends BaseSignal {
 *   type: 'my-custom-event'
 *   myData: {
 *     // Whatever fields you need
 *     field1: string
 *     field2: number
 *   }
 * }
 * 
 * // Use it with the hooks
 * const { sendToAll } = useSignal<MyCustomSignal>('my-custom-event', resourceId, metadata)
 * sendToAll({ lifecycle: 'event', myData: { field1: 'value', field2: 42 } })
 * ```
 */

