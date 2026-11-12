import { describe, expect, test } from 'bun:test'
import { ROLES } from '@bt-synergy/language-pack-v3'
import { schemas as exported } from '../index'
import { SEARCH_FILTER_KEYS, type SearchKind } from '../search/types'
import schemas from './schemas.json'

const NAMES = ['article', 'books', 'concept', 'context', 'lookup', 'passage', 'renderings', 'search', 'topics', 'academy', 'stories', 'story', 'sections']
type Entry = { label: { es: string }; description: string; input: { type: string; properties: Record<string, unknown>; required: string[] } }

describe('schemas.json', () => {
  test('exactly the thirteen query names, exported by the package', () => {
    expect(Object.keys(schemas).sort()).toEqual([...NAMES].sort())
    expect(exported).toBe(schemas)
  })
  test('each has a Spanish label, an English description and an input schema', () => {
    for (const name of NAMES) {
      const s = (schemas as unknown as Record<string, Entry>)[name]!
      expect(s.label.es.length).toBeGreaterThan(0)
      expect(s.description.endsWith('.')).toBe(true)
      expect(s.input.type).toBe('object')
      expect(Object.keys(s.input.properties).length).toBeGreaterThan(0)
      expect(Array.isArray(s.input.required)).toBe(true)
      for (const r of s.input.required) expect(Object.keys(s.input.properties)).toContain(r)
    }
  })
  test('the search schema has the arguments of reader.search(text, filters)', () => {
    const props = Object.keys((schemas as unknown as Record<string, Entry>).search!.input.properties).sort()
    expect(props).toEqual(['text', ...Object.keys(SEARCH_FILTER_KEYS)].sort())
  })
  test('the article input pins roles to ROLES and forbids section with roles', () => {
    const input = (schemas as any).article.input
    expect(input.properties.roles.items.enum).toEqual([...ROLES])
    expect(input.not.required).toEqual(['section', 'roles'])
  })
  test('the search schema lists every kind, section included', () => {
    const kinds = (schemas as unknown as { search: { input: { properties: { kinds: { items: { enum: string[] } } } } } }).search.input.properties.kinds.items.enum
    const all: Record<SearchKind, true> = { text: true, note: true, question: true, link: true, section: true }
    expect([...kinds].sort()).toEqual(Object.keys(all).sort())
    expect(kinds).toContain('section')
  })
})
