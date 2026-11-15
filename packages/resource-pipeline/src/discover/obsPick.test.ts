import { describe, expect, test } from 'bun:test'
import { catalogIdentity } from './readCatalogIdentity'
import { pickObs, type CatalogHit } from './obsPick'

function hit(owner: string, repo: string, subject: string, tag = 'v1', published = '2026-01-01T00:00:00Z'): CatalogHit {
  const lang = repo.split('_')[0]
  return {
    owner,
    name: repo,
    language: lang,
    subject,
    title: repo,
    release: { tag_name: tag, zipball_url: `https://example.org/${repo}/${tag}.zip`, published_at: published },
  }
}

const S = 'Open Bible Stories'
const TN = 'TSV OBS Translation Notes'
const TQ = 'TSV OBS Translation Questions'
const TWL = 'TSV OBS Translation Words Links'

const keys = (p: ReturnType<typeof pickObs>) =>
  [p.stories, p.notes, p.questions, p.links].map((h) => (h ? catalogIdentity(h, '')?.resourceKey : undefined))

describe('pickObs', () => {
  test('en: unfoldingWord for all four', () => {
    const p = pickObs(
      [hit('unfoldingWord', 'en_obs', S), hit('unfoldingWord', 'en_obs-tn', TN), hit('unfoldingWord', 'en_obs-tq', TQ), hit('unfoldingWord', 'en_obs-twl', TWL)],
      'unfoldingWord'
    )
    expect(p.lines).toEqual(['unfoldingWord/en_obs@v1', 'unfoldingWord/en_obs-tn@v1', 'unfoldingWord/en_obs-tq@v1', 'unfoldingWord/en_obs-twl@v1'])
    expect(keys(p).every((k) => k?.startsWith('unfoldingWord/en/'))).toBe(true)
  })

  test('es-419: the Bible owner wins over BSA', () => {
    const hits = [
      hit('BSA', 'es-419_obs', S, 'v9', '2027-01-01T00:00:00Z'),
      hit('es-419_gl', 'es-419_obs', S),
      hit('BSA', 'es-419_obs-tn', TN, 'v9', '2027-01-01T00:00:00Z'),
      hit('es-419_gl', 'es-419_obs-tn', TN),
      hit('es-419_gl', 'es-419_obs-tq', TQ),
      hit('es-419_gl', 'es-419_obs-twl', TWL),
    ]
    const p = pickObs(hits, 'es-419_gl')
    expect(p.lines.every((l) => l.startsWith('es-419_gl/'))).toBe(true)
  })

  test('id: bahtraku', () => {
    const p = pickObs(
      [hit('bahtraku', 'id_obs', S), hit('bahtraku', 'id_obs-tn', TN), hit('bahtraku', 'id_obs-tq', TQ), hit('bahtraku', 'id_obs-twl', TWL)],
      'bahtraku'
    )
    expect(p.lines.every((l) => l.startsWith('bahtraku/'))).toBe(true)
  })

  test('hi: stories, notes, questions from Door43-Catalog; links none', () => {
    const p = pickObs(
      [hit('Door43-Catalog', 'hi_obs', S), hit('Door43-Catalog', 'hi_obs-tn', 'OBS Translation Notes'), hit('Door43-Catalog', 'hi_obs-tq', 'OBS Translation Questions')],
      'Door43-Catalog'
    )
    expect(p.lines).toEqual(['Door43-Catalog/hi_obs@v1', 'Door43-Catalog/hi_obs-tn@v1', 'Door43-Catalog/hi_obs-tq@v1', 'none in the catalog'])
    expect(p.links).toBeUndefined()
  })

  test('ar: stories from OBS-Aquifer, the helps none', () => {
    const p = pickObs([hit('OBS-Aquifer', 'ar_obs', S)], 'BSOJ')
    expect(p.lines).toEqual(['OBS-Aquifer/ar_obs@v1', 'none in the catalog', 'none in the catalog', 'none in the catalog'])
    expect(p.notes).toBeUndefined()
  })

  test('two foreign owners: the most recent prod release', () => {
    const p = pickObs([hit('aaa', 'xx_obs', S, 'v1', '2025-01-01T00:00:00Z'), hit('zzz', 'xx_obs', S, 'v2', '2026-06-01T00:00:00Z')], undefined)
    expect(p.lines[0]).toBe('zzz/xx_obs@v2')
  })

  test('the same date: owner in code-point order', () => {
    const p = pickObs([hit('Zed', 'xx_obs', S), hit('abc', 'xx_obs', S), hit('Bob', 'xx_obs', S)], 'nobody')
    expect(p.lines[0]).toBe('Bob/xx_obs@v1')
  })

  test('helps follow the owner of the stories, else the most recent', () => {
    const p = pickObs(
      [
        hit('A', 'xx_obs', S),
        hit('B', 'xx_obs-tn', TN, 'v5', '2027-01-01T00:00:00Z'),
        hit('A', 'xx_obs-tq', TQ),
        hit('B', 'xx_obs-twl', TWL),
      ],
      undefined
    )
    expect(p.lines).toEqual(['A/xx_obs@v1', 'B/xx_obs-tn@v5', 'A/xx_obs-tq@v1', 'B/xx_obs-twl@v1'])
  })

  test('a hit with no prod release is never picked', () => {
    const noRelease = { ...hit('es-419_gl', 'es-419_obs', S), release: undefined }
    const p = pickObs([noRelease, hit('BSA', 'es-419_obs', S)], 'es-419_gl')
    expect(p.lines[0]).toBe('BSA/es-419_obs@v1')
    expect(pickObs([noRelease], 'es-419_gl').stories).toBeUndefined()
  })

  test('no OBS at all: empty pick', () => {
    const p = pickObs([hit('unfoldingWord', 'en_ult', 'Aligned Bible')], 'unfoldingWord')
    expect(p).toEqual({ lines: ['none in the catalog', 'none in the catalog', 'none in the catalog', 'none in the catalog'] })
  })
})
