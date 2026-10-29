/**
 * PR 3 shape contract (docs/TC4_STYLE_AND_BRAND.md §5.4):
 * - Tailwind radius and shadow theme variables map to tC4 values.
 * - Light shadows stay Ocean-tinted; dark restates the same geometry in black at the same alpha.
 * - Scrollbars are tC4's capsule (tokens/base.css), and the focus ring stays on ring-accent.
 */
import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const STYLES = import.meta.dir
const indexCss = readFileSync(join(STYLES, '..', 'index.css'), 'utf8')
const tc4Tokens = readFileSync(join(STYLES, 'tc4-tokens.css'), 'utf8')

type Decls = Record<string, string>
type Rule = { context: string[]; selector: string; decls: Decls; raw: string }

const squash = (s: string) => s.replace(/\s+/g, ' ').trim()

function declarations(body: string): Decls {
  const out: Decls = {}
  for (const part of body.split(';')) {
    const colon = part.indexOf(':')
    if (colon <= 0 || part.trim().startsWith('@')) continue
    out[part.slice(0, colon).trim()] = squash(part.slice(colon + 1))
  }
  return out
}

/** Every block in the file, with the at-rules it sits in, so a second block cannot hide. */
function parseRules(css: string): Rule[] {
  const src = css.replace(/\/\*[\s\S]*?\*\//g, '')
  const rules: Rule[] = []
  const stack: { selector: string; body: string }[] = []
  let buf = ''
  for (const ch of src) {
    if (ch === '{') {
      const cut = buf.lastIndexOf(';') + 1
      if (stack.length) stack[stack.length - 1].body += buf.slice(0, cut)
      stack.push({ selector: squash(buf.slice(cut)), body: '' })
      buf = ''
    } else if (ch === '}') {
      const top = stack.pop()
      if (!top) throw new Error('unbalanced }')
      top.body += buf
      rules.push({
        context: stack.map((s) => s.selector),
        selector: top.selector,
        decls: declarations(top.body),
        raw: top.body,
      })
      buf = ''
    } else {
      buf += ch
    }
  }
  if (stack.length) throw new Error('unbalanced {')
  return rules
}

const indexRules = parseRules(indexCss)
const tokenRules = parseRules(tc4Tokens)

function only(rules: Rule[], selector: string, context: string[] = []): Rule {
  const hits = rules.filter((r) => r.selector === selector && squash(r.context.join('|')) === squash(context.join('|')))
  if (hits.length !== 1) throw new Error(`expected one "${selector}" block in [${context.join(' > ')}], found ${hits.length}`)
  return hits[0]
}

type Rgba = [number, number, number, number]

/** rgb()/rgba() in comma or space syntax; anything else (hex, names, hsl) is rejected. */
function rgbaOf(color: string): Rgba | null {
  const m = color.trim().match(/^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)\s*(?:[,/]\s*([\d.]+)\s*)?\)$/i)
  if (!m) return null
  return [Number(m[1]), Number(m[2]), Number(m[3]), m[4] === undefined ? 1 : Number(m[4])]
}

/** A single box-shadow: offsets and blur, then one rgb()/rgba() colour. */
function shadowOf(value: string): { geometry: string; color: Rgba } | null {
  const m = value.trim().match(/^(-?\d[\w.]*(?:\s+-?\d[\w.]*){1,3})\s+(rgba?\([^)]*\))$/i)
  if (!m) return null
  const color = rgbaOf(m[2])
  return color ? { geometry: squash(m[1]), color } : null
}

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

const TC4_SHADOWS = [...new Set(Object.values(EXPECTED_SHADOW_MAP))]

/** Ocean, and the deeper Ocean tC4 uses under modals (tokens/elevation.css). */
const OCEAN_TINTS = ['1,66,99', '1,38,56']

const themeVars = only(indexRules, '@theme').decls
const lightShadows = only(tokenRules, ':root').decls
const darkShadows = only(indexRules, '.dark').decls

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

  test('tC4 shadows are set in tc4-tokens.css :root and restated only in the top-level .dark block', () => {
    const setsShadow = (r: Rule) => Object.keys(r.decls).some((k) => k.startsWith('--tc4-shadow-'))
    expect(tokenRules.filter(setsShadow).map((r) => r.selector)).toEqual([':root'])
    const inIndex = indexRules.filter(setsShadow)
    expect(inIndex.map((r) => [r.context.join(' > '), r.selector])).toEqual([['', '.dark']])
  })

  test('light tC4 shadows are Ocean-tinted shadows', () => {
    for (const token of TC4_SHADOWS) {
      const shadow = shadowOf(lightShadows[token] ?? '')
      expect(shadow, `${token}: ${lightShadows[token]}`).not.toBeNull()
      expect(OCEAN_TINTS).toContain(shadow!.color.slice(0, 3).join(','))
    }
  })

  test('dark restates every tC4 shadow with the same geometry, in black at the same alpha', () => {
    for (const token of TC4_SHADOWS) {
      const light = shadowOf(lightShadows[token] ?? '')
      const dark = shadowOf(darkShadows[token] ?? '')
      expect(dark, `${token}: ${darkShadows[token]}`).not.toBeNull()
      expect(dark!.geometry).toBe(light!.geometry)
      expect(dark!.color.slice(0, 3)).toEqual([0, 0, 0])
      expect(dark!.color[3]).toBe(light!.color[3])
    }
  })
})

describe('tc4 scrollbars', () => {
  const BASE = ['@layer base']
  const FALLBACK = [...BASE, '@supports not selector(::-webkit-scrollbar-thumb)']
  const thumb = (selector: string) => only(indexRules, selector, BASE).decls

  test('the capsule: 10px gutter, transparent track and corner, a pill thumb clipped inside a 2px border', () => {
    expect(only(indexRules, '::-webkit-scrollbar', BASE).decls).toMatchObject({ width: '10px', height: '10px' })
    expect(only(indexRules, '::-webkit-scrollbar-track', BASE).decls.background).toBe('transparent')
    expect(only(indexRules, '::-webkit-scrollbar-corner', BASE).decls.background).toBe('transparent')
    expect(thumb('::-webkit-scrollbar-thumb')).toMatchObject({
      'border-radius': '9999px',
      border: '2px solid transparent',
      'background-clip': 'padding-box',
    })
  })

  test('the thumb is Ocean in light and white on .dark, rising on hover and press', () => {
    const cases: [string, Rgba][] = [
      ['::-webkit-scrollbar-thumb', [1, 66, 99, 0.18]],
      ['::-webkit-scrollbar-thumb:hover', [1, 66, 99, 0.32]],
      ['::-webkit-scrollbar-thumb:active', [1, 66, 99, 0.42]],
      ['.dark::-webkit-scrollbar-thumb, .dark *::-webkit-scrollbar-thumb', [255, 255, 255, 0.22]],
      ['.dark::-webkit-scrollbar-thumb:hover, .dark *::-webkit-scrollbar-thumb:hover', [255, 255, 255, 0.38]],
      ['.dark::-webkit-scrollbar-thumb:active, .dark *::-webkit-scrollbar-thumb:active', [255, 255, 255, 0.5]],
    ]
    for (const [selector, expected] of cases) {
      const decls = thumb(selector)
      expect(rgbaOf(decls.background ?? ''), selector).toEqual(expected)
      expect(decls['background-clip'], selector).toBe('padding-box')
    }
  })

  test('the standard properties are only a fallback for engines without the pseudo-elements', () => {
    const fallback = only(indexRules, '*', FALLBACK).decls
    expect(fallback['scrollbar-width']).toBe('thin')
    const [light, lightTrack] = fallback['scrollbar-color'].split(/\s+(?=transparent$)/)
    expect(rgbaOf(light)).toEqual([1, 66, 99, 0.28])
    expect(lightTrack).toBe('transparent')
    const [dark, darkTrack] = only(indexRules, '.dark, .dark *', FALLBACK).decls['scrollbar-color'].split(/\s+(?=transparent$)/)
    expect(rgbaOf(dark)).toEqual([255, 255, 255, 0.32])
    expect(darkTrack).toBe('transparent')

    const unguarded = indexRules.filter(
      (r) => ('scrollbar-width' in r.decls || 'scrollbar-color' in r.decls) && !r.context.includes(FALLBACK[1]),
    )
    expect(unguarded.map((r) => r.selector)).toEqual([])
  })
})

describe('tc4 focus ring', () => {
  test(':focus-visible stays on ring-accent', () => {
    const raw = squash(only(indexRules, '*:focus-visible', ['@layer base']).raw)
    expect(raw).toMatch(/@apply\b[^;]*\bring-2\b/)
    expect(raw).toMatch(/@apply\b[^;]*\bring-accent\b/)
  })
})
