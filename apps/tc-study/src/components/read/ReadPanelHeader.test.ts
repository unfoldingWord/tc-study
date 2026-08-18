import { describe, expect, test } from 'bun:test'
import { subjectsForLanguageList } from '@bt-synergy/resource-types'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { resolvePickerLanguageList } from '../../features/read/languageListKind'
import * as plugins from '../../resourceTypes'
import { RESOURCE_TYPE_PLUGIN_EXPORTS } from '../../resourceTypes/pluginRegistry'

const src = readFileSync(join(import.meta.dir, 'ReadPanelHeader.tsx'), 'utf8')
const modeSrc = readFileSync(join(import.meta.dir, 'ReadModeSwitch.tsx'), 'utf8')
const chromeSrc = readFileSync(join(import.meta.dir, 'readHeaderChrome.ts'), 'utf8')
const studio = readFileSync(join(import.meta.dir, '../studio/PanelHeader.tsx'), 'utf8')

describe('ReadPanelHeader (issue #30)', () => {
  test('has mode switch + language picker and no ellipsis actions', () => {
    expect(modeSrc).toContain('Show helps')
    expect(modeSrc).toContain('Show scripture')
    expect(modeSrc).toContain('LifeBuoy')
    expect(modeSrc).toContain('BookOpen')
    expect(modeSrc).not.toContain('Layers')
    expect(modeSrc).not.toContain('CircleHelp')
    expect(src).toContain('LanguagePicker')
    expect(src).toContain('navigationScope={navigationScope}')
    expect(src).toContain('currentLanguageCode={currentLanguageCode}')
    expect(src).toContain('otherLanguageCode={otherLanguageCode}')
    expect(src).toContain('ReadModeSwitch')
    expect(src).toContain('min-h-11')
    expect(src).toContain('read-panel-header')
    expect(src).not.toContain('Resource actions')
    expect(src).not.toContain('title="Actions"')
    expect(src).not.toContain('MoreVertical')
  })

  test('language + mode share compact header icon chrome in one cluster', () => {
    expect(src).toContain('ml-auto')
    expect(src).toContain('w-px h-5 bg-border')
    expect(src).not.toContain('w-px h-5 bg-border-subtle')
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

  test('obs + helps header requests obs-helps subjects; scripture text omits OBS', () => {
    const registered = RESOURCE_TYPE_PLUGIN_EXPORTS.map((name) => plugins[name])
    const subjectsForKind = (kind: Parameters<typeof subjectsForLanguageList>[1]) =>
      subjectsForLanguageList(registered, kind)
    const obsHelps = resolvePickerLanguageList({
      listMode: 'helps',
      navigationScope: 'obs',
      subjectsForKind,
    })
    expect(obsHelps.kind).toBe('obs-helps')
    expect(obsHelps.subjects).toContain('TSV OBS Translation Notes')
    expect(obsHelps.subjects).not.toContain('TSV Translation Notes')
    const scriptureText = resolvePickerLanguageList({
      listMode: 'text',
      navigationScope: 'scripture',
      subjectsForKind,
    })
    expect(scriptureText.kind).toBe('scripture')
    expect(scriptureText.subjects).not.toContain('Open Bible Stories')
    expect(scriptureText.subjects).toContain('Bible')
  })
})
