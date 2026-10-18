/**
 * A note's original words find the bridge text's words aligned to them as written: two words that differ only by
 * their accents are two words (Jonah 1:3 יְהוָ֑ה, יְהוָֽה, each «1 of 1» in Door43's alignments). A word aligned
 * against another edition, written another way, is still found with its marks folded.
 */

import { describe, expect, test } from 'bun:test'
import type { OptimizedToken } from '@bt-synergy/resource-parsers'
import { findAlignedTokens } from './findAlignedTokens'

const word = (id: number, text: string, aligned: string[]) =>
  ({ id, text, type: 'word', occurrence: 1, verseRef: 'jon 1:3', alignedOriginalWordIds: aligned }) as unknown as OptimizedToken

// «… Jehová … del rostro de Jehová»: the first Jehová translates יְהוָ֑ה, the second יְהוָֽה.
const tokens = [
  word(0, 'Jehová', ['jon 1:3:יְהוָ֑ה:1']),
  word(1, 'rostro', ['jon 1:3:מִ⁠לִּ⁠פְנֵ֖י:1']),
  word(2, 'Jehová', ['jon 1:3:יְהוָֽה:1']),
]
const positions = (wanted: string[]) =>
  findAlignedTokens(tokens, wanted, 'jon', 1, 3)
    .filter((t) => t.type === 'word')
    .map((t) => t.position)

describe('findAlignedTokens', () => {
  test('a word of the original finds only the words aligned to it as written', () => {
    expect(positions(['jon 1:3:מִ⁠לִּ⁠פְנֵ֖י:1', 'jon 1:3:יְהוָֽה:1'])).toEqual([1, 2])
    expect(positions(['jon 1:3:יְהוָ֑ה:1'])).toEqual([0])
  })

  test('a word aligned without its word joiner is the same word', () => {
    expect(positions(['jon 1:3:מִלִּפְנֵ֖י:1'])).toEqual([1])
  })

  test('a word no token is aligned to as written is looked for folded (another edition)', () => {
    expect(positions(['jon 1:3:מלפני:1'])).toEqual([1])
  })
})
