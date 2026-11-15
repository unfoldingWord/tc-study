import { describe, expect, test } from 'bun:test'
import { assignArticle, type SectionPart } from './sections'

const words = (prefix: string, n: number) => Array.from({ length: n }, (_, i) => `${prefix}${i}`).join(' ')

describe('assignSids: role hints', () => {
  const H = (level: number, role: string) => ({ level, role }) as { level: number; role: never }
  const hint = [H(2, 'definition'), H(2, 'facts'), H(3, 'strategies')]
  const parts = (levels: number[], titles: string[] = []): SectionPart[] => levels.map((level, i) => ({ level, title: titles[i] ?? `Titulo ${i}`, md: words(`p${i}x`, 10) }))
  const run = (p: SectionPart[], h: typeof hint | undefined = hint) => assignArticle('id', p, undefined, h)

  test('the same sequence of levels takes the roles of the hint where the table has none', () => {
    const out = run(parts([2, 2, 3]))
    expect(out.hintUsed).toBe(true)
    expect(out.sections.map((s) => s.role)).toEqual(['definition', 'facts', 'strategies'])
    expect(out.sections.map((s) => s.sid)).toEqual(['definition', 'facts', 'strategies'])
  })

  test('another shape does not use the hint', () => {
    for (const levels of [[2, 2], [2, 2, 2], [2, 3, 3]]) {
      const out = run(parts(levels))
      expect(out.hintUsed).toBe(false)
      expect(out.sections.every((s) => s.role === 'unknown')).toBe(true)
    }
  })

  test('a table role that disagrees with the hint rejects the hint for the whole article', () => {
    const out = run(parts([2, 2, 3], ['Ejemplos de la Biblia']), [H(2, 'description'), H(2, 'facts'), H(3, 'strategies')])
    expect(out.hintUsed).toBe(false)
    expect(out.sections.map((s) => s.role)).toEqual(['examples', 'unknown', 'unknown'])
  })

  test('a table role that agrees with the hint keeps the hint', () => {
    const out = run(parts([2, 2, 3], ['Hechos']), [H(2, 'facts'), H(2, 'facts'), H(3, 'strategies')])
    expect(out.hintUsed).toBe(true)
  })

  test('the text before the first heading does not count in the shape', () => {
    const out = run([{ level: 0, md: 'intro' }, ...parts([2, 2, 3])])
    expect(out.hintUsed).toBe(true)
    expect(out.sections.map((s) => s.role)).toEqual(['intro', 'definition', 'facts', 'strategies'])
  })

  test('a role the table knows is kept', () => {
    const out = run(parts([2, 2, 3], ['Hechos']), [H(2, 'facts'), H(2, 'unknown'), H(3, 'strategies')])
    expect(out.sections.map((s) => s.role)).toEqual(['facts', 'unknown', 'strategies'])
  })

  test('inheritance runs after the hints for what is left', () => {
    const out = run(parts([2, 3, 4]), [H(2, 'definition'), H(3, 'unknown'), H(4, 'unknown')])
    expect(out.hintUsed).toBe(true)
    expect(out.sections.map((s) => s.role)).toEqual(['definition', 'definition', 'definition'])
  })

  test('a hinted role does not move the sids of a registry that has them', () => {
    const p = parts([2, 2, 3])
    const first = run(p, undefined)
    const again = assignArticle('id', p, first.entries, hint)
    expect(again.sections.map((s) => s.sid)).toEqual(first.sections.map((s) => s.sid))
  })
})
