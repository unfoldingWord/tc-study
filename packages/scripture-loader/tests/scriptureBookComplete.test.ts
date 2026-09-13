import { describe, expect, test } from 'bun:test'
import { USJ_PROCESSING_VERSION, USJ_TOOL_VERSIONS } from '@bt-synergy/usj-processor'

import {
  hasScripturePayload,
  isCachedScriptureBookComplete,
  isScriptureBookComplete,
  scriptureChapterNumbers,
} from '../src/scriptureBookComplete'
import {
  usjScriptureChapterKey,
  usjScriptureKey,
} from '../src/scriptureCacheKeys'

const usjChapter = {
  content: {
    usj: { type: 'USJ', content: [{ c: 1 }] },
    chapters: [{ number: 1, content: [{ c: 1 }] }],
  },
}

const stampedChapter = {
  content: {
    metadata: {
      version: USJ_PROCESSING_VERSION,
      toolVersions: { ...USJ_TOOL_VERSIONS },
    },
    usj: { type: 'USJ', content: [{ c: 1 }] },
    chapters: [{ number: 1, content: [{ c: 1 }] }],
  },
}

describe('isScriptureBookComplete', () => {
  test('ch1-only thin index is not complete for Psalms', () => {
    expect(
      isScriptureBookComplete({
        bookEntry: { content: { chapterNumbers: [1] } },
        firstChapter: usjChapter,
        lastChapter: usjChapter,
        bookId: 'psa',
      })
    ).toBe(false)
  })

  test('only psa:119 thin index is not complete', () => {
    expect(
      isScriptureBookComplete({
        bookEntry: { content: { chapterNumbers: [119] } },
        firstChapter: usjChapter,
        lastChapter: usjChapter,
        bookId: 'psa',
      })
    ).toBe(false)
  })

  test('first+last chapter proof is complete', () => {
    expect(
      isScriptureBookComplete({
        bookEntry: { content: { chapterNumbers: [1, 2] } },
        firstChapter: usjChapter,
        lastChapter: {
          content: {
            usj: { type: 'USJ', content: [{ c: 2 }] },
            chapters: [{ number: 2, content: [{ c: 2 }] }],
          },
        },
        bookId: 'psa',
      })
    ).toBe(true)
  })

  test('known single-chapter book with ch1 is complete', () => {
    expect(
      isScriptureBookComplete({
        bookEntry: { content: { chapterNumbers: [1] } },
        firstChapter: usjChapter,
        lastChapter: usjChapter,
        bookId: 'oba',
      })
    ).toBe(true)
  })

  test('stale processing version is not complete', () => {
    expect(
      isScriptureBookComplete({
        bookEntry: {
          content: {
            metadata: { version: '0.0.0-old', toolVersions: { parser: 'x', usjCore: 'y' } },
            usj: { type: 'USJ', content: [{ c: 1 }] },
            chapters: [{ number: 1, content: [{ c: 1 }] }],
          },
        },
        firstChapter: null,
        lastChapter: null,
        bookId: 'psa',
      })
    ).toBe(false)
  })
})

describe('isCachedScriptureBookComplete', () => {
  test('reads first+last keys; ch1-only Psalms is incomplete', async () => {
    const resourceKey = 'unfoldingWord/en/ult'
    const store = new Map<string, unknown>([
      [
        usjScriptureKey(resourceKey, 'psa'),
        { content: { chapterNumbers: [1, 2], bookCode: 'psa' } },
      ],
      [usjScriptureChapterKey(resourceKey, 'psa', 1), stampedChapter],
    ])
    const cache = {
      async get(key: string) {
        return store.get(key) ?? null
      },
    }
    expect(await isCachedScriptureBookComplete(cache, resourceKey, 'psa')).toBe(false)
    store.set(usjScriptureChapterKey(resourceKey, 'psa', 2), {
      content: {
        metadata: {
          version: USJ_PROCESSING_VERSION,
          toolVersions: { ...USJ_TOOL_VERSIONS },
        },
        usj: { type: 'USJ', content: [{ c: 2 }] },
        chapters: [{ number: 2, content: [{ c: 2 }] }],
      },
    })
    expect(await isCachedScriptureBookComplete(cache, resourceKey, 'psa')).toBe(true)
  })
})

describe('hasScripturePayload / scriptureChapterNumbers', () => {
  test('thin index is not payload', () => {
    expect(hasScripturePayload({ content: { chapterNumbers: [1, 2] } })).toBe(false)
    expect(scriptureChapterNumbers({ content: { chapterNumbers: [1, 2] } })).toEqual([1, 2])
  })
})
