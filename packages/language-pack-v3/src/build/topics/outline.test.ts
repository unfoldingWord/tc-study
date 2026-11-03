import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { gunzipSync } from 'node:zlib'
import { verseId } from '../../ids'
import { BUILDER_EVENTS } from './events'
import { outlineOf, sectionId } from './outline'

const DATA = [import.meta.dir, '..', '..', '..', 'spec', 'tests', 'data'].join('/')
const LENGTHS: Record<string, number> = { 'tit 1': 16, 'tit 2': 15, 'tit 3': 15, 'exo 4': 31, 'exo 12': 51, 'exo 7': 25 }
const last = (b: string, c: number) => LENGTHS[`${b} ${c}`]

function titusIntro(): string {
  const text = gunzipSync(
    readFileSync(`${DATA}/parts/111a888bb7c86bcc93a80fc63165c9494de67a6fbab44283824525f4f759caa4.part.gz`),
  ).toString('utf8')
  for (const line of text.split('\n')) {
    if (!line.startsWith('{"layer":"sot"')) continue
    const rec = JSON.parse(line) as { value: { content?: { notes?: { isIntro?: boolean; note: string }[] } } }
    const n = rec.value.content?.notes?.find((x) => x.isIntro && x.note.includes('Outline'))
    if (n) return n.note
  }
  throw new Error('no intro in the fixture')
}

describe('outlineOf', () => {
  test('English Titus intro (part A fixture)', () => {
    const issues: string[] = []
    const o = outlineOf(titusIntro(), 'tit', issues, last)
    expect(issues).toEqual([])
    expect(o).toEqual([
      { title: 'Paul instructs Titus to appoint godly leaders', from: verseId('tit', 1, 1), to: verseId('tit', 1, 16) },
      {
        title: 'Paul instructs Titus to train people to live godly lives',
        from: verseId('tit', 2, 1),
        to: verseId('tit', 3, 11),
      },
      {
        title: 'Paul ends by sharing some of his plans and sending greetings to various believers',
        from: verseId('tit', 3, 12),
        to: verseId('tit', 3, 15),
      },
    ])
  })
  test('Exodus-like synthetic intro: verses, chapters, issues, section end', () => {
    const md = [
      '# Introduction to Exodus',
      '',
      '## Outline of Exodus',
      '',
      '1. Israel in Egypt (1:1–4:31)',
      '2. The plagues (chapters 7–12)',
      '   * Hail (9:13-35)',
      '3. Nothing here',
      '4. Oddity (soon)',
      '',
      '## Other',
      '* Not mine (13:1-2)',
    ].join('\n')
    const issues: string[] = []
    const o = outlineOf(md, 'exo', issues, last)
    expect(o.map((e) => e.title)).toEqual(['Israel in Egypt', 'The plagues', 'Hail'])
    expect(o[0]).toMatchObject({ from: verseId('exo', 1, 1), to: verseId('exo', 4, 31) })
    expect(o[1]).toMatchObject({ from: 2007001, to: 2012051 })
    expect(o[2]).toMatchObject({ from: verseId('exo', 9, 13), to: verseId('exo', 9, 35) })
    expect(issues).toHaveLength(2)
  })
  test('a Spanish Esquema section is read like the English Outline (es-419 tN: "Esquema del libro de Tito")', () => {
    const issues: string[] = []
    const md = [
      '# Introducción a Tito',
      '## Parte 1',
      '### Esquema del libro de Tito',
      '1. Pablo instruye a Tito. (1:1-16)',
      '    ',
      '2. Pablo instruye al pueblo. (2:1-3:11)',
      '### ¿Quién escribió?',
      '1. No (3:1-2)',
    ].join('\n')
    const o = outlineOf(md, 'tit', issues, last)
    expect(o.map((e) => e.title)).toEqual(['Pablo instruye a Tito', 'Pablo instruye al pueblo'])
    expect(o[1]).toMatchObject({ from: verseId('tit', 2, 1), to: verseId('tit', 3, 11) })
    expect(issues).toEqual([])
  })
  test('a label after the range and half verses (10b) are read', () => {
    const issues: string[] = []
    const md = ['## Outline', '1. The first sin (2:1–15) - promise', '2. Examples (1:4–10a)'].join('\n')
    const o = outlineOf(md, 'tit', issues, last)
    expect(o.map((e) => e.title)).toEqual(['The first sin', 'Examples'])
    expect(o[1]).toMatchObject({ from: verseId('tit', 1, 4), to: verseId('tit', 1, 10) })
    expect(issues).toEqual([])
  })
  test('no Outline section is reported', () => {
    const issues: string[] = []
    expect(outlineOf('# A\n\ntext', 'exo', issues, last)).toEqual([])
    expect(issues).toHaveLength(1)
  })
})

describe('sectionId', () => {
  test('whole chapters', () => {
    expect(sectionId('exo', 2007001, 2012051, last)).toBe('sec:exo/7-12')
    expect(sectionId('tit', verseId('tit', 1, 1), verseId('tit', 1, 16), last)).toBe('sec:tit/1-1')
  })
  test('partial chapters', () => {
    expect(sectionId('tit', verseId('tit', 2, 1), verseId('tit', 3, 11), last)).toBe('sec:tit/2.1-3.11')
    expect(sectionId('exo', 2007014, 2012036, last)).toBe('sec:exo/7.14-12.36')
  })
})

describe('BUILDER_EVENTS', () => {
  test('the plagues of Egypt', () => {
    expect(BUILDER_EVENTS).toEqual([
      { id: 'ev:plagues-of-egypt', title: 'Plagues of Egypt', ranges: [[2007014, 2012036]] },
    ])
  })
})
