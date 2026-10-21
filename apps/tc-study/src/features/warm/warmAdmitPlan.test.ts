import { describe, expect, test } from 'bun:test'
import {
  collectLane2Groups,
  collectLane3Groups,
  flattenGroups,
  sortLane2Keys,
} from './warmAdmitPlan'
import { classifyWarmResource } from './warmResourceClass'

const KEYS = {
  ult: 'unfoldingWord/en/ult',
  ust: 'unfoldingWord/en/ust',
  tn: 'unfoldingWord/en/tn',
  twl: 'unfoldingWord/en/twl',
  tq: 'unfoldingWord/en/tq',
  tw: 'unfoldingWord/en/tw',
  ta: 'unfoldingWord/en/ta',
} as const

const DOWNLOADED = Object.values(KEYS)

const stamps = {
  helpsStampByKey: {
    [KEYS.tn]: 'tn1',
    [KEYS.twl]: 'twl1',
    [KEYS.tq]: 'tq1',
    [KEYS.tw]: 'tw1',
    [KEYS.ta]: 'ta1',
  },
  targetStampByKey: {
    [KEYS.ult]: 'ult1',
    [KEYS.ust]: 'ust1',
  },
  olKey: 'unfoldingWord/el-x-koine/ugnt',
  olStamp: 'ol1',
}

function olStampForBook() {
  return { olKey: stamps.olKey, olStamp: stamps.olStamp }
}

describe('lane 2 current-book admission', () => {
  test('includes non-visible scripture in the same language before other books', () => {
    const groups = collectLane2Groups({
      bookId: 'tit',
      chapter: 2,
      lastChapter: 3,
      downloadedKeys: DOWNLOADED,
      visibleKeys: [KEYS.ult, KEYS.tn],
      sourceResourceId: KEYS.ult,
      textLanguageCode: 'en',
      helpsLanguageCode: 'en',
      stamps,
      olKey: stamps.olKey,
      olStamp: stamps.olStamp,
    })
    const jobs = flattenGroups(groups)
    expect(jobs.every((j) => j.lane === 2)).toBe(true)
    expect(jobs.every((j) => j.bookId === 'tit' || j.kind === 'prepare-article')).toBe(true)

    const ustPrep = jobs.filter(
      (j) => j.kind === 'prepare-unit' && j.resourceKey === KEYS.ust && j.bookId === 'tit'
    )
    expect(ustPrep.length).toBeGreaterThan(0)
    expect(new Set(ustPrep.map((j) => (j.kind === 'prepare-unit' ? j.unit : 0)))).toEqual(
      new Set([1, 2, 3])
    )

    const sorted = sortLane2Keys(DOWNLOADED.map(classifyWarmResource), {
      textLanguageCode: 'en',
      helpsLanguageCode: 'en',
      visibleKeys: new Set([KEYS.ult, KEYS.tn]),
    })
    const ustIdx = sorted.findIndex((i) => i.key === KEYS.ust)
    const tqIdx = sorted.findIndex((i) => i.key === KEYS.tq)
    expect(ustIdx).toBeGreaterThanOrEqual(0)
    expect(tqIdx).toBeGreaterThan(ustIdx)
  })

  test('skips current-chapter quote/align for visible TN/TWL; other chapters stay', () => {
    const jobs = flattenGroups(
      collectLane2Groups({
        bookId: 'tit',
        chapter: 2,
        lastChapter: 3,
        downloadedKeys: DOWNLOADED,
        visibleKeys: [KEYS.ult, KEYS.tn],
        sourceResourceId: KEYS.ult,
        textLanguageCode: 'en',
        helpsLanguageCode: 'en',
        stamps,
        olKey: stamps.olKey,
        olStamp: stamps.olStamp,
      })
    )
    const tnQuotes = jobs
      .filter((j) => j.kind === 'quote-chapter' && j.resourceKey === KEYS.tn)
      .map((j) => (j.kind === 'quote-chapter' ? j.chapter : 0))
    expect(tnQuotes).toEqual([1, 3])
    const tnAlignChapters = new Set(
      jobs
        .filter((j) => j.kind === 'align-chapter' && j.resourceKey === KEYS.tn)
        .map((j) => (j.kind === 'align-chapter' ? j.chapter : 0))
    )
    expect(tnAlignChapters.has(2)).toBe(false)
    expect(tnAlignChapters.has(1)).toBe(true)
    expect(tnAlignChapters.has(3)).toBe(true)

    const twlQuotes = jobs
      .filter((j) => j.kind === 'quote-chapter' && j.resourceKey === KEYS.twl)
      .map((j) => (j.kind === 'quote-chapter' ? j.chapter : 0))
    expect(twlQuotes).toEqual([1, 2, 3])
  })

  test('visible TN current chapter is skipped in lane 2 so the live quote path owns it', () => {
    const jobs = flattenGroups(
      collectLane2Groups({
        bookId: 'psa',
        chapter: 119,
        lastChapter: 150,
        downloadedKeys: DOWNLOADED,
        visibleKeys: [KEYS.ult, KEYS.tn],
        sourceResourceId: KEYS.ult,
        textLanguageCode: 'en',
        helpsLanguageCode: 'en',
        stamps,
        olKey: 'unfoldingWord/hbo/uhb',
        olStamp: 'ol1',
      })
    )
    const tnQuotes = jobs
      .filter((j) => j.kind === 'quote-chapter' && j.resourceKey === KEYS.tn)
      .map((j) => (j.kind === 'quote-chapter' ? j.chapter : 0))
    expect(tnQuotes).not.toContain(119)
    expect(tnQuotes).toContain(1)
  })

  test('refuses quote/align when the OL key is not ready', () => {
    const jobs = flattenGroups(
      collectLane2Groups({
        bookId: 'tit',
        chapter: 1,
        lastChapter: 3,
        downloadedKeys: DOWNLOADED,
        visibleKeys: [KEYS.ult, KEYS.tn],
        sourceResourceId: KEYS.ult,
        textLanguageCode: 'en',
        helpsLanguageCode: 'en',
        stamps,
        olKey: stamps.olKey,
        olStamp: stamps.olStamp,
        readyOlKeys: [],
      })
    )
    expect(jobs.some((j) => j.kind === 'quote-chapter')).toBe(false)
    expect(jobs.some((j) => j.kind === 'align-chapter')).toBe(false)
  })

  test('budgeted pass does not dump every remaining Psalms chapter', () => {
    const first = flattenGroups(
      collectLane2Groups({
        bookId: 'psa',
        chapter: 119,
        lastChapter: 150,
        downloadedKeys: DOWNLOADED,
        visibleKeys: [KEYS.ult, KEYS.tn],
        sourceResourceId: KEYS.ult,
        textLanguageCode: 'en',
        helpsLanguageCode: 'en',
        stamps,
        olKey: stamps.olKey,
        olStamp: stamps.olStamp,
        budget: 8,
      })
    )
    expect(first.length).toBeLessThanOrEqual(8)
    expect(first.length).toBeGreaterThan(0)
    const admitted = first.map((j) => j.jobKey)
    const second = flattenGroups(
      collectLane2Groups({
        bookId: 'psa',
        chapter: 119,
        lastChapter: 150,
        downloadedKeys: DOWNLOADED,
        visibleKeys: [KEYS.ult, KEYS.tn],
        sourceResourceId: KEYS.ult,
        textLanguageCode: 'en',
        helpsLanguageCode: 'en',
        stamps,
        olKey: stamps.olKey,
        olStamp: stamps.olStamp,
        admittedKeys: admitted,
        budget: 8,
      })
    )
    expect(second.length).toBeLessThanOrEqual(8)
    expect(second.every((j) => !admitted.includes(j.jobKey))).toBe(true)
  })

  test('visible scripture rest-of-book is prepared after lane 1; align is cartesian', () => {
    const jobs = flattenGroups(
      collectLane2Groups({
        bookId: 'tit',
        chapter: 1,
        lastChapter: 3,
        downloadedKeys: DOWNLOADED,
        visibleKeys: [KEYS.ult, KEYS.tn],
        sourceResourceId: KEYS.ult,
        textLanguageCode: 'en',
        helpsLanguageCode: 'en',
        stamps,
        olKey: stamps.olKey,
        olStamp: stamps.olStamp,
      })
    )
    const ultUnits = jobs
      .filter((j) => j.kind === 'prepare-unit' && j.resourceKey === KEYS.ult)
      .map((j) => (j.kind === 'prepare-unit' ? j.unit : 0))
    // Current + adjacent (1, 2) stay on the interactive prepare worker.
    expect(ultUnits).toEqual([3])
    const alignTargets = new Set(
      jobs
        .filter((j) => j.kind === 'align-chapter' && j.resourceKey === KEYS.tn)
        .map((j) => (j.kind === 'align-chapter' ? j.targetKey : ''))
    )
    expect(alignTargets.has(KEYS.ult)).toBe(true)
    expect(alignTargets.has(KEYS.ust)).toBe(true)
  })
})

describe('lane 3 language-set admission', () => {
  test('ult/ust/tn/twl/tq/tw/ta all get jobs; align is ult×ust cartesian', () => {
    const jobs = flattenGroups(
      collectLane3Groups({
        bookId: 'tit',
        downloadedKeys: DOWNLOADED,
        textLanguageCode: 'en',
        helpsLanguageCode: 'en',
        stamps,
        articleIdsByKey: {
          [KEYS.tw]: ['bible/kt/god'],
          [KEYS.ta]: ['translate/figs-metaphor'],
        },
        admittedKeys: [],
        budget: 64,
        olStampForBook,
        skipRelation: (relationId) => {
          if (relationId.endsWith(':tit') || relationId.endsWith('|tit')) return false
          if (relationId.endsWith(':articles')) return false
          return true
        },
      })
    )

    const keysWithWork = new Set(jobs.map((j) => j.resourceKey))
    for (const key of DOWNLOADED) {
      expect(keysWithWork.has(key)).toBe(true)
    }

    expect(jobs.some((j) => j.kind === 'prepare-unit' && j.resourceKey === KEYS.ult)).toBe(
      true
    )
    expect(jobs.some((j) => j.kind === 'prepare-unit' && j.resourceKey === KEYS.ust)).toBe(
      true
    )
    expect(jobs.some((j) => j.kind === 'prepare-unit' && j.resourceKey === KEYS.tq)).toBe(
      true
    )
    expect(jobs.some((j) => j.kind === 'quote-chapter' && j.resourceKey === KEYS.tn)).toBe(
      true
    )
    expect(jobs.some((j) => j.kind === 'quote-chapter' && j.resourceKey === KEYS.twl)).toBe(
      true
    )
    expect(
      jobs.some((j) => j.kind === 'prepare-article' && j.resourceKey === KEYS.tw)
    ).toBe(true)
    expect(
      jobs.some((j) => j.kind === 'prepare-article' && j.resourceKey === KEYS.ta)
    ).toBe(true)
    expect(jobs.some((j) => j.kind === 'quote-chapter' && j.resourceKey === KEYS.tq)).toBe(
      false
    )
    expect(jobs.some((j) => j.kind === 'align-chapter' && j.resourceKey === KEYS.tq)).toBe(
      false
    )

    const tnAlign = jobs.filter(
      (j) => j.kind === 'align-chapter' && j.resourceKey === KEYS.tn && j.bookId === 'tit'
    )
    const targets = new Set(
      tnAlign.map((j) => (j.kind === 'align-chapter' ? j.targetKey : ''))
    )
    expect(targets.has(KEYS.ult)).toBe(true)
    expect(targets.has(KEYS.ust)).toBe(true)
    expect(jobs.every((j) => j.lane === 3)).toBe(true)
  })

  test('canon wrap continues past the current book after it is filled', () => {
    const jobs = flattenGroups(
      collectLane3Groups({
        bookId: 'tit',
        downloadedKeys: [KEYS.ult, KEYS.ust],
        textLanguageCode: 'en',
        helpsLanguageCode: 'en',
        stamps,
        admittedKeys: [],
        budget: 40,
        olStampForBook,
      })
    )
    expect(jobs.some((j) => j.bookId === 'tit')).toBe(true)
    expect(jobs.some((j) => j.bookId === 'phm' || j.bookId === 'heb')).toBe(true)
  })

  test('throttled passes resume via admitted keys', () => {
    const admitted = new Set<string>()
    const first = flattenGroups(
      collectLane3Groups({
        bookId: 'tit',
        downloadedKeys: DOWNLOADED,
        textLanguageCode: 'en',
        helpsLanguageCode: 'en',
        stamps,
        articleIdsByKey: {},
        admittedKeys: admitted,
        budget: 32,
        olStampForBook,
      })
    )
    expect(first.length).toBeLessThanOrEqual(32)
    expect(first.length).toBeGreaterThan(0)
    for (const j of first) admitted.add(j.jobKey)

    const second = flattenGroups(
      collectLane3Groups({
        bookId: 'tit',
        downloadedKeys: DOWNLOADED,
        textLanguageCode: 'en',
        helpsLanguageCode: 'en',
        stamps,
        articleIdsByKey: {},
        admittedKeys: admitted,
        budget: 32,
        olStampForBook,
      })
    )
    expect(second.every((j) => !admitted.has(j.jobKey))).toBe(true)
    expect(second.length).toBeGreaterThan(0)
  })
})
