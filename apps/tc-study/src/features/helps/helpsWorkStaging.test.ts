import { describe, expect, test } from 'bun:test'
import {
  HELPS_PRIORITY_ROWS,
  HELPS_SYNC_MAX_LINKS,
  partitionHelpsWork,
} from './helpsWorkStaging'

function link(id: string, reference: string) {
  return { id, reference }
}

describe('helpsWorkStaging', () => {
  test('exports staging constants', () => {
    expect(HELPS_PRIORITY_ROWS).toBe(16)
    expect(HELPS_SYNC_MAX_LINKS).toBe(8)
  })

  test('returns all links as priority when under the cap', () => {
    const links = [link('a', '1:1'), link('b', '1:2'), link('c', '1:3')]
    const { priority, deferred } = partitionHelpsWork(links, { startVerse: 1, priorityRows: 16 })
    expect(priority.map((l) => l.id)).toEqual(['a', 'b', 'c'])
    expect(deferred).toEqual([])
  })

  test('prefers rows at/after startVerse in reference order', () => {
    const links = [
      link('v1a', '1:1'),
      link('v1b', '1:1'),
      link('v2', '1:2'),
      link('v3', '1:3'),
      link('v4', '1:4'),
      link('v5', '1:5'),
    ]
    const { priority, deferred } = partitionHelpsWork(links, { startVerse: 3, priorityRows: 3 })
    expect(priority.map((l) => l.id)).toEqual(['v3', 'v4', 'v5'])
    expect(deferred.map((l) => l.id)).toEqual(['v1a', 'v1b', 'v2'])
  })

  test('wraps to earlier verses when at/after is not enough', () => {
    const links = [
      link('v1', '1:1'),
      link('v2', '1:2'),
      link('v3', '1:3'),
      link('v4', '1:4'),
      link('v5', '1:5'),
    ]
    const { priority, deferred } = partitionHelpsWork(links, { startVerse: 4, priorityRows: 4 })
    expect(priority.map((l) => l.id)).toEqual(['v4', 'v5', 'v1', 'v2'])
    expect(deferred.map((l) => l.id)).toEqual(['v3'])
  })

  test('caps priority at priorityRows and preserves relative order', () => {
    const links = Array.from({ length: 20 }, (_, i) => link(`n${i + 1}`, `1:${i + 1}`))
    const { priority, deferred } = partitionHelpsWork(links, { startVerse: 1, priorityRows: 16 })
    expect(priority).toHaveLength(16)
    expect(deferred).toHaveLength(4)
    expect(priority.map((l) => l.id)).toEqual(
      Array.from({ length: 16 }, (_, i) => `n${i + 1}`)
    )
    expect(deferred.map((l) => l.id)).toEqual(['n17', 'n18', 'n19', 'n20'])
  })

  test('empty input yields empty buckets', () => {
    expect(partitionHelpsWork([], { startVerse: 1 })).toEqual({ priority: [], deferred: [] })
  })

  test('treats non-numeric verse parts as verse 1', () => {
    const links = [link('intro', 'front:intro'), link('v2', '1:2'), link('v3', '1:3')]
    const { priority, deferred } = partitionHelpsWork(links, { startVerse: 2, priorityRows: 2 })
    expect(priority.map((l) => l.id)).toEqual(['v2', 'v3'])
    expect(deferred.map((l) => l.id)).toEqual(['intro'])
  })
})
