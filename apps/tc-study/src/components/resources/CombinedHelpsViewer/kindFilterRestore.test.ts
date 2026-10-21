import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  EMPTY_BOOK_KIND_RESTORE,
  enterBookKindFilter,
  restoreBookKindFilter,
} from './kindFilterRestore'

describe('kindFilterRestore', () => {
  test('Apply Metaphor from all → clear → all', () => {
    const applied = enterBookKindFilter(EMPTY_BOOK_KIND_RESTORE, 'all', 'notes')
    expect(applied.kindFilter).toBe('notes')
    const cleared = restoreBookKindFilter(applied.restore)
    expect(cleared.kindFilter).toBe('all')
    expect(cleared.restore.remembered).toBeNull()
  })

  test('Apply TWL article from all → clear → all', () => {
    const applied = enterBookKindFilter(EMPTY_BOOK_KIND_RESTORE, 'all', 'twl')
    expect(applied.kindFilter).toBe('twl')
    const cleared = restoreBookKindFilter(applied.restore)
    expect(cleared.kindFilter).toBe('all')
  })

  test('Apply Metaphor from notes → clear → notes', () => {
    const applied = enterBookKindFilter(EMPTY_BOOK_KIND_RESTORE, 'notes', 'notes')
    expect(applied.kindFilter).toBe('notes')
    const cleared = restoreBookKindFilter(applied.restore)
    expect(cleared.kindFilter).toBe('notes')
  })

  test('Apply TWL article from twl → clear → twl', () => {
    const applied = enterBookKindFilter(EMPTY_BOOK_KIND_RESTORE, 'twl', 'twl')
    expect(applied.kindFilter).toBe('twl')
    const cleared = restoreBookKindFilter(applied.restore)
    expect(cleared.kindFilter).toBe('twl')
  })

  test('Metaphor then TWL chip keeps the original kind snapshot', () => {
    const metaphor = enterBookKindFilter(EMPTY_BOOK_KIND_RESTORE, 'all', 'notes')
    const twl = enterBookKindFilter(metaphor.restore, metaphor.kindFilter, 'twl')
    expect(twl.kindFilter).toBe('twl')
    const cleared = restoreBookKindFilter(twl.restore)
    expect(cleared.kindFilter).toBe('all')
  })

  test('token/verse clear does not stomp kind when no book chip was remembered', () => {
    const idle = restoreBookKindFilter(EMPTY_BOOK_KIND_RESTORE)
    expect(idle.kindFilter).toBeNull()
    expect(idle.restore).toBe(EMPTY_BOOK_KIND_RESTORE)
  })

  test('apply and clear paths wire kind restore', () => {
    const handlers = readFileSync(join(import.meta.dir, 'useCombinedHelpsHandlers.ts'), 'utf8')
    const chrome = readFileSync(join(import.meta.dir, 'helpsFilterChrome.tsx'), 'utf8')
    const signals = readFileSync(join(import.meta.dir, 'useCombinedHelpsSignals.ts'), 'utf8')
    const viewer = readFileSync(join(import.meta.dir, 'index.tsx'), 'utf8')
    expect(handlers).toContain("enterBookKindFilter?.('notes')")
    expect(handlers).toContain("enterBookKindFilter?.('twl')")
    expect(handlers).toContain('helpsFilterAnchorFromRow')
    expect(handlers).toContain("helpsFilterAnchorFromRow('tn'")
    expect(handlers).toContain("helpsFilterAnchorFromRow('twl'")
    expect(chrome).toContain('args.restoreBookKind()')
    expect(chrome).toContain('onClearSupportRefFilter={clearSupportRef}')
    expect(chrome).toContain('onClearTwlArticleFilter={clearTwlArticle}')
    expect(signals).toContain('restoreBookKind?.()')
    const tokenNullClear = signals.slice(
      signals.indexOf('if (nextFilter === null)'),
      signals.indexOf('setTokenFilter(nextFilter)')
    )
    expect(tokenNullClear).not.toContain('restoreBookKind')
    expect(viewer).toContain('enterBookKindFilter: filters.enterBookKind')
    expect(viewer).toContain('restoreBookKind: filters.restoreBookKind')
  })
})
