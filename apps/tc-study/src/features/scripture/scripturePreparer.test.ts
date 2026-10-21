import { describe, expect, test } from 'bun:test'
import {
  buildUsjLayoutBlocksForChapter,
  semanticIdFor,
  usjScriptureChapterKey,
  type UsjScriptureViewModel,
  type UsjWordToken,
} from '@bt-synergy/scripture-loader'
import { USJ_PROCESSING_VERSION } from '@bt-synergy/usj-processor'
import { semanticIdMatchKey } from '../helps/semanticIdMatchKey'
import {
  buildFullChapter,
  buildLightChapter,
  buildNavRecord,
  lightHasIdentityFields,
  plainTextFromFullBlocks,
  plainTextFromLightBlocks,
  rawSemanticIdForToken,
  resolveMatchIndices,
  SCRIPTURE_PREPARE_SCHEMA,
  SCRIPTURE_PREPARE_VERSION,
  scripturePrepareVersionFor,
  scripturePreparer,
} from './scripturePreparer'

function token(
  verseRef: string,
  content: string,
  occurrence: number,
  aligned: string[] = []
): UsjWordToken {
  return {
    semanticId: semanticIdFor(verseRef, content, occurrence),
    content,
    occurrence,
    totalOccurrences: 1,
    verseRef,
    alignedOriginalWordIds: aligned,
  }
}

function miniViewModel(): UsjScriptureViewModel {
  const verseRef = 'tit 1:1'
  const alignedOl = semanticIdFor(verseRef, 'Παῦλος', 1)
  const t1 = token(verseRef, 'Paul', 1, [alignedOl])
  const t2 = token(verseRef, 'a', 1)
  return {
    bookCode: 'tit',
    bookName: 'Titus',
    processingVersion: '2.1.0-usj',
    toolVersions: { parser: '0.1.1', usjCore: '0.1.1' },
    usj: {
      type: 'USJ',
      version: '3.0',
      content: [
        { type: 'book', marker: 'id', code: 'TIT' },
        { type: 'chapter', marker: 'c', number: '1', sid: 'TIT 1' },
        {
          type: 'para',
          marker: 'p',
          content: [
            { type: 'verse', marker: 'v', number: '1', sid: 'TIT 1:1' },
            {
              type: 'char',
              marker: 'w',
              content: ['Paul'],
            },
            ' ',
            {
              type: 'char',
              marker: 'w',
              content: ['a'],
            },
          ],
        },
      ],
    },
    chapters: [
      {
        number: 1,
        verses: [
          {
            number: 1,
            reference: verseRef,
            text: 'Paul a',
            tokens: [t1, t2],
          },
        ],
      },
    ],
    alignmentMap: {},
  }
}

describe('scripturePreparer', () => {
  test('prepare version embeds USJ_PROCESSING_VERSION so derivatives invalidate with SoT', () => {
    expect(SCRIPTURE_PREPARE_VERSION).toBe(scripturePrepareVersionFor(USJ_PROCESSING_VERSION))
    expect(SCRIPTURE_PREPARE_VERSION).toBeGreaterThanOrEqual(SCRIPTURE_PREPARE_SCHEMA * 1_000_000)
    const v210 = scripturePrepareVersionFor('2.1.0-usj')
    const v200 = scripturePrepareVersionFor('2.0.0-usj')
    expect(v210).not.toBe(v200)
    expect(v210).toBe(SCRIPTURE_PREPARE_SCHEMA * 1_000_000 + 210)
    expect(v200).toBe(SCRIPTURE_PREPARE_SCHEMA * 1_000_000 + 200)
  })

  test('nav record lists chapters and verse counts', () => {
    const vm = miniViewModel()
    const nav = buildNavRecord(vm)
    expect(nav.version).toBe(SCRIPTURE_PREPARE_VERSION)
    expect(nav.bookId).toBe('tit')
    expect(nav.chapters).toEqual([{ number: 1, verseCount: 1 }])
  })

  test('light and full agree on plain text; light has no identity fields', () => {
    const vm = miniViewModel()
    const light = buildLightChapter(vm, 1)
    const full = buildFullChapter(vm, 1)
    expect(plainTextFromLightBlocks(light.blocks).replace(/\s+/g, '')).toBe(
      plainTextFromFullBlocks(full.blocks).replace(/\s+/g, '')
    )
    expect(plainTextFromLightBlocks(light.blocks)).toContain('Paul a')
    expect(plainTextFromLightBlocks(light.blocks)).not.toContain('Paula')
    const hasVerse = light.blocks.some((b) =>
      b.inline.some((i) => i.kind === 'verse' && i.verseNumber === 1)
    )
    expect(hasVerse).toBe(true)
    expect(lightHasIdentityFields(light.blocks)).toBe(false)
    expect(full.matchKeys.length).toBeGreaterThan(0)
  })

  test('interned token k maps to folded semanticId; raw id reconstructs', () => {
    const vm = miniViewModel()
    const full = buildFullChapter(vm, 1)
    const tok = full.blocks
      .flatMap((b) => b.inline)
      .find((i) => i.kind === 'token' && i.token.c === 'Paul')
    expect(tok?.kind).toBe('token')
    if (tok?.kind !== 'token') return
    const folded = full.matchKeys[tok.token.k]
    expect(folded).toBe(semanticIdMatchKey(semanticIdFor('tit 1:1', 'Paul', 1)))
    expect(rawSemanticIdForToken('tit 1:1', tok.token)).toBe(
      semanticIdFor('tit 1:1', 'Paul', 1)
    )
    expect(tok.token.a?.length).toBe(1)
    const alignedFolded = full.matchKeys[tok.token.a![0]!]
    expect(alignedFolded).toBe(
      semanticIdMatchKey(semanticIdFor('tit 1:1', 'Παῦλος', 1))
    )
  })

  test('resolveMatchIndices maps folded ids present in chapter only', () => {
    const vm = miniViewModel()
    const full = buildFullChapter(vm, 1)
    const paul = semanticIdMatchKey(semanticIdFor('tit 1:1', 'Paul', 1))
    const missing = semanticIdMatchKey(semanticIdFor('tit 1:2', 'missing', 1))
    const set = resolveMatchIndices(full.matchKeys, [paul, missing])
    expect(set.size).toBe(1)
    expect(set.has(full.matchKeys.indexOf(paul))).toBe(true)
  })

  test('integer matching agrees with string comparison for underline', () => {
    const vm = miniViewModel()
    const full = buildFullChapter(vm, 1)
    const olFolded = semanticIdMatchKey(semanticIdFor('tit 1:1', 'Παῦλος', 1))
    const underlineStrings = new Set([olFolded])
    const underlineInts = resolveMatchIndices(full.matchKeys, underlineStrings)

    for (const block of full.blocks) {
      for (const item of block.inline) {
        if (item.kind !== 'token') continue
        const stringHit =
          underlineStrings.has(full.matchKeys[item.token.k]!) ||
          (item.token.a ?? []).some((i) =>
            underlineStrings.has(full.matchKeys[i]!)
          )
        const intHit =
          underlineInts.has(item.token.k) ||
          (item.token.a ?? []).some((i) => underlineInts.has(i))
        expect(intHit).toBe(stringHit)
      }
    }
  })

  test('records byte sizes for light vs full (informational)', () => {
    const vm = miniViewModel()
    // Expand to look more like a real chapter for size comparison.
    const layout = buildUsjLayoutBlocksForChapter(vm.usj, vm, 1)
    expect(layout.length).toBeGreaterThanOrEqual(0)
    const light = buildLightChapter(vm, 1)
    const full = buildFullChapter(vm, 1)
    const lightBytes = JSON.stringify(light).length
    const fullBytes = JSON.stringify(full).length
    // Full carries matchKeys + token indices; for a tiny chapter full may be
    // larger. Document both sizes so Stage 2 measurements are explicit.
    expect(lightBytes).toBeGreaterThan(0)
    expect(fullBytes).toBeGreaterThan(0)
    // eslint-disable-next-line no-console
    console.log(
      `[scripturePreparer] tit 1 light=${lightBytes}B full=${fullBytes}B matchKeys=${full.matchKeys.length}`
    )
  })

  test('readSource({ chapter: 119 }) issues one chapter get', async () => {
    const resourceKey = 'unfoldingWord/en/ult'
    const chapterKey = usjScriptureChapterKey(resourceKey, 'psa', 119)
    const gets: string[] = []
    const cacheAdapter = {
      async get(key: string) {
        gets.push(key)
        if (key !== chapterKey) return null
        return {
          content: {
            book: 'Psalms',
            bookCode: 'psa',
            metadata: { version: '2.1.0-usj' },
            usj: { type: 'USJ', version: '3.0', content: [] },
            chapters: [{ number: 119, content: [] }],
          },
        }
      },
      async set() {},
    }
    await scripturePreparer.readSource(
      { cacheAdapter, chapter: 119 },
      resourceKey,
      'psa'
    )
    expect(gets).toEqual([chapterKey])
  })
})
