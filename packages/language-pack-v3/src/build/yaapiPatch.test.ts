import { describe, expect, test } from 'bun:test'
import { buildYaapiPatch, pieces, plainText, type YaapiVersionInfo } from './yaapiPatch'

const verses = (n: number, t: string) => Array.from({ length: n }, (_, i) => ({ chapter: 1, verse: i + 1, text: `${t} ${i + 1}` }))
const ver = (abbr: string, over: Partial<YaapiVersionInfo> = {}): YaapiVersionInfo => ({
  abbr,
  name: `Name ${abbr}`,
  copyright: `© ${abbr}`,
  link: 'https://example.org/x',
  field: 'CCBY',
  license: 'CC-BY-4.0',
  audience: 'readers',
  style: 'literal',
  release: `${abbr}@sha256:abc`,
  verses: new Map([['rut', verses(3, abbr)], ['jud', verses(2, abbr)]]),
  ...over,
})
const input = (versions: YaapiVersionInfo[], extra: object = {}) => ({
  lang: 'es-419',
  versions,
  baseTextBooks: new Set<string>(),
  origs: new Map<string, [string, string]>([['rut', ['orig:rut', 's']], ['jud', ['orig:jud', 's']]]),
  origVerses: new Map<string, Set<string>>([['rut', new Set(['1:1', '1:2', '1:3'])], ['jud', new Set(['1:1', '1:2'])]]),
  common: { revision: 1, id: '0'.repeat(64) },
  about: { revision: 1, built: '2026-01-01T00:00:00Z', publisher: 'p' },
  ...extra,
})

describe('plainText', () => {
  test('pieces joined are the text; matras and the danda are handled', () => {
    const t = 'आदि में परमेश्वर ने आकाश की सृष्टि की। (1:2)'
    expect(pieces(t).map((p) => p[0]).join('')).toBe(t)
    expect(pieces(t).filter((p) => p[1]).map((p) => p[0])).toContain('परमेश्वर')
    expect(pieces('हर्ष।')).toEqual([['हर्ष', true], ['।', false]])
    expect(pieces("don't a-b")).toEqual([["don't", true], [' ', false], ['a-b', true]])
  })
  test('events: chapter, para, verse and close; verses joined by one space; no align', () => {
    const m = plainText('r', [{ chapter: 1, verse: 1, text: 'a b' }, { chapter: 1, verse: 2, text: 'c' }, { chapter: 2, verse: 1, text: 'd' }])
    expect(m.pieces.map((p) => p[0]).join('')).toBe('a b c d')
    expect(m.events.map((e) => e[1])).toEqual(['chapter', 'open', 'verse', 'verse', 'close', 'chapter', 'open', 'verse', 'close'])
    expect(m.align).toBeUndefined()
  })
})

describe('buildYaapiPatch', () => {
  test('one text per version in order, resources carry the provenance, no review', async () => {
    const b = await buildYaapiPatch(input([ver('A'), ver('B', { field: 'CCBYSA', license: 'CC-BY-SA-4.0', style: 'dynamic' })]))
    expect(b.segments).toHaveLength(2)
    expect(b.built).toEqual({ A: ['rut', 'jud'], B: ['rut', 'jud'] })
    expect(b.resources.map((r) => [r.key, r.source, r.review, r.license])).toEqual([['yaapi/es-419/A', 'yaapi', undefined, 'CC-BY-4.0'], ['yaapi/es-419/B', 'yaapi', undefined, 'CC-BY-SA-4.0']])
    expect(b.resources.map((r) => [r.audience, r.style])).toEqual([['readers', 'literal'], ['readers', 'dynamic']])
    expect(b.resources[1]!.attribution).toContain('Shared under the same license')
  })
  test('a book the base has text of is left out; an incomplete version book is left out of that version only', async () => {
    const short = ver('B', { verses: new Map([['rut', verses(2, 'B')], ['jud', verses(2, 'B')]]) })
    const b = await buildYaapiPatch(input([ver('A'), short], { baseTextBooks: new Set(['jud']) }))
    expect(b.built).toEqual({ A: ['rut'], B: [] })
    expect(b.resources).toHaveLength(1)
    expect(b.report.join('\n')).toMatch(/jud: left out, the base language has text/)
    expect(b.report.join('\n')).toMatch(/rut B: left out, 1 verses of the original missing/)
  })
  test('a contradicting or closed license is refused', async () => {
    await expect(buildYaapiPatch(input([ver('A', { field: 'CCBYND' })]))).rejects.toThrow(/contradiction/)
    await expect(buildYaapiPatch(input([ver('A', { license: 'CC-BY-ND-4.0' })]))).rejects.toThrow(/not one of/)
  })
})
