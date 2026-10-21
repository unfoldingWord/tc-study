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
