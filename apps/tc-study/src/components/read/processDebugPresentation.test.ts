import { describe, expect, test } from 'bun:test'
import {
  isProcessDebugDocked,
  isProcessDebugOpen,
  nextProcessDebugPresentation,
  type ProcessDebugPresentation,
} from './processDebugPresentation'

describe('processDebugPresentation', () => {
  test('open from closed → modal; open while docked stays docked', () => {
    expect(nextProcessDebugPresentation('closed', 'open')).toBe('modal')
    expect(nextProcessDebugPresentation('modal', 'open')).toBe('modal')
    expect(nextProcessDebugPresentation('docked', 'open')).toBe('docked')
  })

  test('dock / undock / close transitions', () => {
    expect(nextProcessDebugPresentation('modal', 'dock')).toBe('docked')
    expect(nextProcessDebugPresentation('docked', 'undock')).toBe('modal')
    expect(nextProcessDebugPresentation('docked', 'close')).toBe('closed')
    expect(nextProcessDebugPresentation('modal', 'close')).toBe('closed')
    expect(nextProcessDebugPresentation('closed', 'dock')).toBe('closed')
    expect(nextProcessDebugPresentation('modal', 'undock')).toBe('modal')
  })

  test('open helpers', () => {
    const states: ProcessDebugPresentation[] = ['closed', 'modal', 'docked']
    expect(states.map(isProcessDebugOpen)).toEqual([false, true, true])
    expect(states.map(isProcessDebugDocked)).toEqual([false, false, true])
  })
})
