/**
 * The Hebrew Bible keeps a qere in a footnote after its ketiv (`\w יעשה\w*\f + \ft Q \+w יַ֣עַשׂ\+w*\f*`, Ruth 1:8).
 * collectUsjWords used to walk into the note and count the qere as a word of the verse, while the layout shows no
 * words of notes: every word after the ketiv was then shown with the token of the word before it, and the verse lost
 * its last word (Ruth 1:8 ended in הַמֵּתִים, without וְעִמָּדִי).
 */

import { describe, expect, test } from 'bun:test'

import {
  buildUsjLayoutBlocksForChapter,
  buildUsjViewModel,
  collectUsjWords,
  collectVerseDisplayInline,
} from '../src/index'

const w = (word: string) => ({ type: 'char', marker: 'w', content: [word] })

// Ruth 1:8, shortened: the ketiv יעשה, its qere in a footnote, and the words after it.
const usj = {
  type: 'USJ',
  version: '3.1',
  content: [
    { type: 'book', marker: 'id', code: 'RUT' },
    { type: 'chapter', marker: 'c', number: '1', sid: 'RUT 1' },
    {
      type: 'para',
      marker: 'p',
      content: [
        { type: 'verse', marker: 'v', number: '8', sid: 'RUT 1:8' },
        w('אִמָּ֑⁠הּ'),
        ' ',
        w('יעשה'),
        ' ',
        {
          type: 'note',
          marker: 'f',
          caller: '+',
          content: [{ type: 'char', marker: 'ft', content: ['Q ', w('יַ֣עַשׂ')] }],
        },
        ' ',
        w('יְהוָ֤ה'),
        ' ',
        w('הַ⁠מֵּתִ֖ים'),
        ' ',
        w('וְ⁠עִמָּדִֽ⁠י'),
        '׃',
      ],
    },
  ],
}

const VERSE = ['אִמָּ֑⁠הּ', 'יעשה', 'יְהוָ֤ה', 'הַ⁠מֵּתִ֖ים', 'וְ⁠עִמָּדִֽ⁠י']

describe('a qere in a footnote is not a word of the verse', () => {
  test('collectUsjWords leaves out the words of notes', () => {
    expect(collectUsjWords(usj, 'RUT').map((x) => x.content)).toEqual(VERSE)
  })

  test('each word shown carries its own token, and the last word is there', () => {
    const viewModel = buildUsjViewModel({ usj, alignmentMap: {}, bookCode: 'RUT', bookName: 'Ruth' })
    expect(viewModel.chapters[0]!.verses[0]!.tokens.map((t) => t.content)).toEqual(VERSE)

    const blocks = buildUsjLayoutBlocksForChapter(viewModel.usj, viewModel, 1)
    const shown = collectVerseDisplayInline(blocks, 1, 8)
      .filter((i) => i.kind === 'token')
      .map((i) => (i.kind === 'token' ? i.token.content : ''))
    expect(shown).toEqual(VERSE)
  })
})
