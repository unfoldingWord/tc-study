import { describe, expect, test } from 'bun:test'
import { extractFirstContentParagraph } from './markdownProcessor'

describe('extractFirstContentParagraph', () => {
  test('extracts first paragraph after ## Definition', () => {
    const md = `# Faithful

## Definition:

Someone who is **faithful** keeps their promises and can be trusted.

## Related Ideas:

- loyalty
`
    expect(extractFirstContentParagraph(md)).toBe(
      'Someone who is **faithful** keeps their promises and can be trusted.'
    )
  })

  test('falls back to first paragraph after title when no ## heading', () => {
    const md = `# Term

This is the definition paragraph.

More content here.
`
    expect(extractFirstContentParagraph(md)).toBe('This is the definition paragraph.')
  })

  test('stops at list markers', () => {
    const md = `# Term

## Definition:

A short definition.
* bullet
`
    expect(extractFirstContentParagraph(md)).toBe('A short definition.')
  })

  test('returns empty string for missing or empty content', () => {
    expect(extractFirstContentParagraph('')).toBe('')
    expect(extractFirstContentParagraph('   ')).toBe('')
    expect(extractFirstContentParagraph('# Only Title\n')).toBe('')
  })
})
