/**
 * The --theme-* tokens carry tC4's colours (docs/TC4_STYLE_AND_BRAND.md §5.2 light, §5.3 dark),
 * and every pair that carries text stays readable (WCAG AA, 4.5:1) in both themes.
 */
import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const STYLES = import.meta.dir
const SRC = join(STYLES, '..')

type Vars = Record<string, string>

function declarations(block: string): Vars {
  const out: Vars = {}
  for (const m of block.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)) out[m[1]] = m[2].trim()
  return out
}

/** The body of the first top-level rule whose selector is exactly `selector`. */
function ruleBody(css: string, selector: string): string {
  const clean = css.replace(/\/\*[\s\S]*?\*\//g, '')
  const re = new RegExp(`(^|\\n)\\s*${selector.replace('.', '\\.')}\\s*\\{([^}]*)\\}`)
  const m = clean.match(re)
  if (!m) throw new Error(`no ${selector} block`)
  return m[2]
}

const tc4 = declarations(ruleBody(readFileSync(join(STYLES, 'tc4-tokens.css'), 'utf8'), ':root'))
const indexCss = readFileSync(join(SRC, 'index.css'), 'utf8')
const light = declarations(ruleBody(indexCss, ':root'))
const dark = declarations(ruleBody(indexCss, '.dark'))

function resolve(value: string, scope: Vars, depth = 0): string {
  if (depth > 10) throw new Error(`var() loop at ${value}`)
  const m = value.match(/^var\((--[\w-]+)\)$/)
  if (!m) return value
  const next = scope[m[1]] ?? light[m[1]] ?? tc4[m[1]]
  if (next === undefined) throw new Error(`unknown ${m[1]}`)
  return resolve(next, scope, depth + 1)
}

function theme(scope: Vars, name: string): string {
  const raw = scope[`--theme-${name}`]
  if (raw === undefined) throw new Error(`--theme-${name} missing`)
  return resolve(raw, scope).toUpperCase()
}

const EXPECTED: Record<'light' | 'dark', Record<string, string>> = {
  light: {
    canvas: '#F7FAFC', surface: '#FFFFFF', elevated: '#FFFFFF', 'tab-selected': '#FFFFFF',
    muted: '#ECF2F5', border: '#E2E4E6', 'border-subtle': '#E8EBED',
    fg: '#1E2C36', 'fg-secondary': '#4F5E6A', 'fg-muted': '#626F78',
    accent: '#156D91', 'accent-hover': '#0C4F6B', 'accent-soft': '#EAF6FC', 'accent-fg': '#014263',
    'accent-fill': '#31ADE3', 'accent-fill-hover': '#2599CC', 'accent-fill-press': '#1F8CBA',
    'accent-fill-fg': '#FFFFFF',
    scripture: '#FFFFFF', 'scripture-fg': '#231F20', 'scripture-muted': '#626F78',
    highlight: '#FFF1B8', 'highlight-strong': '#FDD910', underline: '#B7C2C9',
    danger: '#A21309', 'danger-soft': '#FAEDEB', warning: '#E59D33', 'warning-fg': '#8A5B12',
    'warning-soft': '#FCF6EA', 'valid-soft': '#E8F7ED', 'valid-fg': '#327547',
    'panel-1': '#31ADE3', 'panel-1-soft': '#EAF6FC', 'panel-1-fg': '#156D91',
    'panel-2': '#E59D33', 'panel-2-soft': '#FCF6EA', 'panel-2-fg': '#8A5B12',
    helps: '#014263', 'helps-soft': '#ECF2F5', 'helps-fg': '#014263', 'helps-border': '#014263',
    'chip-quote': '#EAF6FC', 'chip-quote-hover': '#CFECF8', 'chip-quote-fg': '#014263',
    overlay: 'RGB(1 38 56 / 0.55)',
  },
  dark: {
    canvas: '#071E2C', surface: '#0C2A3C', elevated: '#12364C', 'tab-selected': '#05141E',
    muted: '#1F3B4C', border: '#415967', 'border-subtle': '#294453',
    fg: '#FFFFFF', 'fg-secondary': '#C2CACE', 'fg-muted': '#9EAAB1',
    accent: '#31ADE3', 'accent-hover': '#7ACDED', 'accent-soft': '#144761', 'accent-fg': '#CFECF8',
    'accent-fill': '#31ADE3', 'accent-fill-hover': '#2599CC', 'accent-fill-press': '#1F8CBA',
    'accent-fill-fg': '#FFFFFF',
    scripture: '#0F3044', 'scripture-fg': '#FFFFFF', 'scripture-muted': '#9EAAB1',
    highlight: '#5B4B12', 'highlight-strong': '#7A641C', underline: '#9EAAB1',
    danger: '#F2938A', 'danger-soft': '#313B48', warning: '#E59D33', 'warning-fg': '#F2CE99',
    'warning-soft': '#313B48', 'valid-soft': '#184246', 'valid-fg': '#9BDAAF',
    'panel-1': '#31ADE3', 'panel-1-soft': '#144761', 'panel-1-fg': '#CFECF8',
    'panel-2': '#E59D33', 'panel-2-soft': '#333F3A', 'panel-2-fg': '#F2CE99',
    helps: '#A8DEF4', 'helps-soft': '#1F3B4C', 'helps-fg': '#FFFFFF', 'helps-border': '#6D7F8A',
    'chip-quote': '#123F57', 'chip-quote-hover': '#154964', 'chip-quote-fg': '#CFECF8',
    overlay: 'RGB(0 10 16 / 0.65)',
  },
}

/** Pairs that carry text: [foreground, background]. */
const TEXT_PAIRS: [string, string][] = [
  ['fg', 'surface'], ['fg', 'canvas'], ['fg-secondary', 'surface'], ['fg-muted', 'surface'],
  ['fg-muted', 'muted'], ['accent', 'surface'], ['accent-fg', 'accent-soft'],
  ['scripture-fg', 'scripture'], ['scripture-muted', 'scripture'], ['danger', 'danger-soft'],
  ['warning-fg', 'surface'], ['panel-1-fg', 'panel-1-soft'], ['panel-2-fg', 'panel-2-soft'],
  ['helps-fg', 'helps-soft'], ['chip-quote-fg', 'chip-quote'], ['scripture-fg', 'highlight'],
  ['valid-fg', 'valid-soft'], ['warning-fg', 'warning-soft'],
]

/** Strokes that mark a control's edge (WCAG 1.4.11, 3:1): [stroke, background]. */
const UI_PAIRS: [string, string][] = [['helps-border', 'surface'], ['helps-border', 'elevated']]

function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
  const lin = (c: number) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4)
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b)
}

function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x)
  return (hi + 0.05) / (lo + 0.05)
}

for (const mode of ['light', 'dark'] as const) {
  const scope = mode === 'light' ? light : dark
  describe(`${mode} theme tokens`, () => {
    test('every --theme-* value is the spec value', () => {
      const actual = Object.fromEntries(Object.keys(EXPECTED[mode]).map((k) => [k, theme(scope, k)]))
      expect(actual).toEqual(EXPECTED[mode])
    })

    for (const [fg, bg] of TEXT_PAIRS) {
      test(`${fg} on ${bg} reaches 4.5:1`, () => {
        expect(contrast(theme(scope, fg), theme(scope, bg))).toBeGreaterThanOrEqual(4.5)
      })
    }

    for (const [stroke, bg] of UI_PAIRS) {
      test(`${stroke} on ${bg} reaches 3:1`, () => {
        expect(contrast(theme(scope, stroke), theme(scope, bg))).toBeGreaterThanOrEqual(3)
      })
    }
  })
}

describe('token rules', () => {
  test('every dark value except the overlay is solid hex, so opacity modifiers keep their look', () => {
    const notHex = Object.keys(EXPECTED.dark)
      .filter((k) => k !== 'overlay')
      .filter((k) => !/^#[0-9A-F]{6}$/.test(theme(dark, k)))
    expect(notHex).toEqual([])
  })

  test('every token is mapped to a Tailwind colour in @theme', () => {
    const mapped = declarations(ruleBody(indexCss, '@theme'))
    const unmapped = Object.keys(EXPECTED.light).filter(
      (k) => mapped[`--color-${k}`] !== `var(--theme-${k})`
    )
    expect(unmapped).toEqual([])
  })

  test('Inspire is never the light accent text colour (2.6:1 on paper)', () => {
    expect(theme(light, 'accent')).not.toBe('#31ADE3')
  })
})
