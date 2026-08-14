import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const src = readFileSync(join(import.meta.dir, 'ReadPanelHeader.tsx'), 'utf8')
const modeSrc = readFileSync(join(import.meta.dir, 'ReadModeSwitch.tsx'), 'utf8')
const chromeSrc = readFileSync(join(import.meta.dir, 'readHeaderChrome.ts'), 'utf8')
const studio = readFileSync(join(import.meta.dir, '../studio/PanelHeader.tsx'), 'utf8')

describe('ReadPanelHeader (issue #30)', () => {
  test('has mode switch + language picker and no ellipsis actions', () => {
    expect(modeSrc).toContain('Show helps')
    expect(modeSrc).toContain('Show scripture')
    expect(src).toContain('LanguagePicker')
    expect(src).toContain('ReadModeSwitch')
    expect(src).toContain('min-h-11')
    expect(src).toContain('read-panel-header')
    expect(src).not.toContain('Resource actions')
    expect(src).not.toContain('title="Actions"')
    expect(src).not.toContain('MoreVertical')
  })

  test('language + mode share compact header icon chrome in one cluster', () => {
    expect(src).toContain('ml-auto')
    expect(src).toContain('gap-0')
    expect(src).toContain('READ_HEADER_ICON_BUTTON')
    expect(src).not.toContain('bg-muted/50')
    expect(src).not.toContain('divide-x')
    expect(src).not.toContain('min-w-11')
    expect(src).not.toContain('hover:bg-panel-2')
    expect(src).not.toContain('text-panel-2-fg')
    expect(modeSrc).toContain('READ_HEADER_ICON_BUTTON')
    expect(modeSrc).toContain('w-4 h-4')
    expect(modeSrc).not.toContain('min-w-11')
    expect(modeSrc).not.toContain('w-5 h-5')
    expect(chromeSrc).toContain('h-9 w-9')
    expect(chromeSrc).toContain('hover:bg-muted')
    expect(chromeSrc).not.toContain('hover:bg-panel-')
  })

  test('does not edit studio PanelHeader', () => {
    expect(studio).toContain('title="Actions"')
    expect(studio).toContain('aria-label="Resource actions"')
  })
})
