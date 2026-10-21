import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  isOrphanScriptureTokensPointer,
  isScriptureTokensOwner,
  pickSuccessorScriptureResourceId,
  resolveLastActiveAfterScriptureUnmount,
  shouldClaimScriptureTokensOwnership,
} from './scriptureTokensOwnership'

describe('isScriptureTokensOwner', () => {
  test('lastActive wins over anchor', () => {
    expect(
      isScriptureTokensOwner({
        resourceId: 'ult',
        lastActiveScriptureResourceId: 'ult',
        anchorResourceId: 'ust',
      })
    ).toBe(true)
    expect(
      isScriptureTokensOwner({
        resourceId: 'ust',
        lastActiveScriptureResourceId: 'ult',
        anchorResourceId: 'ust',
      })
    ).toBe(false)
  })

  test('falls back to anchor when lastActive cleared', () => {
    expect(
      isScriptureTokensOwner({
        resourceId: 'ust',
        lastActiveScriptureResourceId: null,
        anchorResourceId: 'ust',
      })
    ).toBe(true)
    expect(
      isScriptureTokensOwner({
        resourceId: 'ult',
        lastActiveScriptureResourceId: null,
        anchorResourceId: 'ust',
      })
    ).toBe(false)
  })

  test('bootstrap denies all when neither lastActive nor anchor set', () => {
    expect(
      isScriptureTokensOwner({
        resourceId: 'ult',
        lastActiveScriptureResourceId: null,
        anchorResourceId: null,
      })
    ).toBe(false)
    expect(
      isScriptureTokensOwner({
        resourceId: 'ust',
        lastActiveScriptureResourceId: null,
        anchorResourceId: null,
      })
    ).toBe(false)
  })
})

describe('scripture → helps mode-switch ownership handoff', () => {
  test('leaving panel that is both lastActive and anchor does not keep itself', () => {
    const leaving = 'unfoldingWord/en/ult#2'
    const panel1 = 'unfoldingWord/en/ult'
    expect(
      resolveLastActiveAfterScriptureUnmount({
        leavingResourceId: leaving,
        lastActiveScriptureResourceId: leaving,
        anchorResourceId: leaving,
        successorResourceId: panel1,
      })
    ).toBe(panel1)
    expect(
      resolveLastActiveAfterScriptureUnmount({
        leavingResourceId: leaving,
        lastActiveScriptureResourceId: leaving,
        anchorResourceId: leaving,
        successorResourceId: null,
      })
    ).toBeNull()
  })

  test('prefers a different anchor over successor when leaving was lastActive', () => {
    expect(
      resolveLastActiveAfterScriptureUnmount({
        leavingResourceId: 'ult#2',
        lastActiveScriptureResourceId: 'ult#2',
        anchorResourceId: 'ult',
        successorResourceId: 'ust',
      })
    ).toBe('ult')
  })

  test('does not rewrite lastActive when a different panel already owns it', () => {
    expect(
      resolveLastActiveAfterScriptureUnmount({
        leavingResourceId: 'ult#2',
        lastActiveScriptureResourceId: 'ult',
        anchorResourceId: 'ult#2',
        successorResourceId: 'ust',
      })
    ).toBe('ult')
  })

  test('pickSuccessor skips the leaving id', () => {
    expect(
      pickSuccessorScriptureResourceId('ult#2', ['ult#2', 'ult', 'ust'])
    ).toBe('ult')
    expect(pickSuccessorScriptureResourceId('ult', ['ult'])).toBeNull()
  })

  test('orphan pointer and claim rules recover after helps remount', () => {
    const live = new Set(['unfoldingWord/en/ult'])
    expect(isOrphanScriptureTokensPointer('unfoldingWord/en/ult#2', live)).toBe(true)
    expect(isOrphanScriptureTokensPointer('unfoldingWord/en/ult', live)).toBe(false)
    expect(isOrphanScriptureTokensPointer(null, live)).toBe(false)
    expect(
      shouldClaimScriptureTokensOwnership({
        resourceId: 'unfoldingWord/en/ult',
        lastActiveScriptureResourceId: 'unfoldingWord/en/ult#2',
        liveScriptureResourceIds: live,
      })
    ).toBe(true)
    expect(
      shouldClaimScriptureTokensOwnership({
        resourceId: 'unfoldingWord/en/ult',
        lastActiveScriptureResourceId: null,
        liveScriptureResourceIds: live,
      })
    ).toBe(true)
    expect(
      shouldClaimScriptureTokensOwnership({
        resourceId: 'unfoldingWord/en/ult',
        lastActiveScriptureResourceId: 'unfoldingWord/en/ult',
        liveScriptureResourceIds: live,
      })
    ).toBe(false)
  })

  test('ScriptureViewer wires handoff + reclaim; token publish uses catalog key', () => {
    const viewer = readFileSync(
      join(import.meta.dir, '../../components/resources/ScriptureViewer/index.tsx'),
      'utf8'
    )
    const broadcast = readFileSync(
      join(
        import.meta.dir,
        '../../components/resources/ScriptureViewer/hooks/useTokenBroadcast.ts'
      ),
      'utf8'
    )
    const tokensHook = readFileSync(
      join(
        import.meta.dir,
        '../../components/resources/WordsLinksViewer/hooks/useScriptureTokens.ts'
      ),
      'utf8'
    )
    expect(viewer).toContain('resolveLastActiveAfterScriptureUnmount')
    expect(viewer).toContain('pickSuccessorScriptureResourceId')
    expect(viewer).toContain('shouldClaimScriptureTokensOwnership')
    expect(broadcast).toContain('sourceResourceId: resourceKey')
    expect(tokensHook).toContain('resourceMetadata?.id')
  })
})
