import { describe, expect, test } from 'bun:test'
import { deviceResourcesByLanguage } from './deviceResourceList'

const row = (resourceKey: string, title: string, subject: string, version = 'v1') => {
  const [owner, language, resourceId] = resourceKey.split('/')
  return { resourceKey, owner, language, resourceId, title, subject, version }
}

describe('deviceResourcesByLanguage', () => {
  test('one group per language, its resources sorted by id, with title and release', () => {
    const groups = deviceResourcesByLanguage([
      row('es-419_gl/es-419/tn', 'Notas', 'TSV Translation Notes', 'v66'),
      row('unfoldingWord/el-x-koine/ugnt', 'UGNT', 'Greek New Testament', 'v0.34'),
      row('es-419_gl/es-419/glt', 'Texto Puente Literal', 'Aligned Bible', 'v42'),
    ])
    expect(groups).toEqual([
      {
        language: 'el-x-koine',
        resources: [{ key: 'unfoldingWord/el-x-koine/ugnt', id: 'UGNT', title: 'UGNT', version: 'v0.34' }],
      },
      {
        language: 'es-419',
        resources: [
          { key: 'es-419_gl/es-419/glt', id: 'GLT', title: 'Texto Puente Literal', version: 'v42' },
          { key: 'es-419_gl/es-419/tn', id: 'TN', title: 'Notas', version: 'v66' },
        ],
      },
    ])
  })

  test('rows that are not catalog rows are left out', () => {
    expect(deviceResourcesByLanguage([null, 'x', { title: 'no key' }])).toEqual([])
  })
})

describe('held books', () => {
  const tn = { resourceKey: 'es-419_gl/es-419/tn', language: 'es-419', resourceId: 'tn', title: 'Notas', version: 'v66', contentMetadata: { downloadedIngredients: ['tit', 'rut'] } }

  test('a resource with no complete receipt says which books the device holds', () => {
    const [group] = deviceResourcesByLanguage([tn])
    expect(group.resources[0].heldBooks).toEqual(['RUT', 'TIT'])
  })

  test('a complete resource does not, whatever its bookkeeping says', () => {
    const [group] = deviceResourcesByLanguage([tn], new Set(['es-419_gl/es-419/tn']))
    expect(group.resources[0].heldBooks).toBeUndefined()
  })
})
