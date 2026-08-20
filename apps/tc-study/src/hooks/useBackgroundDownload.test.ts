import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

describe('useBackgroundDownload (session singleton)', () => {
  const src = readFileSync(join(import.meta.dir, 'useBackgroundDownload.ts'), 'utf8')

  test('subscribes to the module session and does not terminate the worker on unmount', () => {
    expect(src).toContain('backgroundDownloadSession')
    expect(src).toContain('backgroundDownloadSession.subscribe')
    expect(src).not.toContain('terminate()')
    expect(src).not.toContain('createInitialDownloadProgress')
    expect(src).not.toContain('new Worker')
  })
})
