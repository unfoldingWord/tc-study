import { expect } from 'bun:test'

/** Same pattern as rawPaletteFreeze.test.ts — blocks Tailwind default palette classes in UI markup. */
export const RAW_PALETTE = /(?<![\w-])(?:bg|text|border)-(?:white|black|[a-z]+-\d{2,3})(?![\w-])/

export function expectNoRawPalette(html: string): void {
  expect(html).not.toMatch(RAW_PALETTE)
}
