import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { OCEAN_BAR_FOCUS_RING, OCEAN_BAR_SECTION_SHORTCUT } from '../styles/oceanBarChrome'

const layoutSrc = readFileSync(join(import.meta.dir, 'Layout.tsx'), 'utf8')

describe('Layout Ocean bar', () => {
  test('section shortcut NavLink uses shared chrome including focus ring', () => {
    expect(layoutSrc).toContain('OCEAN_BAR_SECTION_SHORTCUT')
    for (const token of OCEAN_BAR_FOCUS_RING.split(' ')) {
      expect(OCEAN_BAR_SECTION_SHORTCUT).toContain(token)
    }
  })
})
