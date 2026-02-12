/**
 * Message types for linked-panels spike (word click and highlight broadcast)
 */

export interface WordClickMessage {
  type: 'word-click'
  lifecycle: 'event'
  word: string
  wordId: string
  position: number
  sourceResourceId: string
  timestamp: number
}

export interface HighlightedWordsBroadcast {
  type: 'highlighted-words-broadcast'
  lifecycle: 'state'
  stateKey: string
  wordIds: string[]
  selectedWordId: string | null
  sourceResourceId: string
  timestamp: number
}
