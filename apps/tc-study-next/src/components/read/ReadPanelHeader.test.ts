import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const src = readFileSync(join(import.meta.dir, 'ReadPanelHeader.tsx'), 'utf8')
const modeSrc = readFileSync(join(import.meta.dir, 'ReadModeSwitch.tsx'), 'utf8')
const studio = readFileSync(join(import.meta.dir, '../studio/PanelHeader.tsx'), 'utf8')

describe('ReadPanelHeader (issue #30)', () => {
  test('has mode switch + language picker and no ellipsis actions', () => {
    expect(modeSrc).toContain('Show helps')
    expect(modeSrc).toContain('Show scripture')
    expect(src).toContain('LanguagePicker')
    expect(src).toContain('ReadModeSwitch')
    expect(src).toContain('min-h-11')
    expect(src).not.toContain('Resource actions')
    expect(src).not.toContain('title="Actions"')
    expect(src).not.toContain('MoreVertical')
  })

  test('language + mode share LanguagePicker trigger chrome in one cluster', () => {
    expect(src).toContain('bg-muted/50')
    expect(src).toContain('divide-x divide-border-subtle')
    expect(src).toContain('ml-auto')
    expect(modeSrc).toContain('p-1 text-fg-secondary hover:bg-muted')
    expect(modeSrc).toContain('w-4 h-4')
    expect(modeSrc).not.toContain('w-5 h-5')
  })

  test('does not edit studio PanelHeader', () => {
    expect(studio).toContain('title="Actions"')
    expect(studio).toContain('aria-label="Resource actions"')
  })
})
