/**
 * tC4's faces are self-hosted so the app works offline (docs/TC4_STYLE_AND_BRAND.md §5.2).
 */
import { describe, expect, test } from 'bun:test'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

const STYLES = import.meta.dir
const APP = join(STYLES, '..', '..')
const fontsCss = readFileSync(join(STYLES, 'tc4-fonts.css'), 'utf8')
const indexCss = readFileSync(join(STYLES, '..', 'index.css'), 'utf8')
const faces = [...fontsCss.matchAll(/@font-face\s*\{([^}]*)\}/g)].map((m) => m[1])

const family = (face: string) => face.match(/font-family:\s*"([^"]+)"/)?.[1]
const ranges = (name: string) =>
  faces.filter((f) => family(f) === name).map((f) => f.match(/unicode-range:\s*([^;]+);/)?.[1] ?? '')

describe('tc4 fonts', () => {
  test('declares the four tC4 families', () => {
    expect(new Set(faces.map(family))).toEqual(
      new Set(['Mulish', 'Charis SIL', 'Noto Serif', 'Noto Serif Hebrew'])
    )
  })

  test('every url() points at a file in public/fonts', () => {
    const urls = [...fontsCss.matchAll(/url\("([^"]+)"\)/g)].map((m) => m[1])
    expect(urls.length).toBeGreaterThan(0)
    const missing = urls.filter((u) => !u.startsWith('/fonts/') || !existsSync(join(APP, 'public', u)))
    expect(missing).toEqual([])
  })

  test('every face swaps in and is limited to a unicode-range', () => {
    expect(faces.every((f) => /font-display:\s*swap/.test(f))).toBe(true)
    expect(faces.every((f) => /unicode-range:/.test(f))).toBe(true)
  })

  test('each family ships its OFL licence', () => {
    for (const name of ['Mulish', 'CharisSIL', 'NotoSerif', 'NotoSerifHebrew']) {
      expect(existsSync(join(APP, 'public', 'fonts', `OFL-${name}.txt`))).toBe(true)
    }
  })

  test('Greek goes to Noto Serif and Hebrew to Noto Serif Hebrew', () => {
    expect(ranges('Noto Serif').some((r) => r.includes('U+0370-0377'))).toBe(true)
    expect(ranges('Noto Serif Hebrew').some((r) => r.includes('U+0590-05FF'))).toBe(true)
  })

  test('index.css loads the faces locally and names them as font tokens', () => {
    expect(indexCss).toContain('@import "./styles/tc4-fonts.css";')
    expect(indexCss).not.toContain('fonts.googleapis')
    expect(indexCss).toMatch(/--font-ui:\s*"Mulish"/)
    expect(indexCss).toMatch(/--font-scripture:\s*"Charis SIL"[^;]*"Noto Serif"[^;]*"Noto Serif Hebrew"/)
  })
})
