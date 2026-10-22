import { describe, expect, test } from 'bun:test'
import { resourceContentStamp } from '@bt-synergy/resource-catalog'
import { helpsTextKey } from '../helps/helpsCacheKeys'
import { readHelpsText } from '../helps/helpsTextStore'
import { readWarmCoverage } from '../warm/warmCoverage'
import { buildLanguageArtifacts } from './buildLanguageArtifacts'

function memoryCache() {
  const rows = new Map<string, unknown>()
  return {
    rows,
    async get(key: string) {
      return rows.get(key) ?? null
    },
    async set(key: string, entry: unknown) {
      rows.set(key, entry)
    },
    async delete(key: string) {
      rows.delete(key)
    },
    async getByPrefix(prefix: string) {
      return [...rows.entries()].filter(([k]) => k.startsWith(prefix)).map(([key, entry]) => ({ key, entry }))
    },
  }
}

const release = { tag_name: 'v12', published_at: '2026-03-01T00:00:00Z' }
const META: Record<string, unknown> = {
  'es-419_gl/es-419/ta': {
    language: 'es-419',
    release,
    contentMetadata: {
      ingredients: [
        { identifier: 'translate/figs-metaphor', title: 'Metáfora', path: 'translate/figs-metaphor' },
        { identifier: 'translate/figs-simile', title: '', path: 'translate/figs-simile' },
        { identifier: 'translate', title: 'Traducir', path: 'translate' },
      ],
    },
  },
  'es-419_gl/es-419/tw': {
    language: 'es-419',
    release,
    contentMetadata: {
      ingredients: [{ identifier: 'bible/kt/god', title: 'Dios', path: 'bible/kt/god.md' }],
    },
  },
  'es-419_gl/es-419/tn': { language: 'es-419', release, contentMetadata: { ingredients: [{ identifier: 'tit' }] } },
}

function catalog() {
  return {
    async getAllResourceKeys() {
      return [...Object.keys(META), 'otro/fr/tn']
    },
    async getResourceMetadata(key: string) {
      return META[key] ?? null
    },
  }
}

describe('buildLanguageArtifacts', () => {
  test('escribe los títulos de TA y TW con las mismas claves que la pantalla de lectura', async () => {
    const cache = memoryCache()
    const report = await buildLanguageArtifacts({ language: 'es-419', cache, catalog: catalog() })

    const stamp = resourceContentStamp(META['es-419_gl/es-419/ta'] as never)
    expect(await readHelpsText(cache, 'ta-title', 'es-419_gl/es-419/ta', stamp, 'translate/figs-metaphor')).toBe('Metáfora')
    expect(cache.rows.has(helpsTextKey('ta-title', 'es-419_gl/es-419/ta', stamp, 'translate/figs-simile'))).toBe(false)
    expect(await readHelpsText(cache, 'tw-title', 'es-419_gl/es-419/tw', stamp, 'kt/god')).toBe('Dios')
    expect(report.titles).toEqual([
      { resourceKey: 'es-419_gl/es-419/ta', kind: 'ta-title', written: 1, placeholders: 1 },
      { resourceKey: 'es-419_gl/es-419/tw', kind: 'tw-title', written: 1, placeholders: 0 },
    ])
  })

  test('solo trabaja el idioma pedido y dice qué no pudo construir', async () => {
    const cache = memoryCache()
    const report = await buildLanguageArtifacts({ language: 'es-419', cache, catalog: catalog() })

    expect(report.resources.map((r) => r.resourceKey)).toEqual([
      'es-419_gl/es-419/ta',
      'es-419_gl/es-419/tw',
      'es-419_gl/es-419/tn',
    ])
    expect(report.resources.every((r) => !r.complete)).toBe(true)
    // Nothing is downloaded, so every job is planned but none builds, and no relation is marked covered.
    expect(report.jobs.total).toBeGreaterThan(0)
    expect(report.jobs.finished).toBe(0)
    expect(report.incomplete.length).toBe(report.jobs.total - report.jobs.cached)
    expect(report.incomplete.every((j) => !j.jobKey.includes('otro/fr'))).toBe(true)
    expect(report.relationsCovered).toBe(0)
    expect(Object.keys(await readWarmCoverage(cache))).toEqual([])
  })
})

describe('buildLanguageArtifacts, one book at a time', () => {
  const GLT = 'es-419_gl/es-419/glt'
  const TN = 'es-419_gl/es-419/tn'
  const TA = 'es-419_gl/es-419/ta'
  const BOOK_META: Record<string, unknown> = {
    [GLT]: { language: 'es-419', release, contentMetadata: { ingredients: [{ identifier: 'rut' }, { identifier: 'jon' }] } },
    [TN]: { language: 'es-419', release, contentMetadata: { ingredients: [{ identifier: 'rut' }] } },
    [TA]: META[TA],
  }
  const bookCatalog = () => ({
    async getAllResourceKeys() {
      return Object.keys(BOOK_META)
    },
    async getResourceMetadata(key: string) {
      return BOOK_META[key] ?? null
    },
  })

  async function plannedJobs(options: Record<string, unknown>) {
    const jobs: string[] = []
    const report = await buildLanguageArtifacts({
      language: 'es-419',
      cache: memoryCache(),
      catalog: bookCatalog(),
      onProgress: (p) => {
        if (p.phase === 'jobs') jobs.push(p.job.jobKey)
      },
      ...options,
    })
    return { jobs, report }
  }

  test('plans only the books and chapters it is given, and no articles or titles when told so', async () => {
    const { jobs, report } = await plannedJobs({
      books: ['rut'],
      chaptersOf: (key: string, book: string) => (key === GLT && book === 'rut' ? [1, 2] : null),
      articles: false,
      obs: false,
    })
    expect(jobs).toEqual([`prep:scripture:${GLT}:rut:1`, `prep:scripture:${GLT}:rut:2`])
    expect(report.titles).toEqual([])
  })

  test('without the new options every book and the articles are planned as before', async () => {
    const { jobs } = await plannedJobs({})
    expect(jobs.some((j) => j.includes(':jon:'))).toBe(true)
    expect(jobs.some((j) => j.startsWith('prep-article:'))).toBe(true)
  })

  test('a job that throws is counted failed with its message, never noop', async () => {
    const cache = memoryCache()
    const failing = {
      ...cache,
      async get(key: string) {
        if (key.startsWith('scripture-usj:')) throw new Error(`disk read failed: ${key}`)
        return cache.get(key)
      },
    }
    const report = await buildLanguageArtifacts({
      language: 'es-419',
      cache: failing,
      catalog: bookCatalog(),
      books: ['rut'],
      chaptersOf: (key: string) => (key === GLT ? [1, 2] : null),
      articles: false,
      obs: false,
    })
    expect(report.jobs.total).toBe(2)
    expect(report.jobs.failed).toBe(2)
    expect(report.jobs.noop).toBe(0)
    expect(report.failures).toEqual([
      { job: `prep:scripture:${GLT}:rut:1`, error: `disk read failed: scripture-usj:${GLT}:rut:1` },
      { job: `prep:scripture:${GLT}:rut:2`, error: `disk read failed: scripture-usj:${GLT}:rut:2` },
    ])
    expect(report.incomplete.map((j) => j.outcome)).toEqual(['failed', 'failed'])
  })

  test('the failures list keeps the first 20, the count keeps them all', async () => {
    const report = await buildLanguageArtifacts({
      language: 'es-419',
      cache: {
        ...memoryCache(),
        async get(key: string) {
          if (key.startsWith('scripture-usj:')) throw new Error('boom')
          return null
        },
      },
      catalog: bookCatalog(),
      books: ['gen'],
      articles: false,
      obs: false,
    })
    // Genesis has 50 chapters for the GLT; TN's jobs are blocked (no notes), not failed.
    expect(report.jobs.failed).toBe(50)
    expect(report.failures.length).toBe(20)
    expect(report.failures[0]).toEqual({ job: `prep:scripture:${GLT}:gen:1`, error: 'boom' })
  })
})
