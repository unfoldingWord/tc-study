import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  buildUsjLayoutBlocks,
  collectVerseDisplayInline,
  filterUsjLayoutBlocks,
  indentLevelForMarker,
  plainTextFromLayoutInline,
  roleForMarker,
} from '../src/usjLayout'
import { USJProcessor } from '../src/USJProcessor'
import { buildUsjViewModel, type UsjScriptureViewModel } from '../src/usjViewModel'
import type { CachedUsjDocument } from '../src/usjCacheTypes'

/** Minimal poetry-shaped USJ (Jonah-like) with `\w` surfaces. */
function poetryUsj(): CachedUsjDocument {
  return {
    type: 'USJ',
    version: '3.1',
    content: [
      { type: 'book', marker: 'id', content: 'JON' },
      { type: 'chapter', marker: 'c', number: '2', sid: 'JON 2' },
      {
        type: 'para',
        marker: 's1',
        content: ['Jonah’s prayer'],
      },
      {
        type: 'para',
        marker: 'q1',
        content: [
          { type: 'verse', marker: 'v', number: '2', sid: 'JON 2:2' },
          { type: 'char', marker: 'w', content: ['I'] },
          ' ',
          { type: 'char', marker: 'w', content: ['called'] },
        ],
      },
      {
        type: 'para',
        marker: 'q2',
        content: [
          { type: 'char', marker: 'w', content: ['out'] },
          ' ',
          { type: 'char', marker: 'w', content: ['to'] },
          ' ',
          { type: 'char', marker: 'w', content: ['Yahweh'] },
        ],
      },
      { type: 'para', marker: 'b', content: [] },
      {
        type: 'para',
        marker: 'p',
        content: [
          { type: 'verse', marker: 'v', number: '10', sid: 'JON 2:10' },
          { type: 'char', marker: 'w', content: ['Then'] },
          ' ',
          { type: 'char', marker: 'w', content: ['Yahweh'] },
          ' ',
          { type: 'char', marker: 'w', content: ['spoke'] },
        ],
      },
    ],
  }
}

function viewModelFor(usj: CachedUsjDocument): UsjScriptureViewModel {
  return buildUsjViewModel({
    usj,
    alignmentMap: {},
    bookCode: 'JON',
    bookName: 'Jonah',
  })
}

describe('usjLayout helpers', () => {
  test('indentLevelForMarker maps poetry steps', () => {
    expect(indentLevelForMarker('p')).toBe(0)
    expect(indentLevelForMarker('q1')).toBe(1)
    expect(indentLevelForMarker('q2')).toBe(2)
    expect(indentLevelForMarker('q3')).toBe(3)
    expect(roleForMarker('s1')).toBe('heading')
    expect(roleForMarker('b')).toBe('break')
    expect(roleForMarker('q1')).toBe('para')
  })

  test('buildUsjLayoutBlocks preserves poetry structure and token semanticIds', () => {
    const usj = poetryUsj()
    const viewModel = viewModelFor(usj)
    const blocks = buildUsjLayoutBlocks(usj, viewModel)

    const markers = blocks.map((b) => b.marker)
    expect(markers).toContain('s1')
    expect(markers).toContain('q1')
    expect(markers).toContain('q2')
    expect(markers).toContain('b')
    expect(markers).toContain('p')

    const q1 = blocks.find((b) => b.marker === 'q1')!
    expect(q1.indentLevel).toBe(1)
    expect(q1.chapterNumber).toBe(2)
    expect(q1.verseNumbers).toEqual([2])

    const verseInline = q1.inline.find((i) => i.kind === 'verse')
    expect(verseInline).toEqual({ kind: 'verse', chapterNumber: 2, verseNumber: 2 })

    const tokens = q1.inline.filter((i) => i.kind === 'token')
    expect(tokens.length).toBe(2)
    expect(tokens[0]!.kind === 'token' && tokens[0]!.token.content).toBe('I')
    expect(tokens[0]!.kind === 'token' && tokens[0]!.token.semanticId).toBe(
      'JON 2:2:I:1'
    )

    const q2 = blocks.find((b) => b.marker === 'q2')!
    expect(q2.indentLevel).toBe(2)
    // Continuation poetry line: verse identity comes from tokens
    expect(q2.verseNumbers).toEqual([2])
    const q2Tokens = q2.inline.filter((i) => i.kind === 'token')
    expect(q2Tokens.map((t) => (t.kind === 'token' ? t.token.content : ''))).toEqual([
      'out',
      'to',
      'Yahweh',
    ])
    // Tokens still carry verse 2 identity from the view model queue
    expect(
      q2Tokens.every(
        (t) => t.kind === 'token' && t.token.verseRef === 'JON 2:2'
      )
    ).toBe(true)

    const prose = blocks.find((b) => b.marker === 'p')!
    expect(prose.indentLevel).toBe(0)
    expect(prose.verseNumbers).toEqual([10])
  })

  test('filterUsjLayoutBlocks respects chapter + verse window', () => {
    const usj = poetryUsj()
    const viewModel = viewModelFor(usj)
    const blocks = buildUsjLayoutBlocks(usj, viewModel)

    const verse2Only = filterUsjLayoutBlocks(blocks, {
      chapters: [2],
      includeVerse: (_ch, v) => v === 2,
    })
    // Heading + q1 + q2 (continuation) + break; prose v10 excluded
    expect(verse2Only.some((b) => b.marker === 'p' && b.verseNumbers.includes(10))).toBe(
      false
    )
    expect(verse2Only.some((b) => b.marker === 'q1')).toBe(true)
    expect(verse2Only.some((b) => b.marker === 's1')).toBe(true)

    const verse10Only = filterUsjLayoutBlocks(blocks, {
      chapters: [2],
      includeVerse: (_ch, v) => v === 10,
    })
    expect(verse10Only.some((b) => b.marker === 'p')).toBe(true)
    expect(verse10Only.some((b) => b.marker === 'q1')).toBe(false)
  })
})

/** Ruth-like prose paragraph spanning two verses (single `\p`). */
function multiVerseParagraphUsj(): CachedUsjDocument {
  return {
    type: 'USJ',
    version: '3.1',
    content: [
      { type: 'book', marker: 'id', content: 'RUT' },
      { type: 'chapter', marker: 'c', number: '1', sid: 'RUT 1' },
      {
        type: 'para',
        marker: 'p',
        content: [
          { type: 'verse', marker: 'v', number: '6', sid: 'RUT 1:6' },
          { type: 'char', marker: 'w', content: ['Then'] },
          ' ',
          { type: 'char', marker: 'w', content: ['she'] },
          ' ',
          { type: 'char', marker: 'w', content: ['arose'] },
          '.',
          { type: 'verse', marker: 'v', number: '7', sid: 'RUT 1:7' },
          ' ',
          { type: 'char', marker: 'w', content: ['So'] },
          ' ',
          { type: 'char', marker: 'w', content: ['she'] },
          ' ',
          { type: 'char', marker: 'w', content: ['went'] },
          '.',
        ],
      },
    ],
  }
}

function rutViewModel(usj: CachedUsjDocument): UsjScriptureViewModel {
  return buildUsjViewModel({
    usj,
    alignmentMap: {},
    bookCode: 'RUT',
    bookName: 'Ruth',
  })
}

describe('paragraph clip + verse-block punctuation', () => {
  test('paragraph mode + verse-range nav keeps only in-range verse text', () => {
    const usj = multiVerseParagraphUsj()
    const viewModel = rutViewModel(usj)
    const blocks = buildUsjLayoutBlocks(usj, viewModel)

    const verse6Only = filterUsjLayoutBlocks(blocks, {
      chapters: [1],
      includeVerse: (_ch, v) => v === 6,
    })
    expect(verse6Only).toHaveLength(1)
    const para = verse6Only[0]!
    expect(para.marker).toBe('p')
    expect(para.verseNumbers).toEqual([6])

    const text = plainTextFromLayoutInline(para.inline)
    expect(text).toContain('Then')
    expect(text).toContain('arose.')
    expect(text).not.toContain('So')
    expect(text).not.toContain('went')
    expect(para.inline.some((i) => i.kind === 'verse' && i.verseNumber === 7)).toBe(
      false
    )
    expect(
      para.inline.some((i) => i.kind === 'token' && i.token.content === 'So')
    ).toBe(false)
  })

  test('verse-block display inline keeps punctuation without attaching it to word surfaces', () => {
    const usj = multiVerseParagraphUsj()
    const viewModel = rutViewModel(usj)
    const blocks = buildUsjLayoutBlocks(usj, viewModel)

    const v6 = collectVerseDisplayInline(blocks, 1, 6)
    const v6Text = plainTextFromLayoutInline(v6)
    expect(v6Text).toBe('Then she arose.')
    expect(v6.some((i) => i.kind === 'text' && i.text.includes('.'))).toBe(true)
    expect(
      v6.filter((i) => i.kind === 'token').every((i) => i.kind === 'token' && !i.token.content.includes('.'))
    ).toBe(true)
    expect(v6.some((i) => i.kind === 'verse')).toBe(false)

    const v7 = collectVerseDisplayInline(blocks, 1, 7)
    expect(plainTextFromLayoutInline(v7)).toBe('So she went.')
  })

  test('ULT Titus 1:1 verse-block inline keeps commas without folding them into word tokens', async () => {
    const ult = readFileSync(join(import.meta.dir, '..', 'fixtures', 'en_ult_TIT.usfm'), 'utf8')
    const { viewModel } = await new USJProcessor().processUSFM(ult, 'TIT', 'Titus')
    const blocks = buildUsjLayoutBlocks(viewModel.usj, viewModel)
    const v1 = collectVerseDisplayInline(blocks, 1, 1)
    const text = plainTextFromLayoutInline(v1)

    expect(text).toContain('Paul,')
    expect(text).toContain('Christ,')
    expect(text).toContain('godliness,')
    expect(
      v1
        .filter((i) => i.kind === 'token')
        .every((i) => i.kind === 'token' && !i.token.content.includes(','))
    ).toBe(true)
    expect(viewModel.chapters[0]!.verses[0]!.tokens.some((t) => t.content === 'Paul,')).toBe(
      false
    )
  })
})
