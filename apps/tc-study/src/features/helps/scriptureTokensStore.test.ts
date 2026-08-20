import { afterEach, describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  getScriptureTokensSnapshot,
  preferHydratedScriptureTokens,
  publishScriptureTokens,
  resetScriptureTokensStore,
  scriptureTokensHaveEntries,
  scriptureTokensSnapshotKey,
  subscribeScriptureTokensSnapshot,
  type ScriptureTokensSnapshot,
} from './scriptureTokensStore'

function snapshot(overrides: Partial<ScriptureTokensSnapshot> = {}): ScriptureTokensSnapshot {
  return {
    tokens: [{ content: 'Moab', semanticId: 'rut-1-6-moab' } as ScriptureTokensSnapshot['tokens'][number]],
    reference: { book: 'rut', chapter: 1, verse: 1, endVerse: 22 },
    resourceMetadata: { id: 'es-419_gl/es-419/glt', language: 'es-419', type: 'scripture' },
    sourceResourceId: 'es-419_gl/es-419/glt',
    ...overrides,
  }
}

afterEach(() => {
  resetScriptureTokensStore()
})

describe('preferHydratedScriptureTokens', () => {
  test('late CombinedHelps remount uses the published snapshot when STATE is empty', () => {
    const published = snapshot()
    expect(preferHydratedScriptureTokens(null, published)).toBe(published)
    expect(
      preferHydratedScriptureTokens(
        { ...snapshot(), tokens: [], reference: { book: '', chapter: 0, verse: 0 } },
        published
      )
    ).toBe(published)
  })

  test('live STATE wins once CombinedHelps is linked again', () => {
    const messaging = snapshot({ sourceResourceId: 'unfoldingWord/en/ult' })
    expect(preferHydratedScriptureTokens(messaging, snapshot())).toBe(messaging)
  })
})

describe('scriptureTokensStore late subscriber (helps-mode remount)', () => {
  test('a subscriber that mounts after publish sees tokens without a nav change', () => {
    publishScriptureTokens(snapshot())
    expect(scriptureTokensHaveEntries(getScriptureTokensSnapshot())).toBe(true)
    expect(getScriptureTokensSnapshot()?.reference.book).toBe('rut')
    expect(getScriptureTokensSnapshot()?.tokens).toHaveLength(1)
  })

  test('later publish notifies an already-mounted subscriber', () => {
    const books: string[] = []
    const unsubscribe = subscribeScriptureTokensSnapshot(() => {
      books.push(getScriptureTokensSnapshot()?.reference.book ?? '')
    })
    publishScriptureTokens(snapshot())
    publishScriptureTokens(snapshot({ reference: { book: 'jhn', chapter: 1, verse: 1 } }))
    expect(books).toEqual(['rut', 'jhn'])
    unsubscribe()
  })

  test('same snapshot identity is not republished', () => {
    const first = snapshot()
    publishScriptureTokens(first)
    const held = getScriptureTokensSnapshot()
    publishScriptureTokens(snapshot())
    expect(getScriptureTokensSnapshot()).toBe(held)
    expect(scriptureTokensSnapshotKey(getScriptureTokensSnapshot())).toBe(
      scriptureTokensSnapshotKey(first)
    )
  })
})

describe('SCRIPTURE_TOKENS late-subscriber wiring', () => {
  const tokensHook = readFileSync(
    join(import.meta.dir, '../../components/resources/WordsLinksViewer/hooks/useScriptureTokens.ts'),
    'utf8'
  )
  const broadcast = readFileSync(
    join(import.meta.dir, '../../components/resources/ScriptureViewer/hooks/useTokenBroadcast.ts'),
    'utf8'
  )

  test('ScriptureViewer publishes the hydrate snapshot; CombinedHelps prefers it on remount', () => {
    expect(broadcast).toContain('publishScriptureTokens')
    expect(tokensHook).toContain('preferHydratedScriptureTokens')
    expect(tokensHook).toContain('subscribeScriptureTokensSnapshot')
    expect(tokensHook).toContain('useSyncExternalStore')
    expect(tokensHook).toContain('EMPTY_SCRIPTURE_TOKENS')
  })
})
