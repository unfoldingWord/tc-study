import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const pickerSrc = readFileSync(join(import.meta.dir, 'LanguagePicker.tsx'), 'utf8')
const navSrc = readFileSync(
  join(import.meta.dir, 'studio/NavigationBarCompact.tsx'),
  'utf8'
)

describe('LanguagePicker (issue #24 helps list)', () => {
  test('defaults listMode to text and supports controlled open', () => {
    expect(pickerSrc).toContain("listMode = 'text'")
    expect(pickerSrc).toContain('helpsFlag')
    expect(pickerSrc).toContain('open?: boolean')
    expect(pickerSrc).toContain('onOpenChange')
    expect(pickerSrc).toContain('useLanguagePickerOpen')
    expect(pickerSrc).toContain('filterPickerLanguages')
  })

  test('header NavigationBar LanguagePicker stays on default text mode', () => {
    expect(navSrc).toContain('<LanguagePicker')
    expect(navSrc).not.toContain('listMode=')
    expect(navSrc).not.toContain('helpsFlag=')
  })

  test('stays under godSize budget', () => {
    expect(pickerSrc.split(/\r?\n/).length).toBeLessThanOrEqual(400)
  })
})
