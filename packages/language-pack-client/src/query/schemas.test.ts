import { describe, expect, test } from 'bun:test'
import { schemas as exported } from '../index'
import schemas from './schemas.json'

const NAMES = ['article', 'books', 'concept', 'context', 'passage', 'renderings', 'search', 'topics']
type Entry = { label: { es: string }; description: string; input: { type: string; properties: Record<string, unknown>; required: string[] } }

describe('schemas.json', () => {
  test('exactly the eight query names, exported by the package', () => {
    expect(Object.keys(schemas).sort()).toEqual(NAMES)
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
})
