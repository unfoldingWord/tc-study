/**
 * Biblical Virtues Exchange Game Signals
 */

import type { BaseSignal } from '@bt-synergy/resource-panels'

/**
 * Action Signal - Send an action to a character
 */
export interface ActionSignal extends BaseSignal {
  type: 'action'
  action: {
    actionType: 'blessing' | 'prayer' | 'encourage' | 'virtue'
    sourceCharacterId: number
    sourceCharacterName: string
    targetCharacterId: number | 'all' | 'all-opponents'
    targetPanelId: string
    virtue?: string
    message?: string
  }
}

/**
 * Response Signal - Character responds to an action
 */
export interface ResponseSignal extends BaseSignal {
  type: 'response'
  response: {
    characterId: number
    characterName: string
    originalAction: string
    message: string
    emoji: string
  }
}

/**
 * Score Update Signal
 */
export interface ScoreSignal extends BaseSignal {
  type: 'score-update'
  score: {
    panelId: string
    blessingsGiven: number
    blessingsReceived: number
    totalInteractions: number
  }
}

/**
 * Character Selected Signal
 */
export interface CharacterSelectedSignal extends BaseSignal {
  type: 'character-selected'
  character: {
    id: number
    name: string
    panelId: string
  }
}

export type GameSignal =
  | ActionSignal
  | ResponseSignal
  | ScoreSignal
  | CharacterSelectedSignal
