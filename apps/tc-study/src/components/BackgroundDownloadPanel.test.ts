import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const panelSrc = readFileSync(join(import.meta.dir, 'BackgroundDownloadPanel.tsx'), 'utf8')

describe('BackgroundDownloadPanel', () => {
  test('start button keeps the Start Background Download accessible name', () => {
    expect(panelSrc).toContain('aria-label="Start Background Download"')
    expect(panelSrc).toContain('title="Start Background Download"')
  })
})
