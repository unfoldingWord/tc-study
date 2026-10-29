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
