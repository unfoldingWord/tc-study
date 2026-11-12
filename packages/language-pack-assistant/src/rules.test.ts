import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { loadComplement, type NumbersComplement } from './complements'
import type { Decision } from './decision'
import { buildLexicon } from './lexicon'
import { phrasesFor } from './phrases'
import { EN, ES } from './rules.fixture'
import { applyRules, readQuestion, type RuleCtx } from './rules'

const numbers = (lang: string): NumbersComplement => {
  const r = loadComplement(new Uint8Array(readFileSync(join(import.meta.dir, `../complements/${lang}.numbers.json`))))
  if (!r.ok || r.value.kind !== 'numbers') throw new Error('numbers')
  return r.value
}
const KEYS: Record<string, string[]> = { 'tw:kt/grace': ['H2580', 'G54850', 'H2587', 'G54851'], 'tw:kt/covenant': ['H1285'], 'tw:kt/sin': [] }

function rig(tag: 'es-419' | 'en', listed: string[] = ['jhn', 'rut', 'tit', 'exo']) {
  const lexicon = buildLexicon(tag === 'en' ? EN : ES, tag, numbers(tag === 'en' ? 'en' : 'es'))
  const ctx: RuleCtx = {
    phrases: phrasesFor(tag),
    listed: (c) => listed.includes(c),
    lastVerse: (c, ch) => (c === 'exo' && ch === 7 ? 25 : c === 'tit' && ch === 3 ? 15 : undefined),
    strongsOf: (id) => KEYS[id] ?? [],
  }
  return (q: string): Decision | undefined => {
    const r = applyRules(q, readQuestion(q, lexicon, ctx.phrases), ctx)
    return 'decided' in r ? r.decided : undefined
  }
}
const es = rig('es-419')
const en = rig('en')
const callOf = (d: Decision | undefined) => (d?.kind === 'call' ? d.call : d)
const ruled = (call: unknown) => ({ kind: 'call', call, via: 'rule', interpretation: '' })
const choose = (...options: unknown[]) => ({ kind: 'choose', options, interpretation: '' })

describe('1. a reference', () => {
  test('a verse is a passage; a whole chapter runs to its last verse, or 999', () => {
    expect(es('Tito 2:11')).toEqual(ruled({ query: 'passage', args: { ref: 'tit 2:11' } }))
    expect(en('Titus 3')).toEqual(ruled({ query: 'passage', args: { ref: 'tit 3:1-15' } }))
    expect(callOf(es('Romanos 8'))).toEqual({ query: 'passage', args: { ref: 'rom 8:1-999' } })
  })
  test('with a context phrase it is the context', () => {
    expect(callOf(es('ayúdame a traducir Tito 2:11'))).toEqual({ query: 'context', args: { ref: 'tit 2:11' } })
    expect(callOf(en('everything about Titus 2:11'))).toEqual({ query: 'context', args: { ref: 'tit 2:11' } })
  })
})

describe('2. an ambiguous book name alone (Review Focus 1)', () => {
  test('«Juan» offers the book introduction when listed, then each person, tW names first', () => {
    const want = choose({ query: 'passage', args: { ref: 'jhn front:intro' } }, { query: 'concept', args: { id: 'tw:names/johntheapostle' } })
    expect(es('Juan')).toEqual(want)
    expect(en('John')).toEqual(want)
  })
  test('without the book in the catalogs, the persons only', () => {
    expect(rig('es-419', [])('háblame de Rut')).toEqual(ruled({ query: 'concept', args: { id: 'tw:names/ruth' } }))
    expect(rig('en', [])('John')).toEqual(ruled({ query: 'concept', args: { id: 'tw:names/johntheapostle' } }))
  })
  test('«Juan 3:16» is a passage; «¿quién era Juan el bautista?» is the concept', () => {
    expect(callOf(es('Juan 3:16'))).toEqual({ query: 'passage', args: { ref: 'jhn 3:16' } })
    expect(callOf(es('¿quién era Juan el bautista?'))).toEqual({ query: 'concept', args: { id: 'tw:names/johnthebaptist' } })
    expect(callOf(en('who was John the Baptist?'))).toEqual({ query: 'concept', args: { id: 'tw:names/johnthebaptist' } })
  })
})

describe('3. where something appears', () => {
  test('a Strong key, a concept or an article', () => {
    expect(callOf(es('¿Dónde aparece G5485?'))).toEqual({ query: 'books', args: { concept: 'G5485' } })
    expect(callOf(es('¿dónde se menciona a Moisés?'))).toEqual({ query: 'books', args: { article: 'tw:names/moses' } })
    expect(callOf(en('In which books are there metaphors?'))).toEqual({ query: 'books', args: { article: 'ta:translate/figs-metaphor' } })
    expect(callOf(en('Where does Ruth appear?'))).toEqual({ query: 'books', args: { article: 'tw:names/ruth' } })
  })
})

describe('4. how something was translated', () => {
  test('a Strong key as written, upper case', () => {
    expect(callOf(es('traducciones de h2617'))).toEqual({ query: 'renderings', args: { strong: 'H2617' } })
    expect(callOf(en('compare the renderings of G26'))).toEqual({ query: 'renderings', args: { strong: 'G26' } })
  })
  test('a concept through its keys: one, several (first 3), none', () => {
    expect(callOf(es('¿Cómo se tradujo pacto?'))).toEqual({ query: 'renderings', args: { strong: 'H1285' } })
    expect(en('How was grace translated?')).toEqual(choose(...['H2580', 'G54850', 'H2587'].map((strong) => ({ query: 'renderings', args: { strong } }))))
    const q = '¿Qué palabras usan para pecado?'
    expect(es(q)).toEqual(choose({ query: 'concept', args: { id: 'tw:kt/sin' } }, { query: 'search', args: { text: q } }))
  })
})

describe('5. an Academy article', () => {
  test('a tA name gives the article', () => {
    expect(callOf(es('¿Qué es una metáfora?'))).toEqual({ query: 'article', args: { id: 'ta:translate/figs-metaphor' } })
    expect(callOf(en('What is a metaphor?'))).toEqual({ query: 'article', args: { id: 'ta:translate/figs-metaphor' } })
  })
})

describe('6. a list', () => {
  test('a category alone, or a book with a list word', () => {
    expect(callOf(es('lista de lugares'))).toEqual({ query: 'topics', args: { category: 'place' } })
    expect(callOf(en('list of places'))).toEqual({ query: 'topics', args: { category: 'place' } })
    expect(callOf(es('¿Qué personajes aparecen en Rut?'))).toEqual({ query: 'topics', args: { book: 'rut' } })
    expect(callOf(en('What characters appear in Ruth?'))).toEqual({ query: 'topics', args: { book: 'rut' } })
    expect(callOf(es('temas principales de Romanos'))).toEqual({ query: 'topics', args: { book: 'rom' } })
  })
})

describe('7. what a concept is', () => {
  test('a concept phrase with a concept', () => {
    expect(callOf(es('¿Qué es la gracia?'))).toEqual({ query: 'concept', args: { id: 'tw:kt/grace' } })
    expect(callOf(en('Who was Moses?'))).toEqual({ query: 'concept', args: { id: 'tw:names/moses' } })
  })
})

describe('8. a search phrase', () => {
  test('search with the question as typed', () => {
    const q = '¿Dónde dice que el amor es paciente?'
    expect(es(q)).toEqual(ruled({ query: 'search', args: { text: q } }))
    const e = 'passages about the widow who gave two coins'
    expect(en(e)).toEqual(ruled({ query: 'search', args: { text: e } }))
  })
  test('nothing decided without a phrase or an entity', () => {
    expect(es('el hijo pródigo')).toBeUndefined()
  })
})

describe('general rules from the tune sets', () => {
  test('a bare book code needs digits: "deu 2" is a reference, "deu dos" is not', () => {
    expect(callOf(es('deu 2:1'))).toEqual({ query: 'passage', args: { ref: 'deu 2:1' } })
    expect(es('pasajes sobre la viuda que deu dos monedas')).toMatchObject({ call: { query: 'search' } })
  })
  test('a word of a fixed phrase is not part of a name', () => {
    expect(callOf(es('¿Quién fue Booz?'))).toEqual({ query: 'concept', args: { id: 'tw:names/boaz' } })
    expect(callOf(en('where does it say that love is patient?'))).toMatchObject({ query: 'search' })
  })
  test('a name of several words may start with a frame word', () => {
    expect(callOf(es('¿Cómo traduzco una pregunta retórica?'))).toEqual({ query: 'article', args: { id: 'ta:translate/figs-rquestion' } })
  })
  test('renderings asks about the first name or term of the question', () => {
    expect(callOf(es('¿Cómo se tradujo pacto en Rut?'))).toEqual({ query: 'renderings', args: { strong: 'H1285' } })
  })
})

describe('Review Focus 4: one chapter however it is written', () => {
  test.each(['ÉXODO 7', 'exodo 7', '¿Éx. 7?', 'Exodo capítulo siete'])('%s', (q) => {
    expect(callOf(es(q))).toEqual({ query: 'passage', args: { ref: 'exo 7:1-25' } })
  })
})
