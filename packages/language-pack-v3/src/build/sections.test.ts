import { describe, expect, test } from 'bun:test'
import { sha256Hex } from '../codec/sha256'
import { articlePath, assignSids, normalizeHeading, roleOf, type SectionPart, type SectionRegistry, splitSections, trigramsOf } from './sections'

/** `n` distinct words that start with `prefix`, as one text: every trigram of it is different from those of another prefix. */
const words = (prefix: string, n: number) => Array.from({ length: n }, (_, i) => `${prefix}${i}`).join(' ')
const ES = 'es-419'
const ART = 'es-419_gl/es-419/tw/kt/grace'
const sids = (sections: { sid: string }[]) => sections.map((s) => s.sid)

describe('splitSections', () => {
  test('text before the first heading, headings of several levels, and the text of each', () => {
    const md = ['Antes de todo.', '', '# Título', '', '## Uno', '', 'Texto uno.', '', '### Dos', 'Texto dos.', '', '', '#### Tres', 'Texto tres.'].join('\n')
    expect(splitSections(md)).toEqual([
      { level: 0, md: 'Antes de todo.' },
      { level: 1, title: 'Título', md: '' },
      { level: 2, title: 'Uno', md: 'Texto uno.' },
      { level: 3, title: 'Dos', md: 'Texto dos.' },
      { level: 4, title: 'Tres', md: 'Texto tres.' },
    ])
  })

  test('no part of level 0 when nothing but blank lines comes before the first heading', () => {
    expect(splitSections('\n  \n## A\ntexto')).toEqual([{ level: 2, title: 'A', md: 'texto' }])
    expect(splitSections('')).toEqual([])
    expect(splitSections('solo texto')).toEqual([{ level: 0, md: 'solo texto' }])
  })

  test('empty sections: a heading with no text, two in a row, and one at the end', () => {
    expect(splitSections('## A\n## B\n\n## C\ntexto\n## D\n')).toEqual([
      { level: 2, title: 'A', md: '' },
      { level: 2, title: 'B', md: '' },
      { level: 2, title: 'C', md: 'texto' },
      { level: 2, title: 'D', md: '' },
    ])
  })

  test('a # line inside a fenced block is text: backticks, tildes, a longer fence, an unclosed fence', () => {
    const md = [
      '## A',
      '```sh',
      '# comment, not a heading',
      '## nor this',
      '```',
      '~~~~',
      '# tilde',
      '~~~',
      '# still inside: a shorter fence does not close it',
      '~~~~~',
      '## B',
      '```',
      '# until the end',
    ].join('\n')
    const parts = splitSections(md)
    expect(parts.map((p) => p.title)).toEqual(['A', 'B'])
    expect(parts[0].md).toContain('# comment, not a heading')
    expect(parts[0].md).toContain('# still inside')
    expect(parts[1].md).toBe('```\n# until the end')
  })

  test('the closing fence needs the same character, and a backtick fence cannot have backticks in its info', () => {
    const md = ['## A', '```', '~~~', '# inside', '```', '## B', '```not a fence```', '## C'].join('\n')
    expect(splitSections(md).map((p) => p.title)).toEqual(['A', 'B', 'C'])
  })

  test('indented by 4 spaces, with no space after the hashes, or with 7 hashes: not headings', () => {
    const md = ['## A', '    # indented', '#hashtag', '####### seven', '   ### three spaces is a heading'].join('\n')
    expect(splitSections(md)).toEqual([
      { level: 2, title: 'A', md: '    # indented\n#hashtag\n####### seven' },
      { level: 3, title: 'three spaces is a heading', md: '' },
    ])
  })

  test('the title is the heading as published: emphasis and a colon stay, a closing run of # and the spaces go', () => {
    expect(splitSections('## **Definición:**  \n## Hecho ##\n##   Datos de la palabra. \n##\n## C#').map((p) => p.title)).toEqual([
      '**Definición:**',
      'Hecho',
      'Datos de la palabra.',
      undefined,
      'C#',
    ])
  })

  test('setext headings are text', () => {
    expect(splitSections('Título\n======\n\ntexto\n\nOtro\n---\n## Real')).toEqual([
      { level: 0, md: 'Título\n======\n\ntexto\n\nOtro\n---' },
      { level: 2, title: 'Real', md: '' },
    ])
  })

  test('line ends are kept inside a part, and a heading with a CR is still a heading', () => {
    expect(splitSections('## A\r\n\r\nuno\r\ndos\r\n## B\r\n')).toEqual([
      { level: 2, title: 'A', md: 'uno\r\ndos' },
      { level: 2, title: 'B', md: '' },
    ])
  })

  test('the text is not changed inside a part: spaces, a trailing space and Unicode as published', () => {
    const md = '## A\n\n  sangría  \né ñ \u00a0\n'
    expect(splitSections(md)[0].md).toBe('  sangría  \né ñ \u00a0')
  })
})

describe('roleOf', () => {
  test('the headings of tW in English', () => {
    expect(roleOf('Definition:')).toEqual({ role: 'definition', lang: 'en' })
    expect(roleOf('Facts:')).toEqual({ role: 'facts', lang: 'en' })
    expect(roleOf('Translation Suggestions:')).toEqual({ role: 'translation-suggestions', lang: 'en' })
    expect(roleOf('Translation Suggestions')).toEqual({ role: 'translation-suggestions', lang: 'en' })
    expect(roleOf('Examples from the Bible stories:')).toEqual({ role: 'examples', lang: 'en' })
    expect(roleOf('Word Data:')).toEqual({ role: 'word-data', lang: 'en' })
    expect(roleOf('Bible References:')).toEqual({ role: 'bible-references', lang: 'en' })
  })

  test('the headings of tA in English', () => {
    expect(roleOf('Description')).toEqual({ role: 'description', lang: 'en' })
    expect(roleOf('Reason This Is a Translation Issue')).toEqual({ role: 'reason', lang: 'en' })
    expect(roleOf('Reasons this is a Translation Issue:')).toEqual({ role: 'reason', lang: 'en' })
    expect(roleOf('Examples From the Bible')).toEqual({ role: 'examples', lang: 'en' })
    expect(roleOf('Examples From OBS and the Bible')).toEqual({ role: 'examples', lang: 'en' })
    expect(roleOf('Translation Strategies')).toEqual({ role: 'strategies', lang: 'en' })
    expect(roleOf('Examples of Translation Strategies Applied')).toEqual({ role: 'examples', lang: 'en' })
  })

  test('the headings of the es-419 tW, with the spellings the sample has', () => {
    for (const heading of ['Definición', 'Definición:', '**Definición**', '__Definición:__']) expect(roleOf(heading)).toEqual({ role: 'definition', lang: 'es' })
    expect(roleOf('Hechos')).toEqual({ role: 'facts', lang: 'es' })
    expect(roleOf('Sugerencias de traducción')).toEqual({ role: 'translation-suggestions', lang: 'es' })
    expect(roleOf('Sugerencias de Traducción')).toEqual({ role: 'translation-suggestions', lang: 'es' })
    expect(roleOf('Sugerencias de traducción:')).toEqual({ role: 'translation-suggestions', lang: 'es' })
    for (const heading of ['Referencias bíblicas', 'Referencias Bíblicas:', 'Referencias Biblicas:', 'Referencias bíblica:', 'Referencias biblícas']) {
      expect(roleOf(heading)).toEqual({ role: 'bible-references', lang: 'es' })
    }
    for (const heading of ['Datos de esta palabra', 'Datos de la palabra', 'Datos de la Palabra:', 'Datos de esta palabra. ', 'Dato de la palabra', 'Datos esta palabra']) {
      expect(roleOf(heading)).toEqual({ role: 'word-data', lang: 'es' })
    }
    for (const heading of ['Ejemplos de las historias bíblicas', 'Ejemplos de la historias bíblicas', 'Ejemplo de las historias bíblicas', 'Ejemplos de Historias bíblicas', 'Ejemplos de las historias bíbblicas']) {
      expect(roleOf(heading)).toEqual({ role: 'examples', lang: 'es' })
    }
  })

  test('the headings of the es-419 tA', () => {
    expect(roleOf('Descripción')).toEqual({ role: 'description', lang: 'es' })
    expect(roleOf('Descripción.')).toEqual({ role: 'description', lang: 'es' })
    expect(roleOf('Estrategias de traducción')).toEqual({ role: 'strategies', lang: 'es' })
    expect(roleOf('Estrategias de Traducción')).toEqual({ role: 'strategies', lang: 'es' })
    expect(roleOf('Ejemplos de la Biblia')).toEqual({ role: 'examples', lang: 'es' })
    expect(roleOf('Ejemplos de la OBS y de la Biblia')).toEqual({ role: 'examples', lang: 'es' })
    expect(roleOf('Ejemplos de las OBS y la Biblia')).toEqual({ role: 'examples', lang: 'es' })
    expect(roleOf('Otros ejemplos de la Biblia')).toEqual({ role: 'examples', lang: 'es' })
    expect(roleOf('Ejemplos de estrategias de traducción aplicadas')).toEqual({ role: 'examples', lang: 'es' })
    for (const heading of [
      'Razón por la que esto es un problema de traducción',
      'Razón por la que este es un problema de traducción',
      'Razones por las que esto es un problema de traducción',
      'Razones por la que este es un problema de traducción',
      'Razón por la que este es un problema para la traducción',
      'La razón es un problema de traducción',
    ]) {
      expect(roleOf(heading)).toEqual({ role: 'reason', lang: 'es' })
    }
  })

  test('the headings of tW and tA in Portuguese', () => {
    expect(roleOf('Definição')).toEqual({ role: 'definition', lang: 'pt' })
    expect(roleOf('Fatos')).toEqual({ role: 'facts', lang: 'pt' })
    expect(roleOf('Sugestões de tradução')).toEqual({ role: 'translation-suggestions', lang: 'pt' })
    expect(roleOf('Exemplos das histórias da Bíblia')).toEqual({ role: 'examples', lang: 'pt' })
    expect(roleOf('Referências bíblicas')).toEqual({ role: 'bible-references', lang: 'pt' })
    expect(roleOf('Dados da palavra:')).toEqual({ role: 'word-data', lang: 'pt' })
    expect(roleOf('Descrição')).toEqual({ role: 'description', lang: 'pt' })
    expect(roleOf('Estratégias de tradução')).toEqual({ role: 'strategies', lang: 'pt' })
    expect(roleOf('Razão pela qual isso é um problema de tradução')).toEqual({ role: 'reason', lang: 'pt' })
  })

  test('a heading no rule places is unknown, with no language', () => {
    for (const heading of ['Translation Principles', 'Un título raro', '', '   ', '**', '1\\. Creer', 'Short Title: house of God']) {
      expect(roleOf(heading)).toEqual({ role: 'unknown', lang: null })
    }
  })

  test('case, emphasis, a closing colon or period, white space and Unicode form do not matter', () => {
    expect(normalizeHeading('  **Definición:**  ')).toBe('definición')
    expect(normalizeHeading('Definición')).toBe('definición')
    expect(roleOf('DEFINICIÓN')).toEqual({ role: 'definition', lang: 'es' })
    expect(roleOf('Translation\u00a0 Suggestions .')).toEqual({ role: 'translation-suggestions', lang: 'en' })
  })
})

describe('trigramsOf', () => {
  test('fewer than 3 words has none', () => {
    expect(trigramsOf('')).toEqual([])
    expect(trigramsOf('uno dos')).toEqual([])
    expect(trigramsOf('¡uno, dos!')).toEqual([])
  })

  test('the distinct trigrams, as unsigned 32-bit numbers in order', () => {
    const t = trigramsOf('a b c a b c a b c')
    // abc, bca, cab
    expect(t).toHaveLength(3)
    expect([...t].sort((x, y) => x - y)).toEqual(t)
    for (const n of t) expect(Number.isInteger(n) && n >= 0 && n < 2 ** 32).toBe(true)
  })

  test('the number is the first 32 bits of the sha256 of the three words joined by single spaces', () => {
    const [n] = trigramsOf('uno dos tres')
    expect(n).toBe(parseInt(sha256Hex('uno dos tres').slice(0, 8), 16))
  })

  test('case, punctuation, markup and the Unicode form do not change the words', () => {
    const plain = trigramsOf('La gracia de Dios, amable')
    expect(trigramsOf('**LA** gracia — de Dios; (amable).')).toEqual(plain)
    expect(trigramsOf('un más allá')).toEqual(trigramsOf('un más allá'))
  })

  test('digits are words and an apostrophe cuts a word', () => {
    expect(trigramsOf('1 2 3')).toEqual([parseInt(sha256Hex('1 2 3').slice(0, 8), 16)])
    expect(trigramsOf("don't stop")).toEqual([parseInt(sha256Hex("don t stop").slice(0, 8), 16)])
  })
})

describe('assignSids: the cases of the spec', () => {
  const intro1 = words('intro', 12)
  const def1 = words('definicion', 20)
  const sug1 = words('sugerencia', 20)
  const ex1 = words('ejemplo', 20)

  const first: SectionPart[] = [
    { level: 0, md: intro1 },
    { level: 2, title: 'Definition', md: def1 },
    { level: 2, title: 'Sugerencias de traducción', md: sug1 },
  ]
  // The second build: an examples section before the suggestions, and the definition heading corrected.
  const second: SectionPart[] = [
    { level: 0, md: intro1 },
    { level: 2, title: 'Definición', md: def1 },
    { level: 2, title: 'Ejemplos de la Biblia', md: ex1 },
    { level: 2, title: 'Sugerencias de traducción', md: sug1 },
  ]

  test('seccion-insertada: an article built twice with the registry in between', () => {
    const one = assignSids(ART, ES, first, {})
    expect(sids(one.sections)).toEqual(['intro', 'definition', 'translation-suggestions'])
    expect(one.sections.map((s) => s.role)).toEqual(['intro', 'definition', 'translation-suggestions'])

    const two = assignSids(ART, ES, second, one.registry)
    expect(sids(two.sections)).toEqual(['intro', 'definition', 'examples', 'translation-suggestions'])
    expect(two.sections.map((s) => s.role)).toEqual(['intro', 'definition', 'examples', 'translation-suggestions'])
    // The first three are the ones of the first build, though the heading of the definition is another.
    expect(two.sections[1].title).toBe('Definición')
    expect(two.registry[ART].map((e) => e.sid)).toEqual(['intro', 'definition', 'examples', 'translation-suggestions'])
  })

  test('articulo-mal-titulado: text before any heading, a heading no rule places, and a heading in English', () => {
    const parts: SectionPart[] = [
      { level: 0, md: 'Texto antes de cualquier encabezado.' },
      { level: 2, title: 'Un título que ninguna regla ubica', md: 'Contenido del apartado.' },
      { level: 2, title: 'Definition', md: 'The term means this.' },
      { level: 2, title: 'Sugerencias de traducción', md: 'Se puede traducir así.' },
    ]
    const { sections } = assignSids(ART, ES, parts, {})
    expect(sections.map((s) => [s.sid, s.role, s.lang, s.level])).toEqual([
      ['intro', 'intro', ES, 0],
      ['s1', 'unknown', ES, 2],
      ['definition', 'definition', 'en', 2],
      ['translation-suggestions', 'translation-suggestions', ES, 2],
    ])
    // Every section is readable: its heading and text are as given.
    expect(sections[1]).toMatchObject({ title: 'Un título que ninguna regla ubica', md: 'Contenido del apartado.' })
    expect(sections[0].title).toBeUndefined()
  })

  test('a heading of the same language family keeps the article\'s language: es in es-419, es-419 in es', () => {
    expect(assignSids(ART, ES, [{ level: 2, title: 'Definición', md: 'x' }], {}).sections[0].lang).toBe(ES)
    expect(assignSids(ART, 'es', [{ level: 2, title: 'Definición', md: 'x' }], {}).sections[0].lang).toBe('es')
    expect(assignSids(ART, 'en', [{ level: 2, title: 'Definición', md: 'x' }], {}).sections[0].lang).toBe('es')
    expect(assignSids(ART, 'pt-BR', [{ level: 2, title: 'Definição', md: 'x' }], {}).sections[0].lang).toBe('pt-BR')
    expect(assignSids(ART, 'fr', [{ level: 2, title: 'Un titre', md: 'x' }], {}).sections[0].lang).toBe('fr')
  })
})

describe('assignSids: new sids', () => {
  test('a role the article has not used is the sid; a repeated one takes -2, -3', () => {
    const parts: SectionPart[] = [
      { level: 2, title: 'Ejemplos de la Biblia', md: 'a' },
      { level: 2, title: 'Ejemplos de las historias bíblicas', md: 'b' },
      { level: 2, title: 'Otros ejemplos de la Biblia', md: 'c' },
    ]
    expect(sids(assignSids(ART, ES, parts, {}).sections)).toEqual(['examples', 'examples-2', 'examples-3'])
  })

  test('unknown headings take s and the next number', () => {
    const parts: SectionPart[] = [1, 2, 3].map((n) => ({ level: 3, title: `Raro ${n}`, md: `texto ${n}` }))
    expect(sids(assignSids(ART, ES, parts, {}).sections)).toEqual(['s1', 's2', 's3'])
  })

  test('the next number counts every s sid the registry has, also those of sections that are gone', () => {
    const one = assignSids(ART, ES, [1, 2, 3].map((n) => ({ level: 3, title: `Raro ${n}`, md: `texto ${n}` })), {})
    // The second and third sections are gone; the first stays; a new one comes.
    const two = assignSids(ART, ES, [{ level: 3, title: 'Raro 1', md: 'texto 1' }, { level: 3, title: 'Nuevo', md: 'otra cosa' }], one.registry)
    expect(sids(two.sections)).toEqual(['s1', 's4'])
  })

  test('a section that took the sid of a role keeps it when its role is another', () => {
    const one = assignSids(ART, ES, [{ level: 2, title: 'Definición', md: words('a', 15) }], {})
    const two = assignSids(ART, ES, [{ level: 2, title: 'Definición', md: words('a', 15) }], one.registry)
    expect(sids(two.sections)).toEqual(['definition'])
    // The same section under a heading that is now a facts heading: recognized by its text, same sid, other role.
    const three = assignSids(ART, ES, [{ level: 2, title: 'Hechos', md: words('a', 15) }], two.registry)
    expect(three.sections[0]).toMatchObject({ sid: 'definition', role: 'facts' })
    expect(three.registry[ART][0]).toMatchObject({ sid: 'definition', role: 'facts' })
    // A new definition cannot take the sid that is in use.
    const four = assignSids(ART, ES, [{ level: 2, title: 'Hechos', md: words('a', 15) }, { level: 2, title: 'Definición', md: words('z', 15) }], three.registry)
    expect(sids(four.sections)).toEqual(['definition', 'definition-2'])
  })
})

describe('assignSids: recognizing a section', () => {
  const body = (prefix: string) => words(prefix, 20)

  test('1. by the same heading, though the text changed and the section moved', () => {
    const one = assignSids(ART, ES, [{ level: 2, title: 'Alfa', md: body('a') }, { level: 2, title: 'Beta', md: body('b') }], {})
    const two = assignSids(ART, ES, [{ level: 2, title: 'Beta', md: 'otro texto por completo' }, { level: 2, title: 'Alfa', md: 'tampoco se parece' }], one.registry)
    expect(sids(two.sections)).toEqual(['s2', 's1'])
  })

  test('1. the heading is compared normalized: case, emphasis and a closing colon do not matter', () => {
    const one = assignSids(ART, ES, [{ level: 2, title: 'Una cosa', md: 'x' }], {})
    const two = assignSids(ART, ES, [{ level: 2, title: '**Una Cosa:**', md: 'y' }], one.registry)
    expect(sids(two.sections)).toEqual(['s1'])
  })

  test('1. two sections with the same heading take the old ones in reading order', () => {
    const one = assignSids(ART, ES, [{ level: 3, title: 'Igual', md: 'a b c' }, { level: 3, title: 'Igual', md: 'd e f' }], {})
    expect(sids(one.sections)).toEqual(['s1', 's2'])
    const two = assignSids(ART, ES, [{ level: 3, title: 'Igual', md: 'd e f' }, { level: 3, title: 'Igual', md: 'a b c' }], one.registry)
    expect(sids(two.sections)).toEqual(['s1', 's2'])
    // An old section is matched at most once: a third with the same heading is new.
    const three = assignSids(ART, ES, [...two.sections.map((s) => ({ level: s.level, title: s.title, md: s.md })), { level: 3, title: 'Igual', md: 'g h i' }], two.registry)
    expect(sids(three.sections)).toEqual(['s1', 's2', 's3'])
  })

  test('2. by the same role and the same place among the sections of that role', () => {
    const one = assignSids(
      ART,
      ES,
      [
        { level: 2, title: 'Ejemplos de la Biblia', md: body('a') },
        { level: 2, title: 'Ejemplos de las historias bíblicas', md: body('b') },
      ],
      {},
    )
    expect(sids(one.sections)).toEqual(['examples', 'examples-2'])
    // Both headings corrected and the text edited: the place decides.
    const two = assignSids(
      ART,
      ES,
      [
        { level: 2, title: 'Otros ejemplos de la Biblia', md: 'nada en común' },
        { level: 2, title: 'Ejemplos de la OBS y de la Biblia', md: 'ni aquí' },
      ],
      one.registry,
    )
    expect(sids(two.sections)).toEqual(['examples', 'examples-2'])
  })

  test('2. the place is among the sections of that role: a new first one does not take the first one\'s sid', () => {
    const one = assignSids(ART, ES, [{ level: 2, title: 'Ejemplos de la Biblia', md: body('a') }], {})
    const two = assignSids(
      ART,
      ES,
      [
        { level: 2, title: 'Otros ejemplos de la Biblia', md: body('n') },
        { level: 2, title: 'Ejemplos de la Biblia', md: body('a') },
      ],
      one.registry,
    )
    // The second has the old heading, so pass 1 gives it the old sid; the new one gets the next.
    expect(sids(two.sections)).toEqual(['examples-2', 'examples'])
  })

  test('2. sections of role unknown have no place', () => {
    const one = assignSids(ART, ES, [{ level: 3, title: 'Raro uno', md: body('a') }], {})
    const two = assignSids(ART, ES, [{ level: 3, title: 'Nuevo raro', md: body('n') }, { level: 3, title: 'Raro uno corregido', md: body('a') }], one.registry)
    // By its text, the second is the old one; the first is new.
    expect(sids(two.sections)).toEqual(['s2', 's1'])
  })

  test('3. by its text, when the heading and the role changed: at least half of the trigrams', () => {
    const text = body('t')
    const one = assignSids(ART, ES, [{ level: 2, title: 'Algo raro', md: text }], {})
    // 20 words are 18 trigrams. Six words changed at the end: 12 trigrams are in the old section (12 of 18 is over half).
    const mostly = `${words('t', 14)} ${words('x', 6)}`
    expect(sids(assignSids(ART, ES, [{ level: 2, title: 'Otro rótulo', md: mostly }], one.registry).sections)).toEqual(['s1'])
    // Twelve words changed: 6 trigrams in common (6 of 18 is under half), so it is a new section.
    const less =`${words('t', 8)} ${words('x', 12)}`
    expect(sids(assignSids(ART, ES, [{ level: 2, title: 'Otro rótulo', md: less }], one.registry).sections)).toEqual(['s2'])
  })

  test('3. a section of fewer than 3 words has no trigrams, so the text does not match', () => {
    const one = assignSids(ART, ES, [{ level: 3, title: 'Corto', md: 'dos palabras' }], {})
    const two = assignSids(ART, ES, [{ level: 3, title: 'Otro', md: 'dos palabras' }], one.registry)
    expect(sids(two.sections)).toEqual(['s2'])
  })

  test('3. the old section with the most trigrams in common wins; a tie goes to the first', () => {
    const a = words('a', 20)
    const one = assignSids(ART, ES, [{ level: 3, title: 'Uno', md: `${a} ${words('p', 10)}` }, { level: 3, title: 'Dos', md: a }], {})
    // The new text is the second old text plus nothing: it has all its trigrams in "Dos" and 18 of 18 in "Uno" too (it is inside it).
    const two = assignSids(ART, ES, [{ level: 3, title: 'Tres', md: a }], one.registry)
    expect(sids(two.sections)).toEqual(['s1'])
    const same = assignSids(ART, ES, [{ level: 3, title: 'X', md: a }, { level: 3, title: 'Y', md: a }], assignSids(ART, ES, [{ level: 3, title: 'P', md: a }, { level: 3, title: 'Q', md: a }], {}).registry)
    expect(sids(same.sections)).toEqual(['s1', 's2'])
  })

  test('the passes are over all sections: a text match does not take a section another matches by heading', () => {
    const text = body('t')
    const one = assignSids(ART, ES, [{ level: 3, title: 'Uno', md: text }, { level: 3, title: 'Dos', md: body('d') }], {})
    // "Nuevo" comes first and has the text of "Uno", but "Uno" is matched by heading by the second.
    const two = assignSids(ART, ES, [{ level: 3, title: 'Nuevo', md: text }, { level: 3, title: 'Uno', md: text }], one.registry)
    expect(sids(two.sections)).toEqual(['s3', 's1'])
  })

  test('a deleted section\'s entry disappears from the new registry, and its sid is not reused in that build', () => {
    const one = assignSids(ART, ES, [{ level: 2, title: 'Definición', md: body('d') }, { level: 3, title: 'Raro', md: body('r') }], {})
    expect(one.registry[ART].map((e) => e.sid)).toEqual(['definition', 's1'])
    const two = assignSids(ART, ES, [{ level: 2, title: 'Definición', md: body('d') }], one.registry)
    expect(two.registry[ART].map((e) => e.sid)).toEqual(['definition'])
    expect(JSON.stringify(two.registry)).not.toContain('"s1"')
  })
})

describe('assignSids: splits and merges', () => {
  const a = words('a', 30)
  const b = words('b', 30)

  test('a section that splits keeps its sid in the first part', () => {
    const one = assignSids(ART, ES, [{ level: 2, title: 'Todo junto', md: `${a}\n\n${b}` }], {})
    expect(sids(one.sections)).toEqual(['s1'])
    const two = assignSids(ART, ES, [{ level: 2, title: 'Primera parte', md: a }, { level: 2, title: 'Segunda parte', md: b }], one.registry)
    expect(sids(two.sections)).toEqual(['s1', 's2'])
    expect(two.sections[0].aliases).toBeUndefined()
  })

  test('two sections that merge: the first one\'s sid, and the other as an alias', () => {
    const one = assignSids(ART, ES, [{ level: 2, title: 'Uno', md: a }, { level: 2, title: 'Dos', md: b }], {})
    expect(sids(one.sections)).toEqual(['s1', 's2'])
    const two = assignSids(ART, ES, [{ level: 2, title: 'Unidos', md: `${a}\n\n${b}` }], one.registry)
    expect(sids(two.sections)).toEqual(['s1'])
    expect(two.sections[0].aliases).toEqual(['s2'])
    expect(two.registry[ART]).toHaveLength(1)
    expect(two.registry[ART][0].aliases).toEqual(['s2'])
  })

  test('a merge where the first section is the larger one is found by the text of the new one', () => {
    const big = words('g', 60)
    const small = words('s', 12)
    const one = assignSids(ART, ES, [{ level: 2, title: 'Grande', md: big }, { level: 2, title: 'Chico', md: small }], {})
    const two = assignSids(ART, ES, [{ level: 2, title: 'Todo', md: `${big}\n\n${small}` }], one.registry)
    expect(sids(two.sections)).toEqual(['s1'])
    expect(two.sections[0].aliases).toEqual(['s2'])
  })

  test('the merged section\'s aliases last: the next build keeps them, and their sids are not reused', () => {
    const one = assignSids(ART, ES, [{ level: 2, title: 'Uno', md: a }, { level: 2, title: 'Dos', md: b }], {})
    const two = assignSids(ART, ES, [{ level: 2, title: 'Unidos', md: `${a}\n\n${b}` }], one.registry)
    const three = assignSids(ART, ES, [{ level: 2, title: 'Unidos', md: `${a}\n\n${b}` }, { level: 3, title: 'Otro raro', md: words('n', 10) }], two.registry)
    expect(three.sections[0]).toMatchObject({ sid: 's1', aliases: ['s2'] })
    expect(three.sections[1].sid).toBe('s3')
  })

  test('the merge of a section that has a text of its own and is not in the new one is not absorbed', () => {
    const one = assignSids(ART, ES, [{ level: 2, title: 'Uno', md: a }, { level: 2, title: 'Dos', md: b }], {})
    const two = assignSids(ART, ES, [{ level: 2, title: 'Uno', md: a }], one.registry)
    expect(sids(two.sections)).toEqual(['s1'])
    expect(two.sections[0].aliases).toBeUndefined()
  })
})

describe('assignSids: the registry', () => {
  const parts = (n: number): SectionPart[] => [
    { level: 0, md: words('i', 8) },
    { level: 2, title: 'Definición', md: words('d', 20) },
    { level: 2, title: n === 1 ? 'Ejemplos de la Biblia' : 'Ejemplos de las historias bíblicas', md: words('e', 20) },
    { level: 3, title: 'Un apartado raro', md: words('r', 15) },
  ]

  test('an entry has the sid, heading, level, role, the fingerprint (sha256 of the text) and the trigrams', () => {
    const { registry } = assignSids(ART, ES, parts(1), {})
    expect(registry[ART]).toHaveLength(4)
    expect(registry[ART][1]).toEqual({
      sid: 'definition',
      title: 'Definición',
      level: 2,
      role: 'definition',
      fingerprint: sha256Hex(words('d', 20)),
      trigrams: trigramsOf(words('d', 20)),
    })
    expect(registry[ART][0].title).toBeUndefined()
    expect('title' in registry[ART][0]).toBe(false)
  })

  test('the registry that goes through JSON gives the same sids and the same registry on a rebuild', () => {
    const one = assignSids(ART, ES, parts(1), {})
    const revived = JSON.parse(JSON.stringify(one.registry)) as SectionRegistry
    expect(revived).toEqual(one.registry)
    const direct = assignSids(ART, ES, parts(2), one.registry)
    const viaJson = assignSids(ART, ES, parts(2), revived)
    expect(viaJson.sections).toEqual(direct.sections)
    expect(viaJson.registry).toEqual(direct.registry)
    expect(sids(viaJson.sections)).toEqual(['intro', 'definition', 'examples', 's1'])
  })

  test('the registry given is not changed, and the other articles stay', () => {
    const other = 'es-419_gl/es-419/tw/kt/faith'
    const base = assignSids(other, ES, [{ level: 2, title: 'Definición', md: 'x' }], {}).registry
    const before = JSON.stringify(base)
    const { registry } = assignSids(ART, ES, parts(1), base)
    expect(JSON.stringify(base)).toBe(before)
    expect(Object.keys(registry)).toEqual([other, ART])
    expect(registry[other]).toEqual(base[other])
  })

  test('the same input gives the same output', () => {
    const run = () => {
      const one = assignSids(ART, ES, parts(1), {})
      return JSON.stringify([one, assignSids(ART, ES, parts(2), one.registry)])
    }
    expect(run()).toBe(run())
  })

  test('the key of an article is its resource and its id without the namespace', () => {
    expect(articlePath('es-419_gl/es-419/tw', 'tw:kt/grace')).toBe('es-419_gl/es-419/tw/kt/grace')
    expect(articlePath('es-419_gl/es-419/ta', 'ta:translate/figs-metaphor')).toBe('es-419_gl/es-419/ta/translate/figs-metaphor')
  })

  test('an article called __proto__ or constructor is an ordinary key', () => {
    const one = assignSids('constructor', ES, [{ level: 2, title: 'Definición', md: 'x' }], {})
    expect(sids(assignSids('constructor', ES, [{ level: 2, title: 'Definición', md: 'x' }], one.registry).sections)).toEqual(['definition'])
    expect(sids(assignSids('__proto__', ES, [{ level: 2, title: 'Definición', md: 'x' }], {}).sections)).toEqual(['definition'])
  })
})

describe('assignSids: a merge keeps the sid of the first old section (ids.md)', () => {
  const small = words('s', 12)
  const big = words('g', 60)

  test('the first old section is the smaller one: the merged section takes its sid, and the other becomes its alias', () => {
    const one = assignSids(ART, ES, [{ level: 2, title: 'Chico', md: small }, { level: 2, title: 'Grande', md: big }], {})
    expect(sids(one.sections)).toEqual(['s1', 's2'])
    const two = assignSids(ART, ES, [{ level: 2, title: 'Todo', md: `${small}\n\n${big}` }], one.registry)
    // The new text is mostly "Grande" (pass 3 matches it), but the first old section is "Chico".
    expect(sids(two.sections)).toEqual(['s1'])
    expect(two.sections[0].aliases).toEqual(['s2'])
    expect(two.registry[ART]).toHaveLength(1)
    expect(two.registry[ART][0]).toMatchObject({ sid: 's1', aliases: ['s2'] })
  })

  test('a section found by its heading keeps the sid it matched; the sections it absorbed become aliases', () => {
    const one = assignSids(ART, ES, [{ level: 2, title: 'Uno', md: small }, { level: 2, title: 'Dos', md: big }], {})
    const two = assignSids(ART, ES, [{ level: 2, title: 'Dos', md: `${small}\n\n${big}` }], one.registry)
    expect(sids(two.sections)).toEqual(['s2'])
    expect(two.sections[0].aliases).toEqual(['s1'])
  })

  test('the aliases of an absorbed section are not lost', () => {
    const a = words('a', 30)
    const b = words('b', 30)
    const c = words('c', 30)
    const one = assignSids(ART, ES, [{ level: 2, title: 'Uno', md: a }, { level: 2, title: 'Dos', md: b }, { level: 2, title: 'Tres', md: c }], {})
    expect(sids(one.sections)).toEqual(['s1', 's2', 's3'])
    // The second and third merge: s2 with the alias s3.
    const two = assignSids(ART, ES, [{ level: 2, title: 'Uno', md: a }, { level: 2, title: 'Unidos', md: `${b}\n\n${c}` }], one.registry)
    expect(two.sections.map((s) => [s.sid, s.aliases])).toEqual([['s1', undefined], ['s2', ['s3']]])
    // Then everything merges: s1 absorbs s2, and s3 still leads to it.
    const three = assignSids(ART, ES, [{ level: 2, title: 'Todo', md: `${a}\n\n${b}\n\n${c}` }], two.registry)
    expect(sids(three.sections)).toEqual(['s1'])
    expect(three.sections[0].aliases).toEqual(['s2', 's3'])
    expect(three.registry[ART][0].aliases).toEqual(['s2', 's3'])
  })
})

describe('the registry is canonical', () => {
  const FAITH = 'es-419_gl/es-419/tw/kt/faith'
  const parts: SectionPart[] = [{ level: 2, title: 'Definición', md: words('d', 10) }]

  test('two histories that end in the same state give the same JSON text', () => {
    const ab = assignSids(FAITH, ES, parts, assignSids(ART, ES, parts, {}).registry).registry
    const ba = assignSids(ART, ES, parts, assignSids(FAITH, ES, parts, {}).registry).registry
    expect(JSON.stringify(ab)).toBe(JSON.stringify(ba))
    expect(Object.keys(ab)).toEqual([FAITH, ART])
  })

  test('the articles are ordered by code point, not by UTF-16 code unit', () => {
    const registry = assignSids('\u{1d538}', ES, parts, assignSids('￿', ES, parts, assignSids('a', ES, parts, {}).registry).registry).registry
    expect(Object.keys(registry)).toEqual(['a', '￿', '\u{1d538}'])
  })

  test('the fields of an entry are in a fixed order, also in the entries the build did not touch', () => {
    const scrambled = { future: 1, trigrams: [1], aliases: ['x'], role: 'unknown', fingerprint: 'f', level: 3, title: 'T', sid: 's9' }
    const registry = assignSids(ART, ES, [{ level: 3, title: 'Algo', md: 'x' }], { zzz: [scrambled as never] }).registry
    expect(Object.keys(registry)).toEqual([ART, 'zzz'])
    expect(Object.keys(registry.zzz[0])).toEqual(['sid', 'title', 'level', 'role', 'fingerprint', 'trigrams', 'aliases', 'future'])
    expect(Object.keys(registry[ART][0])).toEqual(['sid', 'title', 'level', 'role', 'fingerprint', 'trigrams'])
  })

  test('an entry with aliases and no heading has the fields in the same order', () => {
    const a = words('a', 30)
    const b = words('b', 30)
    const one = assignSids(ART, ES, [{ level: 0, md: a }, { level: 2, title: 'Uno', md: b }], {})
    const two = assignSids(ART, ES, [{ level: 0, md: `${a}\n\n${b}` }], one.registry)
    expect(Object.keys(two.registry[ART][0])).toEqual(['sid', 'level', 'role', 'fingerprint', 'trigrams', 'aliases'])
  })
})
