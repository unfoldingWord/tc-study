import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { loadComplement, type NumbersComplement } from './complements'
import type { Decision } from './decision'
import { buildLexicon } from './lexicon'
import { phrasesFor } from './phrases'
import { EN, ES, fixtureMaps } from './rules.fixture'
import { fold } from './fold'
import { applyRules, looksLikeRef, readQuestion, type RuleCtx } from './rules'

const numbers = (lang: string): NumbersComplement => {
  const r = loadComplement(new Uint8Array(readFileSync(join(import.meta.dir, `../complements/${lang}.numbers.json`))))
  if (!r.ok || r.value.kind !== 'numbers') throw new Error('numbers')
  return r.value
}
const KEYS: Record<string, string[]> = { 'tw:kt/grace': ['H2580', 'G54850', 'H2587', 'G54851'], 'tw:kt/covenant': ['H1285'], 'tw:kt/sin': [] }

function rig(tag: 'es-419' | 'en' | 'pt-BR', listed: string[] = ['jhn', 'rut', 'tit', 'exo']) {
  const lexicon = buildLexicon(tag === 'en' ? EN : ES, tag, numbers(tag.slice(0, 2)))
  const ctx: RuleCtx = {
    phrases: phrasesFor(tag),
    listed: (c) => listed.includes(c),
    lastVerse: (c, ch) => (c === 'exo' && ch === 7 ? 25 : c === 'tit' && ch === 3 ? 15 : undefined),
    strongsOf: (id) => KEYS[id] ?? [],
    tag,
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
  test('"in its context", "background for" and their es and pt forms ask for the context', () => {
    const pt = rig('pt-BR')
    const ctx = { query: 'context', args: { ref: 'tit 1:12' } }
    expect(callOf(es('Tito 1:12 en su contexto'))).toEqual(ctx)
    expect(callOf(es('el contexto de Tito 1:12'))).toEqual(ctx)
    expect(callOf(en('Titus 1:12 in its context'))).toEqual(ctx)
    expect(callOf(en('background for Titus 1:12'))).toEqual(ctx)
    expect(callOf(pt('Tito 1:12 no seu contexto'))).toEqual(ctx)
    expect(callOf(pt('contexto de Tito 1:12'))).toEqual(ctx)
    expect(callOf(en('Titus 1:12'))).toEqual({ query: 'passage', args: { ref: 'tit 1:12' } })
  })
})

describe('2. an ambiguous book name alone (Review Focus 1)', () => {
  test('«Juan» offers the book introduction when listed, then each person, tW names first', () => {
    const want = choose(
      { query: 'passage', args: { ref: 'jhn front:intro' } },
      { query: 'concept', args: { id: 'tw:names/johntheapostle' } },
      { query: 'concept', args: { id: 'tw:names/johnthebaptist' } },
    )
    expect(es('Juan')).toEqual(want)
    expect(en('John')).toEqual(want)
  })
  test('without the book in the catalogs, the persons only', () => {
    expect(rig('es-419', [])('háblame de Rut')).toEqual(ruled({ query: 'concept', args: { id: 'tw:names/ruth' } }))
    expect(rig('en', [])('John')).toEqual(
      choose({ query: 'concept', args: { id: 'tw:names/johntheapostle' } }, { query: 'concept', args: { id: 'tw:names/johnthebaptist' } }),
    )
  })
  test('«Juan 3:16» is a passage; «¿quién era Juan el bautista?» is the concept', () => {
    expect(callOf(es('Juan 3:16'))).toEqual({ query: 'passage', args: { ref: 'jhn 3:16' } })
    expect(callOf(es('¿quién era Juan el bautista?'))).toEqual({ query: 'concept', args: { id: 'tw:names/johnthebaptist' } })
    expect(callOf(en('who was John the Baptist?'))).toEqual({ query: 'concept', args: { id: 'tw:names/johnthebaptist' } })
  })
})

describe('3. where something appears', () => {
  test('a Strong key, a concept or an article', () => {
    expect(callOf(es('¿Dónde aparece G5485?'))).toEqual({ query: 'books', args: { strong: 'G5485' } })
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
    const q = '¿Cómo se traduce pecado?'
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

describe('ask or search instead of guessing', () => {
  test('a chapter and verse of a book the map does not name is searched (R26)', () => {
    for (const q of ['Quiero ver Mateo 8:28', 'notas de Filipenses 4:13', 'Lucas capítulo 15 versículo 11', 'Génesis 12, versículo 1']) {
      expect(es(q)).toEqual(ruled({ query: 'search', args: { text: q } }))
    }
  })
  test('count, place and relation words alone are no books or renderings phrase', () => {
    expect(es('¿Cuántos hijos tuvo Moisés?')).toBeUndefined()
    expect(en('Where is Moses?')).toBeUndefined()
    expect(callOf(en('How is Ruth related to Moses?'))?.query).not.toBe('renderings')
    expect(es('compara la gracia y el pacto')).toBeUndefined()
  })
})

describe('Review Focus 4: one chapter however it is written', () => {
  test.each(['ÉXODO 7', 'exodo 7', '¿Éx. 7?', 'Exodo capítulo siete'])('%s', (q) => {
    expect(callOf(es(q))).toEqual({ query: 'passage', args: { ref: 'exo 7:1-25' } })
  })
})

describe('R37 e: a concept that is also a topic', () => {
  const rigOf = (tag: 'es-419' | 'en', names: Record<string, string[]>, topics: Record<string, string>) => {
    const lexicon = buildLexicon(fixtureMaps(tag, {}, names, topics), tag, numbers(tag.slice(0, 2)))
    const ctx: RuleCtx = { phrases: phrasesFor(tag), listed: () => false, lastVerse: () => undefined, strongsOf: () => [] }
    return (q: string) => {
      const r = applyRules(q, readQuestion(q, lexicon, ctx.phrases), ctx)
      return 'decided' in r ? r.decided : undefined
    }
  }
  test('asks about the article, not a choice with the topic', () => {
    const en2 = rigOf('en', { 'tw:kt/goodnews': ['good news', 'gospel'], 'tw:kt/apostle': ['apostle'] }, { 'sec:2co/5.11-6.2': 'gospel', 'sec:act/1.12-26': 'apostle' })
    const es2 = rigOf('es-419', { 'tw:kt/apostle': ['apóstol'], 'tw:kt/goodnews': ['evangelio'] }, { 'sec:act/1.12-26': 'apóstol', 'sec:mrk/1.1-8': 'evangelio' })
    expect(en2('what does gospel mean')).toEqual(ruled({ query: 'concept', args: { id: 'tw:kt/goodnews' } }))
    expect(en2('what is an apostle')).toEqual(ruled({ query: 'concept', args: { id: 'tw:kt/apostle' } }))
    expect(es2('¿qué es un apóstol?')).toEqual(ruled({ query: 'concept', args: { id: 'tw:kt/apostle' } }))
    expect(es2('qué significa evangelio')).toEqual(ruled({ query: 'concept', args: { id: 'tw:kt/goodnews' } }))
    // A topic alone is still the topic.
    const en3 = rigOf('en', {}, { 'sec:act/1.12-26': 'apostle' })
    expect(en3('what is an apostle')).toEqual(ruled({ query: 'concept', args: { id: 'sec:act/1.12-26' } }))
  })
})

test('R37 e: a tW name that is part of a title gives way to the tW article whose name it is', () => {
  const lexicon = buildLexicon(fixtureMaps('es-419', {}, { 'tw:kt/apostle': ['apóstol'], 'tw:names/philiptheapostle': ['Felipe, el apóstol'] }, {}), 'es-419', numbers('es'))
  const ctx: RuleCtx = { phrases: phrasesFor('es-419'), listed: () => false, lastVerse: () => undefined, strongsOf: () => [] }
  const ask = (q: string) => applyRules(q, readQuestion(q, lexicon, ctx.phrases), ctx)
  expect(ask('¿qué es un apóstol?')).toEqual({ decided: ruled({ query: 'concept', args: { id: 'tw:kt/apostle' } }) })
  expect(ask('quién fue Felipe')).toEqual({ decided: ruled({ query: 'concept', args: { id: 'tw:names/philiptheapostle' } }) })
  // The same title split by the maps into two names, as the es-419 map holds it.
  const split = buildLexicon(fixtureMaps('es-419', {}, { 'tw:kt/apostle': ['apóstol', 'apostolado'], 'tw:names/philiptheapostle': ['Felipe', 'el apóstol'] }, {}), 'es-419', numbers('es'))
  expect(applyRules('¿qué es un apóstol?', readQuestion('¿qué es un apóstol?', split, ctx.phrases), ctx)).toEqual({ decided: ruled({ query: 'concept', args: { id: 'tw:kt/apostle' } }) })
  // With no whole name, the part still counts.
  const only = buildLexicon(fixtureMaps('es-419', {}, { 'tw:names/philiptheapostle': ['Felipe, el apóstol'] }, {}), 'es-419', numbers('es'))
  expect(applyRules('el apóstol', readQuestion('el apóstol', only, ctx.phrases), ctx)).toEqual({ undecided: true })
  expect(only.entities('el apóstol').entities).toEqual([{ kind: 'concept', ids: ['tw:names/philiptheapostle'], cls: 'name', start: 1, end: 2 }])
})

describe('C2.1: an ambiguous name with more words (Review Focus 1)', () => {
  test('a book name that is also a person, with other content words, is not decided by the ambiguous-name rule', () => {
    for (const q of ['la planta de Juan', 'Rut y la cosecha de cebada', 'el perro grande de Juan']) expect(es(q)).toBeUndefined()
    expect(en('the plant of John')).toBeUndefined()
  })
  test('the name alone, or with phrase and stop words only, still is', () => {
    expect(es('Juan')?.kind).toBe('choose')
    expect(es('¿quién era Juan?')?.kind).toBe('choose')
    expect(callOf(rig('es-419', [])('háblame de Rut'))).toEqual({ query: 'concept', args: { id: 'tw:names/ruth' } })
  })
})

describe('C2.1: several named concepts follow their position (rules 7 and 3)', () => {
  test('a concept phrase with several concepts offers each, in the order of the question', () => {
    const c = (id: string) => ({ query: 'concept', args: { id } })
    expect(es('¿qué es el pecado de Moisés?')).toEqual(choose(c('tw:kt/sin'), c('tw:names/moses')))
    expect(es('¿qué es Moisés y el pecado?')).toEqual(choose(c('tw:names/moses'), c('tw:kt/sin')))
    expect(es('¿qué es el pacto, la gracia, la fe y el pecado?')).toEqual(choose(c('tw:kt/covenant'), c('tw:kt/grace'), c('tw:kt/faith')))
  })
  test('a topic-only concept gives way to a tW, tA or name concept in the same question', () => {
    const lexicon = buildLexicon(fixtureMaps('en', {}, { 'ta:translate/figs-metaphor': ['metaphors'] }, { 'lug:egypt': 'there', 'lug:gilead': 'there' }), 'en', numbers('en'))
    const ctx: RuleCtx = { phrases: phrasesFor('en'), listed: () => false, lastVerse: () => undefined, strongsOf: () => [], tag: 'en' }
    const q = 'In which books are there metaphors?'
    expect(applyRules(q, readQuestion(q, lexicon, ctx.phrases), ctx)).toEqual({ decided: ruled({ query: 'books', args: { article: 'ta:translate/figs-metaphor' } }) })
  })
  test('a books phrase with several concepts offers books for each, in order', () => {
    expect(es('¿dónde se menciona el pacto y Moisés?')).toEqual(
      choose({ query: 'books', args: { article: 'tw:kt/covenant' } }, { query: 'books', args: { article: 'tw:names/moses' } }),
    )
  })
})

describe('C2.1: rule 6 decides a list only when it is one', () => {
  test('two categories give a choice of both lists', () => {
    expect(es('lista de personas y lugares')).toEqual(
      choose({ query: 'topics', args: { category: 'person' } }, { query: 'topics', args: { category: 'place' } }),
    )
  })
  test('a category with content words that are no entity gives a choice of the list and a search', () => {
    const q = 'lista de lugares con agua dulce'
    expect(es(q)).toEqual(choose({ query: 'topics', args: { category: 'place' } }, { query: 'search', args: { text: q } }))
  })
})

describe('C2.1: a time of day is no reference', () => {
  const t = (q: string) => looksLikeRef(q, fold(q).split(' ').filter((w) => w !== ''))
  test.each(['a las 10:30 de la mañana', 'nos vemos 7:15 de la tarde', 'meet at 10:30 am', 'at 6:45 in the evening', 'às 10:30 da manhã', '9:00 pm'])('%s', (q) => {
    expect(t(q)).toBe(false)
  })
  test('a chapter and verse still is', () => {
    expect(t('Mateo 8:28')).toBe(true)
    expect(t('Lucas 10:30 de nuevo')).toBe(true)
  })
})

describe('Review Focus 3: book names once the map carries them', () => {
  const maps = fixtureMaps(
    'es-419',
    { jhn: ['El evangelio de Juan', 'Juan', 'Jn'], '1jn': ['Primera carta de Juan', '1 Juan', '1 Jn'], gen: ['Génesis', 'Génesis', 'Gn'] },
    { 'tw:names/johntheapostle': ['Juan'] },
    {},
  )
  const lexicon = buildLexicon(maps, 'es-419', numbers('es'))
  const ctx: RuleCtx = { phrases: phrasesFor('es-419'), listed: () => false, lastVerse: () => undefined, strongsOf: () => [], tag: 'es-419' }
  const ask = (q: string) => {
    const r = applyRules(q, readQuestion(q, lexicon, ctx.phrases), ctx)
    return 'decided' in r && r.decided.kind === 'call' ? r.decided.call : undefined
  }
  test('«Juan 3:16», «Jn 1:1», «1 Juan 3» and «Génesis 1» are passages, even with no book installed', () => {
    expect(ask('Juan 3:16')).toEqual({ query: 'passage', args: { ref: 'jhn 3:16' } })
    expect(ask('Jn 1:1')).toEqual({ query: 'passage', args: { ref: 'jhn 1:1' } })
    expect(ask('1 Juan 3')).toEqual({ query: 'passage', args: { ref: '1jn 3:1-999' } })
    expect(ask('Génesis 1')).toEqual({ query: 'passage', args: { ref: 'gen 1:1-999' } })
  })
})

describe('fix round 1: question words leave a plain list question a list', () => {
  test('nothing left over gives one topics call', () => {
    expect(callOf(es('¿cuáles son los personajes de Rut?'))).toEqual({ query: 'topics', args: { book: 'rut' } })
    expect(callOf(en('what places are there in Ruth'))).toEqual({ query: 'topics', args: { book: 'rut' } })
    expect(callOf(es('dame la lista de lugares por favor'))).toEqual({ query: 'topics', args: { category: 'place' } })
    const ptMaps = fixtureMaps('es-419', { rut: ['O Livro de Rute', 'Rute', 'Rt'] }, {}, {})
    const lexicon = buildLexicon(ptMaps, 'pt-BR', numbers('pt'))
    const ctx: RuleCtx = { phrases: phrasesFor('pt-BR'), listed: () => false, lastVerse: () => undefined, strongsOf: () => [], tag: 'pt-BR' }
    const q = 'quais são os personagens de Rute'
    const r = applyRules(q, readQuestion(q, lexicon, ctx.phrases), ctx)
    expect('decided' in r && r.decided.kind === 'call' ? r.decided.call : r).toEqual({ query: 'topics', args: { book: 'rut' } })
  })
  test('several concepts: the first id of each comes before the other ids', () => {
    const c = (id: string) => ({ query: 'concept', args: { id } })
    // Juan has two people; Moisés must not be crowded out of the 3 options.
    expect(es('¿quién es Juan o Moisés?')).toEqual(choose(c('tw:names/johntheapostle'), c('tw:names/moses'), c('tw:names/johnthebaptist')))
  })
})
