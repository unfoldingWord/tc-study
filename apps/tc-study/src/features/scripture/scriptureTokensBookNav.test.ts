import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  fullChapterForScriptureBroadcast,
  preparedChapterStateAfterNavPeek,
  resolveScriptureBroadcastBookCode,
  scriptureTokensContentStamp,
  viewModelForScriptureBroadcast,
} from './scriptureTokensBookNav'
import type { ScriptureFullChapter } from './scripturePreparer'

describe('resolveScriptureBroadcastBookCode', () => {
  test('current reference book wins over stale nav/viewModel during book switch', () => {
    expect(
      resolveScriptureBroadcastBookCode({
        currentBook: 'tit',
        navBookId: 'jhn',
        viewModelBookCode: 'jhn',
      })
    ).toBe('tit')
  })

  test('falls back to nav then viewModel when current book empty', () => {
    expect(
      resolveScriptureBroadcastBookCode({
        currentBook: '',
        navBookId: 'tit',
        viewModelBookCode: 'jhn',
      })
    ).toBe('tit')
    expect(
      resolveScriptureBroadcastBookCode({
        currentBook: null,
        navBookId: null,
        viewModelBookCode: 'rut',
      })
    ).toBe('rut')
  })
})

describe('viewModelForScriptureBroadcast', () => {
  test('rejects viewModel from another book', () => {
    expect(
      viewModelForScriptureBroadcast(
        { bookCode: 'jhn', chapters: [] } as never,
        'tit'
      )
    ).toBeNull()
    expect(
      viewModelForScriptureBroadcast(
        { bookCode: 'tit', chapters: [] } as never,
        'tit'
      )?.bookCode
    ).toBe('tit')
  })
})

describe('fullChapterForScriptureBroadcast / preparedChapterStateAfterNavPeek', () => {
  const full = (unit: number): ScriptureFullChapter => ({
    version: 1,
    unit,
    matchKeys: [],
    blocks: [],
  })

  test('drops prepared full when unit does not match open chapter', () => {
    expect(fullChapterForScriptureBroadcast(full(3), 2)).toBeNull()
    expect(fullChapterForScriptureBroadcast(full(2), 2)?.unit).toBe(2)
  })

  test('peek miss clears prior book prepared tiers (same chapter number)', () => {
    expect(preparedChapterStateAfterNavPeek(null)).toEqual({ light: null, full: null })
    expect(preparedChapterStateAfterNavPeek({ light: null, full: null })).toEqual({
      light: null,
      full: null,
    })
    const hit = { light: null, full: full(2) }
    expect(preparedChapterStateAfterNavPeek(hit)).toEqual(hit)
  })
})

describe('scriptureTokensContentStamp', () => {
  test('changes when token text changes even if counts match (book switch)', () => {
    const john = [
      { semanticId: 'tit 2:1:sound:1', text: 'sound' },
      { semanticId: 'tit 2:1:doctrine:1', text: 'doctrine' },
    ]
    const titus = [
      { semanticId: 'tit 2:1:older:1', text: 'Older' },
      { semanticId: 'tit 2:1:men:1', text: 'men' },
    ]
    expect(scriptureTokensContentStamp(john)).not.toBe(scriptureTokensContentStamp(titus))
    expect(scriptureTokensContentStamp(john)).toBe(scriptureTokensContentStamp(john))
    expect(scriptureTokensContentStamp([])).toBe('0')
  })
})

describe('book-nav SCRIPTURE_TOKENS wiring', () => {
  const root = join(import.meta.dir, '../..')

  test('prepared hook clears on peek miss; broadcast prefers currentRef book', () => {
    const prepared = readFileSync(
      join(import.meta.dir, 'usePreparedChapter.ts'),
      'utf8'
    )
    const viewer = readFileSync(
      join(root, 'components/resources/ScriptureViewer/index.tsx'),
      'utf8'
    )
    const broadcast = readFileSync(
      join(root, 'components/resources/ScriptureViewer/hooks/useTokenBroadcast.ts'),
      'utf8'
    )
    const aligned = readFileSync(
      join(root, 'components/resources/WordsLinksViewer/hooks/useAlignedTokens.ts'),
      'utf8'
    )
    expect(prepared).toContain('preparedChapterStateAfterNavPeek')
    expect(prepared).toContain('useLayoutEffect')
    expect(viewer).toContain('resolveScriptureBroadcastBookCode')
    expect(broadcast).toContain('viewModelForScriptureBroadcast')
    expect(broadcast).toContain('fullChapterForScriptureBroadcast')
    expect(aligned).toContain('scriptureTokensContentStamp')
    expect(aligned).toContain('tokenContentStamp')
  })
})
