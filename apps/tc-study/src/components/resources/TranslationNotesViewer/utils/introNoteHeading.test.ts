import { describe, expect, test } from 'bun:test'
import { introNoteHeading, shouldCollapseIntroNote } from './introNoteHeading'

describe('introNoteHeading', () => {
  test('uses the first markdown heading', () => {
    const note = `# Ephesians 2 Chapter Introduction

## Structure and Formatting

This chapter focuses on the life before belief.
`
    expect(introNoteHeading(note)).toBe('Ephesians 2 Chapter Introduction')
  })

  test('strips inline markdown in the heading', () => {
    expect(introNoteHeading('# **Book** Introduction\n\nbody')).toBe('Book Introduction')
  })

  test('falls back to the first non-empty line', () => {
    expect(introNoteHeading('\n\nA short intro without a heading.\n')).toBe(
      'A short intro without a heading.'
    )
  })

  test('reads a heading when breaks are stored as \\\\n', () => {
    const note =
      '# Ephesians 2 Chapter Introduction\\n\\n## Structure and Formatting\\n\\nThis chapter focuses on the life before belief.'
    expect(introNoteHeading(note)).toBe('Ephesians 2 Chapter Introduction')
  })
})

describe('shouldCollapseIntroNote', () => {
  const chapterIntro =
    '# Ephesians 2 Chapter Introduction\\n\\n## Structure and Formatting\\n\\n' +
    'This chapter focuses on the life that a Christian had before coming to believe in Jesus. '.repeat(8)

  test('collapses a long unquoted note that opens with a heading', () => {
    expect(shouldCollapseIntroNote({ note: chapterIntro, quote: '' })).toBe(true)
  })

  test('keeps a short connecting statement open', () => {
    expect(
      shouldCollapseIntroNote({
        note: '# Connecting Statement:\\n\\nPaul reminds the believers of their past.',
        quote: '',
      })
    ).toBe(false)
  })

  test('keeps quoted verse notes open', () => {
    expect(
      shouldCollapseIntroNote({
        note: chapterIntro,
        quote: 'ὑμᾶς',
      })
    ).toBe(false)
  })

  test('collapses parser-flagged intros even when short', () => {
    expect(shouldCollapseIntroNote({ isIntro: true, note: '# Ephesians 1 Chapter Introduction', quote: '' })).toBe(
      true
    )
  })
})
