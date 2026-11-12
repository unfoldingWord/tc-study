/** Small maps for the rule and decide tests: a few books, concepts and people in es and en. Tests only. */
import { BOOKS, type MapSet } from '@bt-synergy/language-pack-v3'

type Names = Record<string, [string, string, string]>

export function fixtureMaps(lang: 'es-419' | 'en', books: Names, names: Record<string, string[]>, topics: Record<string, string>): MapSet {
  const rows: unknown[][] = BOOKS.map(() => ['', '', '', 'none'])
  for (const [code, n] of Object.entries(books)) rows[BOOKS.indexOf(code)] = [...n, 'text']
  const topicNames = Object.fromEntries(Object.entries(topics).map(([id, n]) => [id, [[n, 'list', 1, []]]]))
  return {
    revision: 1,
    map: { core: { lang, part: 'core', res: [], books: rows, names, subtitles: {}, coverage: {} }, parts: new Map() },
    topics: { core: { names: topicNames }, parts: new Map() },
  } as unknown as MapSet
}

export const ES = fixtureMaps(
  'es-419',
  {
    tit: ['La carta de Pablo a Tito', 'Tito', 'Tit'],
    exo: ['Éxodo', 'Éxodo', 'Éx'],
    jhn: ['Juan', 'Juan', 'Jn'],
    rut: ['El Libro de Rut', 'Rut', 'Rut'],
    rom: ['Romanos', 'Romanos', 'Rom'],
  },
  {
    'tw:kt/grace': ['gracia'],
    'tw:kt/covenant': ['pacto'],
    'tw:kt/faith': ['fe'],
    'tw:kt/sin': ['pecado'],
    'tw:names/johntheapostle': ['Juan'],
    'tw:names/johnthebaptist': ['Juan el Bautista', 'Juan'],
    'tw:names/ruth': ['Rut'],
    'tw:names/moses': ['Moisés'],
    'ta:translate/figs-metaphor': ['Metáfora'],
    'ta:translate/figs-rquestion': ['Pregunta retórica'],
    'tw:names/boaz': ['Booz'],
  },
  { 'per:john': 'Juan', 'per:mark': 'Marcos', 'per:boaz': 'fue Booz' },
)

export const EN = fixtureMaps(
  'en',
  {
    tit: ["Paul's Letter to Titus", 'Titus', 'Tit'],
    exo: ['Exodus', 'Exodus', 'Exo'],
    jhn: ['John', 'John', 'Jhn'],
    rut: ['The Book of Ruth', 'Ruth', 'Rut'],
    rom: ['Romans', 'Romans', 'Rom'],
  },
  {
    'tw:kt/grace': ['grace'],
    'tw:kt/covenant': ['covenant'],
    'tw:kt/faith': ['faith'],
    'tw:kt/sin': ['sin'],
    'tw:names/johntheapostle': ['John'],
    'tw:names/johnthebaptist': ['John the Baptist', 'John'],
    'tw:names/ruth': ['Ruth'],
    'tw:names/moses': ['Moses'],
    'ta:translate/figs-metaphor': ['Metaphor'],
  },
  { 'per:john': 'John', 'per:mark': 'Mark' },
)
