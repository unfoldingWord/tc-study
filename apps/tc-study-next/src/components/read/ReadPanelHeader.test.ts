import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const src = readFileSync(join(import.meta.dir, 'ReadPanelHeader.tsx'), 'utf8')
const studio = readFileSync(join(import.meta.dir, '../studio/PanelHeader.tsx'), 'utf8')

describe('ReadPanelHeader (issue #30)', () => {
  test('has mode switch + language picker and no ellipsis actions', () => {
    expect(src).toContain('Show helps')
    expect(src).toContain('Show scripture')
    expect(src).toContain('LanguagePicker')
    expect(src).toContain('min-h-11')
    expect(src).not.toContain('Resource actions')
    expect(src).not.toContain('title="Actions"')
    expect(src).not.toContain('MoreVertical')
  })

  test('does not edit studio PanelHeader', () => {
    expect(studio).toContain('title="Actions"')
    expect(studio).toContain('aria-label="Resource actions"')
  })
})
