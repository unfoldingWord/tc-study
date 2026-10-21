import { describe, expect, test } from 'bun:test'
import { catalogHitRelease, door43ResourceForHit } from './catalogHits'
import { catalogHitItem, catalogIdentity, type CatalogEntry } from './readCatalogIdentity'

const book = (identifier: string, title: string, sort: number) => ({
  categories: ['bible-ot'],
  identifier,
  path: `tn_${identifier.toUpperCase()}.tsv`,
  sort,
  title,
  versification: 'ufw',
})

/**
 * es-419_gl/es-419_tn as Door43's catalog search (`lang=es-419&topic=tc-ready&stage=prod`) returned it, trimmed:
 * the hit is release v66, which has no Esther; `repo` is the repository on master, which has.
 */
function es419TnV66Hit(): CatalogEntry {
  return {
    id: 44373,
    url: 'https://git.door43.org/api/v1/catalog/entry/es-419_gl/es-419_tn/v66',
    name: 'es-419_tn',
    owner: 'es-419_gl',
    full_name: 'es-419_gl/es-419_tn',
    repo: {
      id: 53610,
      owner: { id: 9939, login: 'es-419_gl', type: 'Organization', full_name: 'idiomasPuentes' },
      name: 'es-419_tn',
      full_name: 'es-419_gl/es-419_tn',
      description: 'Notas de traducción',
      html_url: 'https://git.door43.org/es-419_gl/es-419_tn',
      url: 'https://git.door43.org/api/v1/repos/es-419_gl/es-419_tn',
      default_branch: 'master',
      metadata_type: 'rc',
      language: 'es-419',
      language_title: 'Español Latin America',
      subject: 'TSV Translation Notes',
      abbreviation: 'tn',
      title: 'Notas de Traducción (master)',
      ingredients: [
        book('rut', 'Rut', 8),
        book('est', 'Ester', 17),
        book('jon', 'Jonás', 32),
        book('tit', 'Tito', 57),
        book('3jn', '3 Juan', 64),
      ],
      checking_level: '3',
      catalog: { prod: { tag_name: 'v66' } },
      healthcheck_url: 'https://git.door43.org/api/v1/repos/es-419_gl/es-419_tn/healthcheck',
    },
    release: {
      tag_name: 'v66',
      zipball_url: 'https://git.door43.org/es-419_gl/es-419_tn/archive/v66.zip',
      published_at: '2025-11-20T00:00:00Z',
      html_url: 'https://git.door43.org/es-419_gl/es-419_tn/releases/tag/v66',
    },
    zipball_url: 'https://git.door43.org/es-419_gl/es-419_tn/archive/v66.zip',
    language: 'es-419',
    language_title: 'Español Latin America',
    subject: 'TSV Translation Notes',
    abbreviation: 'tn',
    title: 'Notas de Traducción',
    branch_or_tag_name: 'v66',
    ref_type: 'tag',
    stage: 'prod',
    metadata_url: 'https://git.door43.org/es-419_gl/es-419_tn/raw/tag/v66/manifest.yaml',
    metadata_type: 'rc',
    content_format: 'tsv',
    ingredients: [book('rut', 'Rut', 8), book('jon', 'Jonás', 32), book('tit', 'Tito', 57), book('3jn', '3 Juan', 64)],
    healthcheck_url: 'https://git.door43.org/api/v1/repos/es-419_gl/es-419_tn/healthcheck?ref=v66',
  }
}

const identifiers = (list: unknown) => (list as Array<{ identifier: string }>).map((i) => i.identifier)

describe('door43ResourceForHit', () => {
  test('lista los libros del release al que apunta, no los de master', () => {
    const entry = es419TnV66Hit()
    const id = catalogIdentity(entry, 'es-419')!
    const resource = door43ResourceForHit(entry, id, catalogHitRelease(id)!)

    expect(id.resourceKey).toBe('es-419_gl/es-419/tn')
    expect(resource.version).toBe('v66')
    expect(identifiers(resource.ingredients)).toEqual(['rut', 'jon', 'tit', '3jn'])
    expect(resource.title).toBe('Notas de Traducción')
    expect(resource.metadata_url).toBe('https://git.door43.org/es-419_gl/es-419_tn/raw/tag/v66/manifest.yaml')
  })

  test('toma de repo solo lo del repositorio que el hit no trae', () => {
    const entry = es419TnV66Hit()
    const id = catalogIdentity(entry, 'es-419')!
    const resource = door43ResourceForHit(entry, id, catalogHitRelease(id)!)

    expect(resource.owner).toBe('es-419_gl')
    expect(resource.description).toBe('Notas de traducción')
    expect(resource.html_url).toBe('https://git.door43.org/es-419_gl/es-419_tn')
  })
})

describe('catalogHitItem', () => {
  test('el hit gana en cada campo que trae', () => {
    const item = catalogHitItem(es419TnV66Hit())
    expect(item.id).toBe(44373)
    expect(item.url).toBe('https://git.door43.org/api/v1/catalog/entry/es-419_gl/es-419_tn/v66')
    expect(item.healthcheck_url).toBe('https://git.door43.org/api/v1/repos/es-419_gl/es-419_tn/healthcheck?ref=v66')
    expect(item.owner).toBe('es-419_gl')
    expect(item.default_branch).toBe('master')
  })

  test('sin ingredients en el hit no usa los de master', () => {
    const entry = es419TnV66Hit()
    delete entry.ingredients
    const item = catalogHitItem(entry)
    expect(item.ingredients).toBeUndefined()
    expect(item.checking_level).toBeUndefined()
  })

  test('un hit sin repo queda como está', () => {
    const entry = { ...es419TnV66Hit(), repo: undefined }
    expect(catalogHitItem(entry)).toBe(entry)
  })
})
