/**
 * PR 3 shape contract (docs/TC4_STYLE_AND_BRAND.md §5.4):
 * - Tailwind radius and shadow theme variables map to tC4 values.
 * - Light shadows stay Ocean-tinted (no black shadows).
 * - Dark mode restates tC4 shadows as black with the same alpha.
 */
import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const STYLES = import.meta.dir
const indexCss = readFileSync(join(STYLES, '..', 'index.css'), 'utf8')
const tc4Tokens = readFileSync(join(STYLES, 'tc4-tokens.css'), 'utf8')

type Vars = Record<string, string>

function declarations(block: string): Vars {
  const out: Vars = {}
  for (const m of block.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)) out[m[1]] = m[2].trim()
  return out
}

function bodyOf(css: string, selector: string): string {
  const clean = css.replace(/\/\*[\s\S]*?\*\//g, '')
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const re = new RegExp(`(^|\\n)\\s*${escaped}\\s*\\{([\\s\\S]*?)\\n\\s*\\}`)
  const m = clean.match(re)
  if (!m) throw new Error(`no ${selector} block`)
  return m[2]
}

function alphaOf(color: string): string {
  const colorToken = color.match(/rgba?\([^)]+\)/i)?.[0]
  if (!colorToken) throw new Error(`unsupported colour format: ${color}`)
  const compact = colorToken.replace(/\s+/g, ' ').trim()
  const rgbSpace = compact.match(/^rgb\(\s*\d+\s+\d+\s+\d+\s*\/\s*([0-9.]+)\s*\)$/i)
  if (rgbSpace) return rgbSpace[1]
  const rgbaComma = compact.match(/^rgba\(\s*\d+\s*,\s*\d+\s*,\s*\d+\s*,\s*([0-9.]+)\s*\)$/i)
  if (rgbaComma) return rgbaComma[1]
  const rgbComma = compact.match(/^rgb\(\s*\d+\s*,\s*\d+\s*,\s*\d+\s*\)$/i)
  if (rgbComma) return '1'
  throw new Error(`unsupported colour format: ${color}`)
}

const themeVars = declarations(bodyOf(indexCss, '@theme'))
const darkVars = declarations(bodyOf(indexCss, '.dark'))
const tc4 = declarations(bodyOf(tc4Tokens, ':root'))

const EXPECTED_RADIUS: Record<string, string> = {
  '--radius-xs': '4px',
  '--radius': '4px',
  '--radius-sm': '4px',
  '--radius-md': '8px',
  '--radius-lg': '10px',
  '--radius-xl': '12px',
  '--radius-2xl': '16px',
  '--radius-3xl': '16px',
  '--radius-4xl': '16px',
}

const EXPECTED_SHADOW_MAP: Record<string, string> = {
  '--shadow-2xs': '--tc4-shadow-chip',
  '--shadow-xs': '--tc4-shadow-chip',
  '--shadow': '--tc4-shadow-card',
  '--shadow-sm': '--tc4-shadow-card',
  '--shadow-md': '--tc4-shadow-hover',
  '--shadow-lg': '--tc4-shadow-hero',
  '--shadow-xl': '--tc4-shadow-modal',
  '--shadow-2xl': '--tc4-shadow-modal',
}

describe('tc4 shape variables', () => {
  test('maps Tailwind radius tokens to the PR 3 table', () => {
    for (const [name, expected] of Object.entries(EXPECTED_RADIUS)) {
      expect(themeVars[name]).toBe(expected)
    }
  })

  test('maps Tailwind shadow tokens to tC4 shadow aliases and leaves --shadow-inner untouched', () => {
    for (const [name, token] of Object.entries(EXPECTED_SHADOW_MAP)) {
      expect(themeVars[name]).toBe(`var(${token})`)
    }
    expect(themeVars['--shadow-inner']).toBeUndefined()
  })

  test('light tC4 shadows are Ocean-tinted, never black', () => {
    for (const token of new Set(Object.values(EXPECTED_SHADOW_MAP))) {
      const value = tc4[token]
      expect(value).toBeDefined()
      expect(value).not.toContain('rgb(0 0 0')
      expect(value).not.toMatch(/rgba?\(\s*0\s*,\s*0\s*,\s*0\b/i)
    }
  })

  test('dark mode redefines every tC4 shadow token with black at the same alpha', () => {
    for (const token of new Set(Object.values(EXPECTED_SHADOW_MAP))) {
      const lightValue = tc4[token]
      const darkValue = darkVars[token]
      expect(lightValue).toBeDefined()
      expect(darkValue).toBeDefined()
      expect(darkValue).toMatch(/^rgb\(\s*0\s+0\s+0\s*\/\s*[0-9.]+\s*\)$/i)
      expect(alphaOf(darkValue!)).toBe(alphaOf(lightValue!))
    }
  })
})
