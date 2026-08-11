import { describe, expect, test } from 'bun:test'
import { datedFilename, slugFilename } from './downloadJson'

describe('downloadJson helpers', () => {
  test('slugFilename lowercases and hyphenates', () => {
    expect(slugFilename('My Passage Set')).toBe('my-passage-set')
  })

  test('datedFilename prefixes with ISO date', () => {
    const name = datedFilename('collections')
    expect(name).toMatch(/^collections-\d{4}-\d{2}-\d{2}\.json$/)
  })
})
