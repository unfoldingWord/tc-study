import { describe, expect, test } from 'bun:test'
import { ResourceFormat, ResourceType } from '@bt-synergy/resource-catalog'
import type { ResourceInfo } from '../../contexts/types'
import {
  buildBookInfosFromIngredients,
  findObsCatalogKey,
  getScriptureResources,
} from './bcvNavHelpers'
import { fallbackBookIfUnavailable } from './navigationHelpers'

function res(partial: Partial<ResourceInfo> & { key: string; type: string }): ResourceInfo {
  return {
    id: partial.key,
    key: partial.key,
    resourceKey: partial.key,
    language: 'en',
    languageCode: 'en',
    owner: 'u',
    category: partial.type,
    format: ResourceFormat.USFM,
    ...partial,
    type: partial.type as ResourceType,
  } as ResourceInfo
}

describe('getScriptureResources', () => {
  test('prefers gateway language after switch (ignores English leftovers)', () => {
    const loaded = {
      'u/en/ult': res({ key: 'u/en/ult', type: 'scripture', language: 'en', languageCode: 'en' }),
      'es-419_gl/es-419/glt': res({
        key: 'es-419_gl/es-419/glt',
        type: 'scripture',
        language: 'es-419',
        languageCode: 'es-419',
      }),
      'unfoldingWord/el-x-koine/ugnt': res({
        key: 'unfoldingWord/el-x-koine/ugnt',
        type: 'scripture',
        language: 'el-x-koine',
        languageCode: 'el-x-koine',
        subject: 'Greek New Testament',
      }),
    }

    const books = getScriptureResources(loaded, 'es-419')
    expect(books.map((r) => r.key)).toEqual(['es-419_gl/es-419/glt'])
  })
})

describe('findObsCatalogKey', () => {
  test('matches es-419 preferLanguage via primary segment / key', () => {
    const loaded = {
      'u/en/obs': res({ key: 'u/en/obs', type: 'obs', language: 'en', languageCode: 'en' }),
      'Door43-Catalog/es-419/obs': res({
        key: 'Door43-Catalog/es-419/obs',
        type: 'obs',
        language: 'es-419',
        languageCode: 'es-419',
      }),
    }
    expect(findObsCatalogKey(loaded, 'es-419')).toBe('Door43-Catalog/es-419/obs')
  })
})

describe('language switch book catalog', () => {
  test('gateway GL ingredients drive books; Genesis falls back after switch', () => {
    const loaded = {
      'u/en/ult': res({
        key: 'u/en/ult',
        type: 'scripture',
        language: 'en',
        languageCode: 'en',
        verifiedIngredients: [{ identifier: 'gen' }, { identifier: 'tit' }],
      }),
      'es-419_gl/es-419/glt': res({
        key: 'es-419_gl/es-419/glt',
        type: 'scripture',
        language: 'es-419',
        languageCode: 'es-419',
        verifiedIngredients: [
          { identifier: 'rut' },
          { identifier: 'jon' },
          { identifier: 'tit' },
          { identifier: '3jn' },
        ],
      }),
      'unfoldingWord/hbo/uhb': res({
        key: 'unfoldingWord/hbo/uhb',
        type: 'scripture',
        language: 'hbo',
        languageCode: 'hbo',
        subject: 'Hebrew Old Testament',
        verifiedIngredients: [{ identifier: 'gen' }, { identifier: 'exo' }],
      }),
    }

    const gl = getScriptureResources(loaded, 'es-419')
    expect(gl.map((r) => r.key)).toEqual(['es-419_gl/es-419/glt'])
    const books = buildBookInfosFromIngredients(
      gl.flatMap((r) => r.verifiedIngredients || [])
    )
    expect(books.map((b) => b.code)).toEqual(['rut', 'jon', 'tit', '3jn'])
    expect(fallbackBookIfUnavailable('gen', books)).toBe('rut')
  })
})
