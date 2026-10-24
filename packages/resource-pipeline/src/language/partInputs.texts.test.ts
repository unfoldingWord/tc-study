/**
 * partInputs (language-pack) decides from a resource's catalog type and subject which book-scoped resources are texts:
 * a text's book part reads no original, and a text's book is an input of every alignments part. The jobs decide the
 * same thing from the key (`classifyWarmResource().isScripture`): which resources are quoted against the original and
 * which are aligned to. If the two disagreed, an alignments part would miss a text it is aligned to, and keep its
 * fingerprint when that text changed.
 */

import { describe, expect, test } from 'bun:test'
import { familyOf, partInputs, type ResourceFiles } from '@bt-synergy/language-pack'
import { classifyWarmResource } from '../warm/warmResourceClass'

const UHB = 'unfoldingWord/hbo/uhb'

/** Book-scoped resources as Door43 and tc-study's catalog rows describe them (word links are `unknown` in some). */
const REAL: Array<{ key: string; type: string; subject: string }> = [
  { key: 'unfoldingWord/en/ult', type: 'scripture', subject: 'Aligned Bible' },
  { key: 'unfoldingWord/en/ust', type: 'scripture', subject: 'Aligned Bible' },
  { key: 'es-419_gl/es-419/glt', type: 'scripture', subject: 'Aligned Bible' },
  { key: 'es-419_gl/es-419/gst', type: 'scripture', subject: 'Aligned Bible' },
  { key: 'Door43-Catalog/hi/ulb', type: 'scripture', subject: 'Bible' },
  { key: 'ru_gl/ru/rlob', type: 'unknown', subject: 'Bible' },
  { key: 'unfoldingWord/en/tn', type: 'notes', subject: 'TSV Translation Notes' },
  { key: 'unfoldingWord/en/tq', type: 'questions', subject: 'TSV Translation Questions' },
  { key: 'unfoldingWord/en/twl', type: 'words-links', subject: 'TSV Translation Words Links' },
  { key: 'es-419_gl/es-419/twl', type: 'unknown', subject: 'TSV Translation Words Links' },
]

const resource = (r: { key: string; type: string; subject: string }, file: string): ResourceFiles => ({
  ...r,
  stamp: 'v1#2026-01-01T00:00:00Z',
  files: new Map([[file, `${r.key}:${file}`]]),
  books: { rut: `./${file}` },
})

describe('which resources partInputs takes for texts', () => {
  test.each(REAL.map((r) => [r.key, r] as const))('%s: the same as the jobs (classifyWarmResource)', (_: string, r: (typeof REAL)[number]) => {
    expect(familyOf(r)).toBe('book')
    const original = resource({ key: UHB, type: 'scripture', subject: 'Hebrew Old Testament' }, '08-RUT.usfm')
    const helps = resource(REAL.find((h) => h.key === 'unfoldingWord/en/tn')!, 'tn_RUT.tsv')
    const own = resource(r, `${r.key.split('/')[2]}_RUT`)
    const ctx = { resources: new Map([original, helps, own].map((x) => [x.key, x])), originalOf: () => UHB }
    const isScripture = classifyWarmResource(r.key).isScripture

    // A text's book part reads only its own book; a helps resource's reads the original's too.
    const book = partInputs({ kind: 'book', resource: r.key, book: 'rut' }, ctx)
    expect(book.files.some(([key]) => key === UHB)).toBe(!isScripture)
    // Every text of the language is an input of a helps resource's alignments (and the helps' own file, of its own).
    const aligned = partInputs({ kind: 'alignments', resource: helps.key, book: 'rut' }, ctx)
    expect(aligned.files.some(([key]) => key === r.key)).toBe(isScripture || r.key === helps.key)
  })
})
