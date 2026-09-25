import { describe, expect, test } from 'bun:test'
import { BookMarked, BookOpen } from 'lucide-react'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { TEXT_KIND_ICONS, textKindIconForNavScope } from './textKindIcons'

const filterSrc = readFileSync(
  join(import.meta.dir, '../../components/LanguagePickerTextKindFilter.tsx'),
  'utf8'
)
const rowSrc = readFileSync(
  join(import.meta.dir, '../../components/LanguagePickerRow.tsx'),
  'utf8'
)
const switchSrc = readFileSync(
  join(import.meta.dir, '../../components/studio/NavigationScopeSwitch.tsx'),
  'utf8'
)

describe('TEXT_KIND_ICONS', () => {
  test('Bible is BookOpen and OBS is BookMarked', () => {
    expect(TEXT_KIND_ICONS.bible).toBe(BookOpen)
    expect(TEXT_KIND_ICONS.obs).toBe(BookMarked)
  })

  test('nav scope maps scripture→Bible and obs→OBS', () => {
    expect(textKindIconForNavScope('scripture')).toBe(BookOpen)
    expect(textKindIconForNavScope('obs')).toBe(BookMarked)
  })

  test('picker chips and nav toggle share this map', () => {
    expect(filterSrc).toContain('TEXT_KIND_ICONS')
    expect(rowSrc).toContain('TEXT_KIND_ICONS')
    expect(switchSrc).toContain('textKindIconForNavScope(scope)')
  })
})
