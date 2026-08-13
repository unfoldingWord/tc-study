import { describe, expect, test } from 'bun:test'
import { buildReadPath, READ_V1_BASE } from './readRoutesV1'

describe('readRoutesV1', () => {
  test('READ_V1_BASE is /read-v1', () => {
    expect(READ_V1_BASE).toBe('/read-v1')
  })

  test('buildReadPath produces /read-v1/...', () => {
    expect(
      buildReadPath('es-419', {
        resourceType: 'bible',
        navType: 'chapter',
        navRef: 'tit 2',
      })
    ).toBe('/read-v1/es-419/bible/chapter/tit%202')
  })
})
