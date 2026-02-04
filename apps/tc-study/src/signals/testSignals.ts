/**
 * Test Signal Definitions for Panel System Testing
 */

import type { BaseSignal } from '@bt-synergy/resource-panels'

/**
 * Token Click Signal - When a word/token is clicked in scripture
 */
export interface TokenClickSignal extends BaseSignal {
  type: 'token-click'
  token: {
    id: string
    content: string
    semanticId: string
    verseRef: string
    position: number
    transliteration?: string
    meaning?: string
  }
}

/**
 * Link Click Signal - When a resource link is clicked
 */
export interface LinkClickSignal extends BaseSignal {
  type: 'link-click'
  link: {
    url: string
    text: string
    resourceType: string
    resourceId: string
  }
}

/**
 * Navigation Request Signal - Request another panel to switch resources
 */
export interface NavigationRequestSignal extends BaseSignal {
  type: 'navigation-request'
  navigation: {
    targetPanelId: string
    targetResourceId: string
  }
}

export type TestSignal = TokenClickSignal | LinkClickSignal | NavigationRequestSignal
