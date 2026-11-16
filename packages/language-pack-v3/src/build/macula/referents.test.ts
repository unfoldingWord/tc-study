import { describe, expect, test } from 'bun:test'
import type { Event, OrigWord, Piece } from '../../model'
import { buildMaculaReferents, maculaReferentIssues, referentKey, strongNumber } from './referents'

type W = [form: string, strong: string]

/**
 * A book from `{chapter: {verse: [[form, strong], ...]}}`: its words, pieces and events. The verses are synthetic: they have the
 * forms and the Strongs of the verses they are named after (the real Ruth and Titus MACULA parts are not in the package), not
 * the whole verse.
 */
function book(chapters: Record<number, Record<number, W[]>>): { words: OrigWord[]; pieces: Piece[]; events: Event[] } {
  const words: OrigWord[] = []
  const pieces: Piece[] = []
  const events: Event[] = []
  for (const [chapter, verses] of Object.entries(chapters)) {
    events.push([pieces.length, 'chapter', chapter])
    for (const [verse, list] of Object.entries(verses)) {
      events.push([pieces.length, 'verse', verse])
      for (const [form, strong] of list) {
        words.push({ form, lemma: '', strong, morph: '' })
        pieces.push([form, true], [' ', false])
      }
    }
  }
  return { words, pieces, events }
}

const build = (b: ReturnType<typeof book>, published: unknown) => buildMaculaReferents(published, b.words, b.pieces, b.events)

describe('referentKey (Taller: src/domain/referents.ts)', () => {
  test('letters only: no marks, lowercase, final sigma as sigma', () => {
    expect(referentKey('Λόγος')).toBe('λογοσ')
    expect(referentKey('λόγος')).toBe('λογοσ')
    expect(referentKey('וַיֹּאמֶר')).toBe('ויאמר')
    expect(referentKey('הִנֵּה־בֹעַז')).toBe('הנהבעז')
    expect(referentKey('Ἰησοῦς,')).toBe('ιησουσ')
    expect(referentKey('·;')).toBe('')
  })
  test('strongNumber: letter and digits, no suffix, Greek four digits', () => {
    expect(strongNumber('b:H4999')).toBe('H4999')
    expect(strongNumber('H7462b')).toBe('H7462')
    expect(strongNumber('H0085')).toBe('H85')
    expect(strongNumber('G54850')).toBe('G5485')
    expect(strongNumber('G5485')).toBe('G5485')
    expect(strongNumber('')).toBe('')
  })
})

describe('buildMaculaReferents', () => {
  // Ruth 2:2 names Ruth (H7327); in 2:3 "and she went" (the Hebrew verb, key ותלך) has her as its subject left unsaid.
  const ruth = book({
    2: {
      2: [['וַתֹּאמֶר', 'H0559'], ['רוּת', 'H7327'], ['הַמּוֹאֲבִיָּה', 'H4125'], ['אֶל', 'H0413'], ['נָעֳמִי', 'H5281']],
      3: [['וַתֵּלֶךְ', 'H1980'], ['וַתָּבוֹא', 'H0935'], ['וַתְּלַקֵּט', 'H3950'], ['בַּשָּׂדֶה', 'H7704']],
      4: [['וְהִנֵּה', 'H2009'], ['בֹעַז', 'H1162'], ['בָּא', 'H0935'], ['מִבֵּית', 'H1004'], ['לֶחֶם', 'H3899'], ['וַיֹּאמֶר', 'H0559'], ['לַקּוֹצְרִים', 'H7114']],
    },
  })

  test('Ruth 2:3: she refers to Ruth in 2:2, and ante is the word of Ruth in 2:2', () => {
    const published = {
      words: [['רוּת', 'H7327']],
      verses: { '2:3': [[referentKey('וַתֵּלֶךְ'), 0, [['s', '', 2, 2, 0]]]] },
    }
    const { referents, counts } = build(ruth, published)
    expect(referents.word).toEqual([5])
    expect(referents.ents).toEqual([['רוּת', 'H7327']])
    expect([referents.ch, referents.vs, referents.ante]).toEqual([[2], [2], [2]])
    expect(referents.ante[0] - 1).toBe(1)
    expect(referents.kinds).toEqual(['s'])
    expect(referents.pieces).toEqual([''])
    expect(counts).toEqual({ words: 0, rows: 0, kept: 1, open: 0 })
  })

  test('Ruth 2:4: 0, 0 is the verse of the referring word; and its antecedent is in that verse', () => {
    const published = {
      words: [['בֹעַז', 'H1162']],
      verses: { '2:4': [[referentKey('וַיֹּאמֶר'), 0, [['s', '', 0, 0, 0]]]] },
    }
    const { referents } = build(ruth, published)
    expect(referents.word).toEqual([14])
    expect([referents.ch[0], referents.vs[0]]).toEqual([2, 4])
    expect(referents.ante[0]).toBe(10 + 1)
  })

  test('x, y other than 0, 0: the verse is the one named, even in another chapter', () => {
    const b = book({ 1: { 1: [['α', 'G1'], ['Παῦλος', 'G39720']] }, 2: { 1: [['λέγει', 'G30040']] } })
    const published = { words: [['Παῦλος', 'G3972']], verses: { '2:1': [[referentKey('λέγει'), 0, [['r', '', 1, 1, 0]]]] } }
    const { referents } = build(b, published)
    expect([referents.ch[0], referents.vs[0]]).toEqual([1, 1])
    expect(referents.ante[0]).toBe(2)
    expect(referents.word[0]).toBe(2)
    expect(referents.ents).toEqual([['Παῦλος', 'G39720']])
  })

  test('Titus 1:5: two targets on one verb are two rows, in the source order, with the word once', () => {
    const tit = book({
      1: {
        5: [
          ['Τούτου', 'G37780'], ['χάριν', 'G54840'], ['ἀπέλιπόν', 'G06200'], ['σε', 'G47710'], ['ἐν', 'G17220'], ['Κρήτῃ', 'G29140'],
          ['ἵνα', 'G24430'], ['καταστήσῃς', 'G25250'], ['πρεσβυτέρους', 'G42450'],
        ],
      },
    })
    const published = {
      words: [['Παῦλος', 'G3972'], ['σύ', 'G4771']],
      verses: { '1:5': [[referentKey('ἀπέλιπόν'), 0, [['a', '', 1, 1, 0], ['p', '', 0, 0, 1]]]] },
    }
    const { referents } = build(tit, published)
    expect(referents.word).toEqual([2, 2])
    expect(referents.kind.map((k) => referents.kinds[k])).toEqual(['a', 'p'])
    expect(referents.ents).toEqual([['Παῦλος', 'G39720'], ['σύ', 'G47710']])
    expect(referents.ch).toEqual([1, 1])
    // Paul is not in 1:1 of this book (no such verse): no antecedent; σύ is in 1:5 by its Strong.
    expect(referents.ante).toEqual([0, 4])
  })

  test('a verse with two words of the entity Strong: no ante unless one form fits', () => {
    const b = book({ 1: { 1: [['λέγει', 'G30040'], ['αὐτοῦ', 'G8460'], ['ἄνθρωπος', 'G04440'], ['ἀνθρώπου', 'G04440']] } })
    const two = { words: [['ἄνθρωπε', 'G444']], verses: { '1:1': [[referentKey('λέγει'), 0, [['r', '', 0, 0, 0]]]] } }
    expect(build(b, two).referents.ante).toEqual([0])
    expect(build(b, two).counts.open).toBe(1)
    const same = book({ 1: { 1: [['λέγει', 'G30040'], ['ἄνθρωπος', 'G04440'], ['θεός', 'G04440']] } })
    // Both have the Strong; only the first has a key that contains the entity's.
    const fits = { words: [['ἄνθρωπος', 'G444']], verses: { '1:1': [[referentKey('λέγει'), 0, [['r', '', 0, 0, 0]]]] } }
    expect(build(same, fits).referents.ante).toEqual([2])
    // Both fit: still none.
    const both = { words: [['ἀνθρώπ', 'G444']], verses: { '1:1': [[referentKey('λέγει'), 0, [['r', '', 0, 0, 0]]]] } }
    expect(build(b, both).referents.ante).toEqual([0])
  })

  test('the second of two words with the same key is found by its occurrence', () => {
    const b = book({ 1: { 1: [['καὶ', 'G25320'], ['Ἰησοῦς', 'G24240'], ['καί', 'G25320'], ['λέγει', 'G30040']] } })
    const published = { words: [['Ἰησοῦς', 'G2424']], verses: { '1:1': [[referentKey('καὶ'), 1, [['r', '', 0, 0, 0]]]] } }
    expect(build(b, published).referents.word).toEqual([2])
  })

  test('an unknown key (or an occurrence past the last) is dropped and counted; nothing is guessed', () => {
    const published = {
      words: [['רוּת', 'H7327']],
      verses: {
        '2:3': [[referentKey('אחר'), 0, [['r', '', 2, 2, 0], ['s', '', 2, 2, 0]]], [referentKey('וַתֵּלֶךְ'), 1, [['s', '', 2, 2, 0]]]],
        '9:9': [[referentKey('וַתֵּלֶךְ'), 0, [['s', '', 2, 2, 0]]]],
      },
    }
    const { referents, counts } = build(ruth, published)
    expect(referents.word).toEqual([])
    expect(referents.ents).toEqual([])
    expect(counts).toEqual({ words: 3, rows: 4, kept: 0, open: 0 })
    expect(maculaReferentIssues(counts)).toEqual(['MACULA referents: 3 referring word(s) not found in their verse, with 4 reference(s): left out'])
  })

  test('rows go by word position and then source order; tables most used first; open rows are reported', () => {
    const published = {
      words: [['רוּת', 'H7327'], ['בֹעַז', 'H1162']],
      verses: {
        '2:4': [[referentKey('וַיֹּאמֶר'), 0, [['r', 'ו', 0, 0, 1], ['s', '', 0, 0, 1]]]],
        '2:3': [[referentKey('וַתֵּלֶךְ'), 0, [['s', '', 2, 2, 0]]]],
      },
    }
    const { referents, counts } = build(ruth, published)
    expect(referents.word).toEqual([5, 14, 14])
    expect(referents.kinds).toEqual(['s', 'r'])
    expect(referents.pieces).toEqual(['', 'ו'])
    expect(referents.ents).toEqual([['בֹעַז', 'H1162'], ['רוּת', 'H7327']])
    expect(referents.ent).toEqual([1, 0, 0])
    expect(counts).toEqual({ words: 0, rows: 0, kept: 3, open: 0 })
    expect(maculaReferentIssues({ words: 0, rows: 0, kept: 5, open: 2 })).toEqual([
      'MACULA referents: 2 of 5 reference(s) with an antecedent the rule cannot fix: ante left empty',
    ])
  })

  test('a value that is not the published shape throws', () => {
    expect(() => build(ruth, { words: [] })).toThrow()
    expect(() => build(ruth, { words: [], verses: { '2:3': [[referentKey('וַתֵּלֶךְ'), 0, [['s', '', 0, 0, 3]]]] } })).toThrow()
  })
})
