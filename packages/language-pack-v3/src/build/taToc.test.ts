import { describe, expect, test } from 'bun:test'
import { parseTaToc } from './taToc'

describe('parseTaToc', () => {
  test('linked items name articles; headings and other lines are ignored', () => {
    const text = [
      'title: "Table of Contents"',
      'sections:',
      '  - title: "Introduction to Translation"',
      '    sections:',
      '      - title: "The Qualities of a Good Translation"',
      '        link: translation-guidelines',
      '      - title: "Figures of Speech"',
      '        sections:',
      '          - title: "Biblical Imagery — Simple Metaphors"',
      '            link: "figs-simetaphor"',
      "          - title: 'Metaphor'",
      '            link: figs-metaphor # note',
      '          - title: Plain Title',
      '            link: figs-plain',
      '  - title: "Last heading"',
      '',
    ].join('\r\n')
    expect(parseTaToc(text)).toEqual([
      ['translation-guidelines', 'The Qualities of a Good Translation'],
      ['figs-simetaphor', 'Biblical Imagery — Simple Metaphors'],
      ['figs-metaphor', 'Metaphor'],
      ['figs-plain', 'Plain Title'],
    ])
  })

  test('a title with a colon is kept whole, quoted or not', () => {
    expect(parseTaToc('- title: "Step 1: Getting Started"\n  link: a\n- title: Step 2: More\n  link: b\n')).toEqual([
      ['a', 'Step 1: Getting Started'],
      ['b', 'Step 2: More'],
    ])
  })

  test('a link written before its title is dropped (the title then names nothing)', () => {
    expect(parseTaToc('- link: a\n  title: "T"\n')).toEqual([])
  })

  test('empty text and a heading alone give nothing', () => {
    expect(parseTaToc('')).toEqual([])
    expect(parseTaToc('title: "X"\nsections:\n  - title: "H"\n')).toEqual([])
  })
})
