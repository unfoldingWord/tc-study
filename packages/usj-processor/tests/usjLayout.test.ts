import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  buildUsjLayoutBlocks,
  buildUsjLayoutBlocksForChapter,
  collectVerseBlockSequence,
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

function viewModelFor(usj: CachedUsjDocument, bookCode = 'JON'): UsjScriptureViewModel {
  return buildUsjViewModel({
    usj,
    alignmentMap: {},
    bookCode,
    bookName: bookCode,
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

  test('buildUsjLayoutBlocksForChapter matches full-book slice and stops early', () => {
    const usj = {
      type: 'USJ',
      version: '3.1',
      content: [
        { type: 'book', marker: 'id', content: 'TIT' },
        { type: 'chapter', marker: 'c', number: '1', sid: 'TIT 1' },
        {
          type: 'para',
          marker: 'p',
          content: [
            { type: 'verse', marker: 'v', number: '1', sid: 'TIT 1:1' },
            { type: 'char', marker: 'w', content: ['Paul'] },
          ],
        },
        { type: 'chapter', marker: 'c', number: '2', sid: 'TIT 2' },
        {
          type: 'para',
          marker: 'p',
          content: [
            { type: 'verse', marker: 'v', number: '1', sid: 'TIT 2:1' },
            { type: 'char', marker: 'w', content: ['Teach'] },
          ],
        },
      ],
    } as CachedUsjDocument
    const viewModel = viewModelFor(usj, 'TIT')
    const full = buildUsjLayoutBlocks(usj, viewModel)
    const ch1 = buildUsjLayoutBlocksForChapter(usj, viewModel, 1)
    const ch2 = buildUsjLayoutBlocksForChapter(usj, viewModel, 2)
    expect(viewModel.chapters.map((c) => c.number)).toEqual([1, 2])
    expect(ch1.length).toBeGreaterThan(0)
    expect(ch2.length).toBeGreaterThan(0)
    expect(ch1.every((b) => b.chapterNumber === 1 || b.chapterNumber === 0)).toBe(true)
    expect(ch2.every((b) => b.chapterNumber === 2)).toBe(true)
    const ch1Text = ch1
      .flatMap((b) => b.inline)
      .map((i) =>
        i.kind === 'token' ? i.token.content : i.kind === 'text' ? i.text : ''
      )
      .join('')
    const ch2Text = ch2
      .flatMap((b) => b.inline)
      .map((i) =>
        i.kind === 'token' ? i.token.content : i.kind === 'text' ? i.text : ''
      )
      .join('')
    expect(ch1Text).toContain('Paul')
    expect(ch2Text).toContain('Teach')
    expect(ch1Text).not.toContain('Teach')
    expect(full.filter((b) => b.chapterNumber === 1).length).toBe(
      ch1.filter((b) => b.chapterNumber === 1).length
    )
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

/** BSB-like Ruth 1: headings, parallel-passage `\r`, outline, footnote, xref. */
function ruthHeadingNoteUsj(): CachedUsjDocument {
  return {
    type: 'USJ',
    version: '3.1',
    content: [
      { type: 'book', marker: 'id', content: 'RUT' },
      { type: 'para', marker: 'iot', content: ['Outline'] },
      { type: 'para', marker: 'io1', content: ['Ruth’s Loyalty to Naomi'] },
      { type: 'para', marker: 'io1', content: ['The Return to Bethlehem'] },
      { type: 'para', marker: 'io1', content: ['The Line of David'] },
      { type: 'chapter', marker: 'c', number: '1', sid: 'RUT 1' },
      { type: 'para', marker: 's1', content: ['Naomi Becomes a Widow'] },
      { type: 'para', marker: 'r', content: ['(1 Timothy 5:3–16)'] },
      {
        type: 'para',
        marker: 'p',
        content: [
          { type: 'verse', marker: 'v', number: '5', sid: 'RUT 1:5' },
          { type: 'char', marker: 'w', content: ['both'] },
          ' ',
          { type: 'char', marker: 'w', content: ['Mahlon'] },
          {
            type: 'note',
            marker: 'f',
            caller: '+',
            content: [
              { type: 'char', marker: 'fr', content: ['1:5 '] },
              { type: 'char', marker: 'ft', content: ['Or Elimelech’s sons.'] },
            ],
          },
          ' ',
          { type: 'char', marker: 'w', content: ['died'] },
          '.',
        ],
      },
      { type: 'para', marker: 's1', content: ['Ruth’s Loyalty to Naomi'] },
      {
        type: 'para',
        marker: 'p',
        content: [
          { type: 'verse', marker: 'v', number: '6', sid: 'RUT 1:6' },
          { type: 'char', marker: 'w', content: ['When'] },
          ' ',
          { type: 'char', marker: 'w', content: ['Naomi'] },
          ' ',
          { type: 'char', marker: 'w', content: ['heard'] },
          {
            type: 'note',
            marker: 'x',
            caller: '+',
            content: [
              { type: 'char', marker: 'xo', content: ['1:6 '] },
              { type: 'char', marker: 'xt', content: ['Matthew 1:1–17'] },
            ],
          },
          '.',
        ],
      },
      { type: 'chapter', marker: 'c', number: '4', sid: 'RUT 4' },
      { type: 'para', marker: 's1', content: ['The Line of David'] },
      { type: 'para', marker: 'r', content: ['(Matthew 1:1–17; Luke 3:23–38)'] },
    ],
  }
}

describe('headings, footnotes, and xrefs', () => {
  test('verse-block inline excludes headings and outline, keeps punctuation and note markers', () => {
    const usj = ruthHeadingNoteUsj()
    const viewModel = rutViewModel(usj)
    const blocks = buildUsjLayoutBlocks(usj, viewModel)

    const v5 = collectVerseDisplayInline(blocks, 1, 5)
    const v5Text = plainTextFromLayoutInline(v5)
    expect(v5Text).toBe('both Mahlon died.')
    expect(v5Text).not.toContain('Naomi Becomes a Widow')
    expect(v5Text).not.toContain('1 Timothy')
    expect(v5Text).not.toContain('The Line of David')
    expect(v5Text).not.toContain('Or Elimelech')
    expect(v5.some((i) => i.kind === 'heading')).toBe(false)
    expect(v5.some((i) => i.kind === 'note' && i.text === 'Or Elimelech’s sons.')).toBe(
      true
    )
    expect(v5.some((i) => i.kind === 'text' && i.text.includes('.'))).toBe(true)

    const v6 = collectVerseDisplayInline(blocks, 1, 6)
    expect(plainTextFromLayoutInline(v6)).toBe('When Naomi heard.')
    expect(plainTextFromLayoutInline(v6)).not.toContain('Ruth’s Loyalty')
    expect(v6.some((i) => i.kind === 'xref' && i.text === 'Matthew 1:1–17')).toBe(true)
  })

  test('verse-block sequence renders each heading once in document order', () => {
    const usj = ruthHeadingNoteUsj()
    const viewModel = rutViewModel(usj)
    const all = buildUsjLayoutBlocks(usj, viewModel)
    const blocks = filterUsjLayoutBlocks(all, {
      chapters: [1],
      includeVerse: (_ch, v) => v === 5 || v === 6,
    })
    const sequence = collectVerseBlockSequence(blocks, [
      { chapter: 1, verse: 5 },
      { chapter: 1, verse: 6 },
    ])

    const headingTexts = sequence
      .filter((item) => item.kind === 'chrome')
      .flatMap((item) =>
        item.kind === 'chrome'
          ? item.block.inline
              .filter((i) => i.kind === 'heading')
              .map((i) => (i.kind === 'heading' ? i.text : ''))
          : []
      )

    expect(headingTexts.filter((t) => t === 'Naomi Becomes a Widow')).toHaveLength(1)
    expect(headingTexts.filter((t) => t === '(1 Timothy 5:3–16)')).toHaveLength(1)
    expect(headingTexts.filter((t) => t === 'Ruth’s Loyalty to Naomi')).toHaveLength(1)
    expect(headingTexts).not.toContain('The Line of David')
    expect(headingTexts).not.toContain('The Return to Bethlehem')

    const verseItems = sequence.filter((item) => item.kind === 'verse')
    expect(verseItems.map((item) => (item.kind === 'verse' ? item.verse : 0))).toEqual([
      5, 6,
    ])
    expect(
      verseItems.every(
        (item) =>
          item.kind === 'verse' &&
          !plainTextFromLayoutInline(item.displayInline).includes('Naomi Becomes a Widow')
      )
    ).toBe(true)
  })

  test('paragraph-mode range clip still hides out-of-range verses beside notes', () => {
    const usj = ruthHeadingNoteUsj()
    const viewModel = rutViewModel(usj)
    const blocks = filterUsjLayoutBlocks(buildUsjLayoutBlocks(usj, viewModel), {
      chapters: [1],
      includeVerse: (_ch, v) => v === 5,
    })
    const para = blocks.find((b) => b.marker === 'p' && b.verseNumbers.includes(5))
    expect(para).toBeTruthy()
    expect(plainTextFromLayoutInline(para!.inline)).toContain('Mahlon')
    expect(plainTextFromLayoutInline(para!.inline)).not.toContain('When')
    expect(para!.inline.some((i) => i.kind === 'note')).toBe(true)
  })
})
