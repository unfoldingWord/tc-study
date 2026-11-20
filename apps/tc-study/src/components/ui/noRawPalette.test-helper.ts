import { expect } from 'bun:test'
import { RAW_PALETTE_CLASS } from '../../utils/rawPalettePattern'

export { RAW_PALETTE_CLASS }

export function expectNoRawPalette(html: string): void {
  RAW_PALETTE_CLASS.lastIndex = 0
  expect(html).not.toMatch(RAW_PALETTE_CLASS)
}
