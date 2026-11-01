import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const toggleSrc = readFileSync(join(import.meta.dir, 'ThemeToggle.tsx'), 'utf8')
const chromeSrc = readFileSync(join(import.meta.dir, '../../styles/oceanBarChrome.ts'), 'utf8')

describe('ThemeToggle', () => {
  test('ocean variant reuses shared Ocean bar chrome classes', () => {
    expect(toggleSrc).toContain("from '../../styles/oceanBarChrome'")
    expect(toggleSrc).toContain('OCEAN_BAR_ICON')
    expect(chromeSrc).toContain('OCEAN_BAR_FOCUS_RING_OPACITY')
    expect(chromeSrc).toContain('OCEAN_BAR_FOCUS_RING_OPACITY_PERCENT')
    expect(chromeSrc).toContain('focus-visible:ring-offset-[var(--uw-ocean)]')
  })
})
