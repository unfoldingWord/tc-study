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
    expect(pickerSrc).toContain('open?: boolean')
    expect(pickerSrc).toContain('onOpenChange')
    expect(pickerSrc).toContain('useLanguagePickerOpen')
    expect(pickerSrc).toContain('filterPickerLanguages')
    expect(pickerSrc).toContain('revalidatePickerLanguages')
    expect(pickerSrc).toContain('resolveLanguageListKind')
    expect(pickerSrc).toContain('subjectsForLanguageList')
    expect(pickerSrc).not.toContain('subjects: supportedSubjects')
    expect(pickerSrc).toContain('resolveLanguageListKind({ listMode })')
    expect(pickerSrc).not.toContain('resolveLanguageListKind({ listMode, navigationScope')
  })

  test('header NavigationBar LanguagePicker stays on default text mode', () => {
    expect(navSrc).toContain('<LanguagePicker')
    expect(navSrc).not.toContain('listMode=')
  })

  test('stays under godSize budget', () => {
    expect(pickerSrc.split(/\r?\n/).length).toBeLessThanOrEqual(400)
  })
})

describe('LanguagePicker dismiss (bootstrap vs per-panel)', () => {
  const openSrc = readFileSync(join(import.meta.dir, 'useLanguagePickerOpen.ts'), 'utf8')

  test('required blocks Close, overlay click, and Escape', () => {
    expect(pickerSrc).toContain('if (required) return')
    expect(pickerSrc).toContain('onClick={required ? undefined : closeModal}')
    expect(pickerSrc).toContain('{!required &&')
    expect(openSrc).toContain("e.key !== 'Escape'")
    expect(openSrc).toContain('if (required) return')
  })

  test('per-panel header picker does not pass required', () => {
    const headerSrc = readFileSync(
      join(import.meta.dir, 'read/ReadPanelHeader.tsx'),
      'utf8'
    )
    const pickerBlock = headerSrc.slice(headerSrc.indexOf('<LanguagePicker'))
    expect(pickerBlock).not.toContain('required')
  })
})

describe('LanguagePicker chrome + text kind filter', () => {
  test('one Languages icon in the dialog header (trigger + header only)', () => {
    const uses = pickerSrc.match(/<Languages /g) ?? []
    expect(uses.length).toBe(2)
    expect(pickerSrc).not.toContain('Progress strip')
    expect(pickerSrc).not.toContain('p-1.5 rounded-full bg-accent')
  })

  test('count lives next to the header icon, not on a globe bar', () => {
    expect(pickerSrc).toContain('filteredLanguages.length')
    expect(pickerSrc).toContain('bg-accent-soft text-accent-fg text-micro')
    expect(pickerSrc).not.toContain('aria-label="Cancel"')
  })

  test('text and helps modes both wire LanguagePickerTextKindFilter', () => {
    expect(pickerSrc).toContain('LanguagePickerTextKindFilter')
    expect(pickerSrc).not.toContain("listMode !== 'helps'")
    expect(pickerSrc).not.toContain('showTextKindFilter')
    expect(pickerSrc).toContain('value={textKind} onChange={setTextKind}')
    expect(pickerSrc).toContain('defaultTextKindForPicker(listMode, navigationScope)')
    expect(pickerSrc).not.toMatch(/left[- ]pane/i)
  })

  test('search input uses Search... placeholder, not a visible label', () => {
    expect(pickerSrc).toContain('placeholder="Search..."')
    expect(pickerSrc).toContain('aria-label="Search languages"')
    expect(pickerSrc).toContain('<Globe className="absolute left-3')
    expect(pickerSrc).not.toContain('<label')
    expect(pickerSrc).not.toMatch(/placeholder="\.\.\."/)
  })

  test('body uses LanguagePickerGrid with stack rhythm, not space-y-4', () => {
    expect(pickerSrc).toContain('revalidatePickerLanguages')
    expect(pickerSrc).toContain('LanguagePickerGrid')
    expect(pickerSrc).toContain('flex flex-col gap-stack')
    expect(pickerSrc).not.toContain('space-y-4')
    expect(pickerSrc).not.toContain('SelectableGridWithStatus')
  })

  test('forwards this-pane and other-pane language codes to the grid', () => {
    expect(pickerSrc).toContain('currentLanguageCode')
    expect(pickerSrc).toContain('otherLanguageCode')
    expect(pickerSrc).toContain('currentLanguageCode={currentLanguageCode}')
    expect(pickerSrc).toContain('otherLanguageCode={otherLanguageCode}')
  })
})
