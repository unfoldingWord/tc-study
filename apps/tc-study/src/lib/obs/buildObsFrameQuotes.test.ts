import { describe, expect, test, beforeEach } from 'bun:test'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { MergedObsFrameQuotes } from '@bt-synergy/resource-panels'
import {
  buildObsFrameQuotes,
  obsQuotesOfKind,
  obsQuotesSnapshotKey,
  preferHydratedObsQuotes,
} from './buildObsFrameQuotes'
import {
  getObsFrameQuotes,
  publishObsFrameQuotes,
  resetObsFrameQuotesStore,
  subscribeObsFrameQuotes,
} from './obsFrameQuotesStore'

const STORY_5_ROWS = [
  { id: 'tn-5-1-a', reference: '5:1', quote: 'Abram', occurrence: '1', kind: 'tn' as const },
  { id: 'tn-5-1-b', reference: '5:1', quote: 'Sarai', occurrence: '1', kind: 'tn' as const },
  { id: 'tn-5-2', reference: '5:2', quote: 'Hagar', occurrence: '1', kind: 'tn' as const },
  { id: 'twl-5-1', reference: '5:1', quote: 'Egypt', occurrence: '1', kind: 'twl' as const },
]

function payload(overrides: Partial<MergedObsFrameQuotes> = {}): MergedObsFrameQuotes {
  return {
    storyNumber: 5,
    frameNumber: 1,
    quotes: [{ sourceId: 'tn-5-1-a', kind: 'tn', quote: 'Abram', occurrence: 1 }],
    frameQuoteMap: {
      1: [{ sourceId: 'tn-5-1-a', kind: 'tn', quote: 'Abram', occurrence: 1 }],
    },
    hasQuotes: true,
    ...overrides,
  }
}

describe('buildObsFrameQuotes (initial hydrate, no nav event)', () => {
  test('first computation for story:frame builds underlines for every quote on that frame', () => {
    const built = buildObsFrameQuotes({
      book: 'obs',
      storyNumber: 5,
      frameNumber: 1,
      rows: STORY_5_ROWS,
    })
    expect(built.hasQuotes).toBe(true)
    expect(built.storyNumber).toBe(5)
    expect(built.frameNumber).toBe(1)
    expect(built.quotes.map((q) => q.sourceId)).toEqual(['tn-5-1-a', 'tn-5-1-b', 'twl-5-1'])
    expect(built.frameQuoteMap[1]?.map((q) => q.sourceId)).toEqual([
      'tn-5-1-a',
      'tn-5-1-b',
      'twl-5-1',
    ])
    expect(built.frameQuoteMap[2]?.map((q) => q.sourceId)).toEqual(['tn-5-2'])
  })

  test('non-obs book yields an empty payload (do not underline from a stale scripture ref)', () => {
    const built = buildObsFrameQuotes({
      book: 'tit',
      storyNumber: 5,
      frameNumber: 1,
      rows: STORY_5_ROWS,
    })
    expect(built.hasQuotes).toBe(false)
    expect(built.quotes).toEqual([])
    expect(built.frameQuoteMap).toEqual({})
  })

  test('obsQuotesOfKind splits CombinedHelps rows for per-publisher STATE', () => {
    const built = buildObsFrameQuotes({
      book: 'obs',
      storyNumber: 5,
      frameNumber: 1,
      rows: STORY_5_ROWS,
    })
    expect(obsQuotesOfKind(built, 'tn').quotes).toHaveLength(2)
    expect(obsQuotesOfKind(built, 'twl').quotes).toHaveLength(1)
    expect(obsQuotesOfKind(built, 'tn').frameQuoteMap[2]).toHaveLength(1)
    expect(obsQuotesOfKind(built, 'twl').frameQuoteMap[2]).toBeUndefined()
  })
})

describe('preferHydratedObsQuotes (messaging missed on cold start)', () => {
  test('uses the published snapshot when messaging STATE is still empty', () => {
    const published = payload()
    expect(preferHydratedObsQuotes(null, published)?.quotes[0]?.quote).toBe('Abram')
    expect(
      preferHydratedObsQuotes(
        { storyNumber: 0, frameNumber: 0, quotes: [], frameQuoteMap: {}, hasQuotes: false },
        published
      )?.hasQuotes
    ).toBe(true)
  })

  test('falls back to messaging when nothing is published yet', () => {
    const messaging = payload()
    expect(preferHydratedObsQuotes(messaging, null)).toBe(messaging)
  })
})

describe('obsFrameQuotesStore late subscriber (URL / refresh)', () => {
  beforeEach(() => {
    resetObsFrameQuotesStore()
  })

  test('a subscriber that mounts after publish sees quotes without a nav change', () => {
    const built = buildObsFrameQuotes({
      book: 'obs',
      storyNumber: 5,
      frameNumber: 1,
      rows: STORY_5_ROWS,
    })
    publishObsFrameQuotes(built)

    const seen: Array<string | undefined> = []
    const unsubscribe = subscribeObsFrameQuotes(() => {
      seen.push(getObsFrameQuotes()?.quotes[0]?.quote)
    })
    expect(getObsFrameQuotes()?.frameQuoteMap[1]).toHaveLength(3)
    expect(getObsFrameQuotes()?.quotes.map((q) => q.quote)).toEqual(['Abram', 'Sarai', 'Egypt'])
    expect(seen).toEqual([])
    unsubscribe()
  })

  test('later publish notifies an already-mounted subscriber', () => {
    const quotes: string[] = []
    const unsubscribe = subscribeObsFrameQuotes(() => {
      quotes.push(getObsFrameQuotes()?.quotes[0]?.quote ?? '')
    })
    publishObsFrameQuotes(
      buildObsFrameQuotes({
        book: 'obs',
        storyNumber: 5,
        frameNumber: 1,
        rows: STORY_5_ROWS,
      })
    )
    expect(quotes).toEqual(['Abram'])
    unsubscribe()
  })

  test('republishing the same quote content keeps the snapshot referentially stable', () => {
    const first = buildObsFrameQuotes({
      book: 'obs',
      storyNumber: 5,
      frameNumber: 1,
      rows: STORY_5_ROWS,
    })
    publishObsFrameQuotes(first)
    const snapshot = getObsFrameQuotes()

    let notifies = 0
    const unsubscribe = subscribeObsFrameQuotes(() => {
      notifies += 1
    })
    publishObsFrameQuotes(
      buildObsFrameQuotes({
        book: 'obs',
        storyNumber: 5,
        frameNumber: 1,
        rows: STORY_5_ROWS,
      })
    )
    publishObsFrameQuotes(first)
    expect(notifies).toBe(0)
    expect(getObsFrameQuotes()).toBe(snapshot)
    expect(obsQuotesSnapshotKey(getObsFrameQuotes())).toBe(obsQuotesSnapshotKey(first))
    unsubscribe()
  })
})

describe('OBS quote hydrate wiring', () => {
  const broadcastSrc = readFileSync(
    join(import.meta.dir, '../../components/resources/CombinedHelpsViewer/useCombinedHelpsObsQuotesBroadcast.ts'),
    'utf8'
  )
  const quotesHookSrc = readFileSync(
    join(import.meta.dir, '../../components/resources/ObsViewer/hooks/useObsFrameQuotes.ts'),
    'utf8'
  )
  const storeSrc = readFileSync(join(import.meta.dir, 'obsFrameQuotesStore.ts'), 'utf8')
  const scriptureTokensSrc = readFileSync(
    join(import.meta.dir, '../../components/resources/WordsLinksViewer/hooks/useScriptureTokens.ts'),
    'utf8'
  )

  test('CombinedHelps publishes the hydrate snapshot and ObsViewer prefers it without a nav event', () => {
    expect(broadcastSrc).toContain('publishObsFrameQuotes')
    expect(broadcastSrc).toContain('buildObsFrameQuotes')
    expect(broadcastSrc).toContain('useLayoutEffect')
    expect(quotesHookSrc).toContain('preferHydratedObsQuotes')
    expect(quotesHookSrc).toContain('subscribeObsFrameQuotes')
    expect(quotesHookSrc).toContain('useSyncExternalStore')
  })

  test('hydrate publish and scripture-token miss keep snapshot identities stable', () => {
    expect(storeSrc).toContain('obsQuotesSnapshotKey')
    expect(quotesHookSrc).toContain('EMPTY_PANEL_KEYS')
    expect(scriptureTokensSrc).toContain('EMPTY_SCRIPTURE_TOKENS')
  })
})
