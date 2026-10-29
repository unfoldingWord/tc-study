import { describe, expect, test } from 'bun:test'
import { localCatalogHitsForTarget, type LocalCatalogRow } from './localCatalogHits'
import { catalogIdentity } from './readCatalogIdentity'

const row = (owner: string, language: string, resourceId: string, subject: string, version = 'v1'): LocalCatalogRow => ({
  resourceKey: `${owner}/${language}/${resourceId}`,
  owner,
  language,
  resourceId,
  subject,
  title: `${resourceId} title`,
  version,
})

/** What an es-419 language pack and the originals pack leave in the device's catalog. */
const device: LocalCatalogRow[] = [
  row('es-419_gl', 'es-419', 'glt', 'Aligned Bible', 'v42'),
  row('es-419_gl', 'es-419', 'gst', 'Aligned Bible', 'v40'),
  row('es-419_gl', 'es-419', 'tn', 'TSV Translation Notes', 'v66'),
  row('es-419_gl', 'es-419', 'tq', 'TSV Translation Questions'),
  row('es-419_gl', 'es-419', 'twl', 'TSV Translation Words Links'),
  row('es-419_gl', 'es-419', 'tw', 'Translation Words'),
  row('es-419_gl', 'es-419', 'ta', 'Translation Academy'),
  row('unfoldingWord', 'el-x-koine', 'ugnt', 'Greek New Testament', 'v0.34'),
  row('unfoldingWord', 'en', 'ult', 'Aligned Bible'),
  row('es-419_gl', 'es-419', 'obs-tn', 'OBS Translation Notes'),
]

const keysOf = (pages: ReturnType<typeof localCatalogHitsForTarget>) =>
  pages.flatMap((page) => page.catalogResults.map((hit) => catalogIdentity(hit, 'es-419')?.resourceKey))

describe('localCatalogHitsForTarget', () => {
  test('every resource of the language, as hits whose identity is the catalog key', () => {
    const pages = localCatalogHitsForTarget(device, { languageCode: 'es-419', target: 'both', navigationScope: 'bible' })
    expect(pages.map((page) => page.hydrateTarget)).toEqual(['both'])
    expect(keysOf(pages).sort()).toEqual(
      device.filter((r) => r.language === 'es-419').map((r) => r.resourceKey).sort()
    )
  })

  test('a hit carries what hydrate reads: subject, title and the release tag', () => {
    const [page] = localCatalogHitsForTarget(device, { languageCode: 'es-419', target: 'text', navigationScope: 'bible' })
    const glt = page.catalogResults.find((hit) => hit.identifier === 'glt')
    const id = catalogIdentity(glt!, 'es-419')
    expect(id).toMatchObject({ ownerStr: 'es-419_gl', langStr: 'es-419', resourceId: 'glt', subject: 'Aligned Bible' })
    expect(glt!.title).toBe('glt title')
    expect(glt!.release?.tag_name).toBe('v42')
  })

  test('no resource of another language comes, not even the originals', () => {
    const pages = localCatalogHitsForTarget(device, { languageCode: 'es-419', target: 'both', navigationScope: 'bible' })
    expect(keysOf(pages)).not.toContain('unfoldingWord/el-x-koine/ugnt')
    expect(keysOf(pages)).not.toContain('unfoldingWord/en/ult')
  })

  test('OBS helps keep the one-subject-per-request rule of the Door43 search', () => {
    const pages = localCatalogHitsForTarget(device, {
      languageCode: 'es-419',
      target: 'helps',
      navigationScope: 'obs',
      helpsSubjects: ['OBS Translation Notes'],
    })
    expect(pages.map((page) => page.hydrateTarget)).toEqual(['helps'])
    expect(keysOf(pages)).toEqual(['es-419_gl/es-419/obs-tn'])
  })

  test('eng asks for en, as the Door43 search does', () => {
    const pages = localCatalogHitsForTarget(device, { languageCode: 'eng', target: 'text', navigationScope: 'bible' })
    expect(keysOf(pages)).toEqual(['unfoldingWord/en/ult'])
  })

  test('a language the device does not hold gives empty pages', () => {
    const pages = localCatalogHitsForTarget(device, { languageCode: 'fr', target: 'both', navigationScope: 'bible' })
    expect(pages.every((page) => page.catalogResults.length === 0)).toBe(true)
  })
})
