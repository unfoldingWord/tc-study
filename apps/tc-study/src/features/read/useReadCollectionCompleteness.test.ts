import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

describe('useReadCollectionCompleteness', () => {
  test('failFast and skips IDB while extract is writing', () => {
    const src = readFileSync(join(import.meta.dir, 'useReadCollectionCompleteness.ts'), 'utf8')
    expect(src).toContain('failFast: true')
    expect(src).toContain('shouldWalkUiIdbDuringExtract')
    expect(src).toContain('backgroundDownloadSession.isBusy()')
    expect(src).toContain('yieldBetweenCompletenessBooks')
  })
})
