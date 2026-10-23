import { describe, expect, test } from 'bun:test'
import { collectLane3Groups, flattenGroups, type Lane3PlanArgs } from './warmAdmitPlan'

const KEYS = {
  ult: 'unfoldingWord/en/ult',
  ust: 'unfoldingWord/en/ust',
  tn: 'unfoldingWord/en/tn',
  tw: 'unfoldingWord/en/tw',
  ta: 'unfoldingWord/en/ta',
  obs: 'unfoldingWord/en/obs',
} as const

const OL_KEY = 'unfoldingWord/hbo/uhb'

function plan(extra: Partial<Lane3PlanArgs> & Record<string, unknown> = {}) {
  return flattenGroups(
    collectLane3Groups({
      bookId: 'gen',
      downloadedKeys: Object.values(KEYS),
      textLanguageCode: 'en',
      helpsLanguageCode: 'en',
      articleIdsByKey: { [KEYS.tw]: ['bible/kt/god'], [KEYS.ta]: ['translate/figs-metaphor'] },
      admittedKeys: [],
      budget: Number.MAX_SAFE_INTEGER,
      olStampForBook: () => ({ olKey: OL_KEY, olStamp: 'ol1' }),
      ...extra,
    } as Lane3PlanArgs)
  )
}

const canonJobs = (jobs: ReturnType<typeof plan>) =>
  jobs.filter((j) => j.kind !== 'prepare-article' && j.resourceKey !== KEYS.obs)
const chaptersOfJob = (j: ReturnType<typeof plan>[number]) =>
  j.kind === 'prepare-unit' ? j.unit : j.kind === 'quote-chapter' || j.kind === 'align-chapter' ? j.chapter : 0

describe('collectLane3Groups, book by book', () => {
  test('without the new options it walks the whole canon, articles and OBS as before', () => {
    const jobs = plan()
    expect(new Set(canonJobs(jobs).map((j) => j.bookId)).size).toBe(66)
    expect(jobs.some((j) => j.kind === 'prepare-article')).toBe(true)
    expect(jobs.some((j) => j.resourceKey === KEYS.obs)).toBe(true)
  })

  test("books: ['rut'] plans only Ruth", () => {
    const jobs = canonJobs(plan({ books: ['rut'] }))
    expect(jobs.length).toBeGreaterThan(0)
    expect(new Set(jobs.map((j) => j.bookId))).toEqual(new Set(['rut']))
    const ultChapters = jobs.filter((j) => j.kind === 'prepare-unit' && j.resourceKey === KEYS.ult).map(chaptersOfJob)
    expect(ultChapters).toEqual([1, 2, 3, 4])
  })

  test('chaptersOf returning [1, 2] plans only chapters 1 and 2', () => {
    const jobs = canonJobs(plan({ books: ['rut'], chaptersOf: () => [1, 2] }))
    expect(jobs.length).toBeGreaterThan(0)
    expect(new Set(jobs.map(chaptersOfJob))).toEqual(new Set([1, 2]))
    // Each kind still gets its jobs: prepare for every resource, quote and align for TN.
    expect(jobs.filter((j) => j.kind === 'prepare-unit' && j.resourceKey === KEYS.ust).map(chaptersOfJob)).toEqual([1, 2])
    expect(jobs.filter((j) => j.kind === 'quote-chapter' && j.resourceKey === KEYS.tn).map(chaptersOfJob)).toEqual([1, 2])
    expect(jobs.filter((j) => j.kind === 'align-chapter' && j.resourceKey === KEYS.tn).length).toBe(4)
  })

  test('chaptersOf returning null or [] plans nothing for that resource', () => {
    for (const lacking of [null, []]) {
      const jobs = canonJobs(
        plan({ books: ['rut'], chaptersOf: (key: string) => (key === KEYS.ust ? lacking : [1, 2, 3, 4]) })
      )
      expect(jobs.some((j) => j.resourceKey === KEYS.ust)).toBe(false)
      // Nor is UST a target of TN's alignments: it has no text to align against.
      expect(jobs.some((j) => j.kind === 'align-chapter' && j.targetKey === KEYS.ust)).toBe(false)
      expect(jobs.some((j) => j.kind === 'align-chapter' && j.targetKey === KEYS.ult)).toBe(true)
    }
  })

  test('alignments are planned only for the chapters both the helps and the text have', () => {
    const jobs = plan({ books: ['rut'], chaptersOf: (key: string) => (key === KEYS.ult ? [1] : [1, 2, 3]) })
    const align = jobs.filter((j) => j.kind === 'align-chapter' && j.targetKey === KEYS.ult)
    expect(align.map(chaptersOfJob)).toEqual([1])
  })

  test('articles: false plans no article jobs, obs: false no OBS jobs', () => {
    const noArticles = plan({ books: ['rut'], articles: false })
    expect(noArticles.some((j) => j.kind === 'prepare-article')).toBe(false)
    expect(noArticles.some((j) => j.resourceKey === KEYS.obs)).toBe(true)

    const noObs = plan({ books: ['rut'], obs: false })
    expect(noObs.some((j) => j.resourceKey === KEYS.obs)).toBe(false)
    expect(noObs.some((j) => j.kind === 'prepare-article')).toBe(true)
  })

  test('books: [] with articles and OBS plans only the shared work', () => {
    const jobs = plan({ books: [] })
    expect(canonJobs(jobs)).toEqual([])
    expect(jobs.some((j) => j.kind === 'prepare-article')).toBe(true)
    expect(jobs.some((j) => j.resourceKey === KEYS.obs)).toBe(true)
  })
})
