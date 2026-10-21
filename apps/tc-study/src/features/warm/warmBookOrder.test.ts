import { describe, expect, test } from 'bun:test'
import { knownChapterCount } from '../nav/bookChapterCounts'
import {
  CANON_BOOK_ORDER,
  LANE3_JOBS_PER_PASS,
  OBS_STORY_COUNT,
  nextCanonBooks,
  nextCurrentBookChapters,
  nextUnadmittedChapters,
} from './warmBookOrder'

describe('warmBookOrder', () => {
  test('canon includes OT and NT and Psalms has 150 chapters', () => {
    expect(CANON_BOOK_ORDER[0]).toBe('gen')
    expect(CANON_BOOK_ORDER).toContain('psa')
    expect(CANON_BOOK_ORDER).toContain('mat')
    expect(CANON_BOOK_ORDER[CANON_BOOK_ORDER.length - 1]).toBe('rev')
    expect(CANON_BOOK_ORDER).toHaveLength(66)
    expect(knownChapterCount('psa')).toBe(150)
  })

  test('nextCanonBooks wraps from an OT book through Psalms then NT', () => {
    const fromJob = nextCanonBooks('job')
    expect(fromJob[0]).toBe('job')
    expect(fromJob[1]).toBe('psa')
    expect(fromJob).toContain('mat')
    expect(fromJob).toContain('rev')
    expect(fromJob).toContain('gen')
    expect(fromJob).toHaveLength(CANON_BOOK_ORDER.length)
  })

  test('nextCanonBooks from Psalms starts at psa and wraps to Genesis', () => {
    const fromPsa = nextCanonBooks('PSA')
    expect(fromPsa[0]).toBe('psa')
    expect(fromPsa[1]).toBe('pro')
    expect(fromPsa[fromPsa.length - 1]).toBe('job')
    expect(fromPsa).toContain('gen')
    expect(fromPsa).toContain('rev')
  })

  test('unknown book still walks the full canon after current', () => {
    const books = nextCanonBooks('xyz')
    expect(books[0]).toBe('xyz')
    expect(books).toContain('psa')
    expect(books).toContain('mat')
    expect(books.length).toBe(CANON_BOOK_ORDER.length + 1)
  })

  test('lane-3 resume walks remaining Psalms chapters after a throttled pass', () => {
    expect(LANE3_JOBS_PER_PASS).toBeGreaterThan(0)
    const admitted = new Set<string>()
    const jobKey = (ch: number) => `quote:tn:psa:${ch}`

    const first = nextUnadmittedChapters({
      book: 'psa',
      admittedKeys: admitted,
      jobKey,
      budget: LANE3_JOBS_PER_PASS,
    })
    expect(first).toEqual(
      Array.from({ length: LANE3_JOBS_PER_PASS }, (_, i) => i + 1)
    )
    for (const ch of first) admitted.add(jobKey(ch))

    const second = nextUnadmittedChapters({
      book: 'psa',
      admittedKeys: admitted,
      jobKey,
      budget: LANE3_JOBS_PER_PASS,
    })
    expect(second[0]).toBe(LANE3_JOBS_PER_PASS + 1)
    expect(second).toHaveLength(LANE3_JOBS_PER_PASS)

    for (const ch of second) admitted.add(jobKey(ch))
    let remaining = 0
    const leftover: number[] = []
    while (true) {
      const slice = nextUnadmittedChapters({
        book: 'psa',
        admittedKeys: admitted,
        jobKey,
        budget: LANE3_JOBS_PER_PASS,
      })
      if (slice.length === 0) break
      leftover.push(...slice)
      remaining += slice.length
      for (const ch of slice) admitted.add(jobKey(ch))
    }
    expect(first.length + second.length + remaining).toBe(150)
    expect(leftover.at(-1)).toBe(150)
    expect(
      nextUnadmittedChapters({ book: 'psa', admittedKeys: admitted, jobKey, budget: 8 })
    ).toEqual([])
  })

  test('nextCurrentBookChapters puts adjacent first, then remaining', () => {
    expect(nextCurrentBookChapters({ chapter: 2, lastChapter: 5 })).toEqual([1, 3, 2, 4, 5])
    expect(
      nextCurrentBookChapters({ chapter: 2, lastChapter: 5, skipCurrentAndAdjacent: true })
    ).toEqual([4, 5])
    expect(OBS_STORY_COUNT).toBe(50)
    expect(
      nextUnadmittedChapters({
        book: 'obs',
        last: OBS_STORY_COUNT,
        admittedKeys: [],
        jobKey: (n) => String(n),
        budget: 8,
      })
    ).toEqual([1, 2, 3, 4, 5, 6, 7, 8])
  })
})
