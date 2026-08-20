import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'fs'
import { join } from 'path'

describe('useReadGatewayBookCatalog', () => {
  test('Read mounts gateway book catalog outside BCV modal', () => {
    const readView = readFileSync(
      join(import.meta.dir, '../../components/read/SimplifiedReadView.tsx'),
      'utf8'
    )
    expect(readView).toContain('useReadGatewayBookCatalog')
    const hook = readFileSync(join(import.meta.dir, 'useReadGatewayBookCatalog.ts'), 'utf8')
    expect(hook).toContain('getScriptureResources')
    expect(hook).toContain('setAvailableBooks')
    expect(hook).toContain('preferLanguage')
  })
})
