import { describe, expect, test } from 'bun:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { LanguagePickerTextKindFilter } from './LanguagePickerTextKindFilter'

const filterSrc = readFileSync(join(import.meta.dir, 'LanguagePickerTextKindFilter.tsx'), 'utf8')
const pickerSrc = readFileSync(join(import.meta.dir, 'LanguagePicker.tsx'), 'utf8')

function render(props: {
  value: 'both' | 'bible' | 'obs'
  defaultOpen?: boolean
}) {
  return renderToStaticMarkup(
    createElement(LanguagePickerTextKindFilter, {
      value: props.value,
      onChange: () => {},
      defaultOpen: props.defaultOpen,
    })
  )
}

function buttonClassForLabel(html: string, label: string): string {
  const buttons = html.match(/<button\b[^>]*>/g) ?? []
  const btn = buttons.find((b) => b.includes(`aria-label="${label}"`))
  const match = btn?.match(/class="([^"]*)"/)
  return match?.[1] ?? ''
}

describe('LanguagePickerTextKindFilter', () => {
  test('dropdown is closed until the Filter trigger is clicked', () => {
    const html = render({ value: 'both' })
    expect(html).toContain('aria-label="Filter languages"')
    expect(html).toContain('title="Filter languages"')
    expect(html).toContain('aria-expanded="false"')
    expect(html).toContain('aria-haspopup="menu"')
    expect(html).not.toContain('aria-label="Any"')
    expect(html).not.toContain('aria-label="Bible"')
    expect(html).not.toContain('aria-label="OBS"')
    expect(html).not.toContain('role="menu"')
    expect(filterSrc).toContain('onClick={() => setOpen((o) => !o)}')
    expect(filterSrc).toContain('{open && (')
  })

  test('open menu is icon-only Any / Bible / OBS; Any maps to both', () => {
    const html = render({ value: 'both', defaultOpen: true })
    expect(html).toContain('role="menu"')
    expect(html).toContain('aria-label="Any"')
    expect(html).toContain('title="Any"')
    expect(html).toContain('aria-label="Bible"')
    expect(html).toContain('title="Bible"')
    expect(html).toContain('aria-label="OBS"')
    expect(html).toContain('title="OBS"')
    expect(html).not.toContain('Bible and OBS')
    expect(html).toContain('role="menuitemradio"')
    expect(filterSrc).toContain("value: 'both', label: 'Any'")
    expect(filterSrc).toContain("value: 'bible', label: 'Bible'")
    expect(filterSrc).toContain("value: 'obs', label: 'OBS'")
    expect(filterSrc).toContain('LayoutGrid')
    expect(filterSrc).toContain('BookOpen')
    expect(filterSrc).toContain('BookMarked')
    expect(filterSrc).toContain('Filter')
  })

  test('selected option uses muted fill and accent; trigger accents when not Any', () => {
    const openBible = render({ value: 'bible', defaultOpen: true })
    expect(openBible.match(/aria-checked="true"/g)?.length).toBe(1)
    expect(openBible.match(/aria-checked="false"/g)?.length).toBe(2)

    const bibleClass = buttonClassForLabel(openBible, 'Bible')
    const obsClass = buttonClassForLabel(openBible, 'OBS')
    const anyClass = buttonClassForLabel(openBible, 'Any')
    expect(bibleClass).toContain('bg-muted')
    expect(bibleClass).toContain('text-accent')
    expect(obsClass).not.toContain('text-accent')
    expect(anyClass).not.toContain('text-accent')

    const openObs = render({ value: 'obs', defaultOpen: true })
    expect(buttonClassForLabel(openObs, 'OBS')).toContain('text-accent')
    expect(buttonClassForLabel(openObs, 'Bible')).not.toContain('text-accent')

    const closedBoth = render({ value: 'both' })
    const closedBible = render({ value: 'bible' })
    const triggerBoth = buttonClassForLabel(closedBoth, 'Filter languages')
    const triggerBible = buttonClassForLabel(closedBible, 'Filter languages')
    expect(triggerBoth).toContain('text-fg-secondary')
    expect(triggerBoth).not.toContain('text-accent')
    expect(triggerBible).toContain('text-accent')

    expect(filterSrc).toContain('bg-surface border border-border-subtle rounded-md shadow')
    expect(filterSrc).toContain("e.key === 'Escape'")
    expect(filterSrc).toContain("addEventListener('mousedown'")
  })

  test('popover sits below the trigger', () => {
    const html = render({ value: 'both', defaultOpen: true })
    expect(html).toContain('absolute right-0 top-full')
  })
})

describe('LanguagePicker text-kind filter wiring', () => {
  test('helps mode does not show the Filter control', () => {
    expect(pickerSrc).toContain('LanguagePickerTextKindFilter')
    expect(pickerSrc).toContain("listMode !== 'helps'")
    expect(pickerSrc).toContain('showTextKindFilter &&')
    expect(pickerSrc).not.toContain('aria-label="Filter languages"')
    expect(filterSrc).toContain('aria-label="Filter languages"')
  })
})
