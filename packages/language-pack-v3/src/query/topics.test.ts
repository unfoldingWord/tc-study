import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { XtopicsCore, XtopicsPart } from '../model'
import { canonicalJson, sortKeys, type Json } from '../read/output'
import { answer, type MapSet } from './maps'
import { firstDifference, withoutIgnoredRelations } from '../../spec/tests/compare'
import { sampleTopics, SAMPLE, SOURCES } from './topicsFixture'

const core: XtopicsCore = {
  part: 'core',
  res: [['tipnr', 'r1'], ['unfoldingWord/en/obs', 'v9']],
  coverage: new Map([
    ['tipnr', { whole: ['gen', 'rom'], partial: [] }],
    ['unfoldingWord/en/obs', { whole: ['gen'], partial: [] }],
  ]),
  topics: new Map([
    ['per:abraham', { kind: 'person', source: 'tipnr', ref: 'Abraham@Gen.11.26-1Pe', title: 'Abraham', ustrong: 'H0085' }],
    ['lug:ur', { kind: 'place', source: 'tipnr', ref: 'Ur@Gen.11.28', title: 'Ur', ustrong: '' }],
    ['obs:5', { kind: 'story', source: 'unfoldingWord/en/obs', ref: '5', title: 'The Covenant', ustrong: '' }],
    ['obs:9', { kind: 'story', source: 'unfoldingWord/en/obs', ref: '9', title: 'Far away', ustrong: '' }],
  ]),
  occurrences: new Map([['per:abraham', new Map([['gen', [2, 2] as [number, number]]])]]),
  relations: [{ from: 'tw:names/abraham', to: 'per:abraham', type: 'same-as', source: 'tipnr', confidence: 70 }],
  ranges: { 'obs:5': [[1012001, 1012003]], 'obs:9': [[2001001, 2001005]] },
}
const part: XtopicsPart = { part: 'gen', occurrences: new Map([['per:abraham', [1012001, 1017005]]]) }
const installed: MapSet = { xtopics: { core, parts: new Map([['gen', part]]) }, revision: 1 }

describe('topic and category queries (unit)', () => {
  test('a module that is not on the device answers installed: false, with no state, no cell and no count', () => {
    const a = answer({ revision: 1 }, { kind: 'topic', id: 'per:abraham' }) as Record<string, unknown>
    expect(a).toEqual({ kind: 'topic', id: 'per:abraham', installed: false })
    expect(canonicalJson(a as Json)).not.toMatch(/state|none|zero|count/)
    expect(answer({ revision: 1 }, { kind: 'category', topicKind: 'person' })).toEqual({ kind: 'category', topicKind: 'person', installed: false })
  })

  test('a map without the module is still a map: the other queries are unchanged', () => {
    expect((answer({ revision: 1 }, { kind: 'book', book: 'gen' }) as { kind: string }).kind).toBe('book')
  })

  test('with the module the four states are as always, and an unknown id is found: false', () => {
    const a = answer(installed, { kind: 'topic', id: 'per:abraham' }) as { books: Record<string, unknown>; verses: number[]; stories: string[]; relations: unknown[]; topic: object }
    expect(a.books.gen).toEqual({ state: 'count', count: 2, verses: 2 })
    expect(a.books.rom).toEqual({ state: 'zero', count: 0, verses: 0 })
    expect(a.books.exo).toEqual({ state: 'none' })
    expect(a.verses).toEqual([1012001, 1017005])
    expect(a.stories).toEqual(['obs:5']) // obs:9 does not reach a verse of Abraham
    expect(a.relations).toEqual([{ from: 'tw:names/abraham', to: 'per:abraham', type: 'same-as', source: 'tipnr', confidence: 70 }])
    expect(answer(installed, { kind: 'topic', id: 'per:nobody' })).toEqual({ kind: 'topic', id: 'per:nobody', installed: true, found: false })
  })

  test('an empty title or uStrong is an absent key; types keeps only the relations of those types', () => {
    const a = answer(installed, { kind: 'topic', id: 'lug:ur', types: ['same-as'] }) as { topic: object; relations: unknown[]; stories: string[] }
    expect(a.topic).toEqual({ kind: 'place', source: 'tipnr', ref: 'Ur@Gen.11.28', title: 'Ur' })
    expect(a.relations).toEqual([])
    expect(a.stories).toEqual([])
    const none = answer(installed, { kind: 'topic', id: 'per:abraham', types: ['parent-of'] }) as { relations: unknown[] }
    expect(none.relations).toEqual([])
  })

  test('the stored relations of a story are listed for the story as well', () => {
    const a = answer(installed, { kind: 'topic', id: 'obs:5' }) as { stories: string[]; verses: number[] }
    expect(a.stories).toEqual([]) // a story is not asked for stories
    expect(a.verses).toEqual([])
  })

  test('category lists the ids of one kind sorted by code point', () => {
    expect(answer(installed, { kind: 'category', topicKind: 'story' })).toEqual({ kind: 'category', topicKind: 'story', installed: true, ids: ['obs:5', 'obs:9'] })
    expect(answer(installed, { kind: 'category', topicKind: 'event' })).toEqual({ kind: 'category', topicKind: 'event', installed: true, ids: [] })
  })

  test('a language topics module only adds the names', () => {
    const withNames: MapSet = { ...installed, topics: { core: { lang: 'es-419', part: 'core', res: [], names: { 'per:abraham': [['Abraham', 'alignment', 5, ['gen']], ['Abram', 'alignment', 2, ['gen']]] }, coverage: new Map() }, parts: new Map() } }
    expect((answer(withNames, { kind: 'topic', id: 'per:abraham' }) as { names: string[] }).names).toEqual(['Abraham', 'Abram'])
    expect((answer(installed, { kind: 'topic', id: 'per:abraham' }) as { names: string[] }).names).toEqual([])
  })

  test('a name under two sources is listed once, at its first place', () => {
    const twice: MapSet = { ...installed, topics: { core: { lang: 'es-419', part: 'core', res: [], names: { 'per:abraham': [['Abraham', 'alignment', 5, ['gen']], ['Abram', 'alignment', 4, ['gen']], ['Abraham', 'outline', 1, ['gen']]] }, coverage: new Map() }, parts: new Map() } }
    expect((answer(twice, { kind: 'topic', id: 'per:abraham' }) as { names: string[] }).names).toEqual(['Abraham', 'Abram'])
  })
})

const QUERIES = join(import.meta.dir, '..', '..', 'spec', 'tests', 'queries')

// The two fixed queries, asked of the xtopics built from the sample and the sources of part B (this takes minutes).
describe.skipIf(SAMPLE === undefined || SOURCES === undefined)('the fixed topic queries on the sample', () => {
  for (const name of ['per-abraham', 'ev-plagues-of-egypt']) {
    test(`${name} agrees with answers.py`, async () => {
      const { maps } = await cached()
      const doc = JSON.parse(readFileSync(join(QUERIES, `${name}.json`), 'utf8')) as { query: { kind: string }; expected: Json; ignoreRelationsFrom?: string[] }
      const found = firstDifference(withoutIgnoredRelations(sortKeys(answer(maps, doc.query)), doc.ignoreRelationsFrom), sortKeys(doc.expected))
      expect(found).toBeNull()
    }, 900_000)
  }

  test('without the xtopics of the same build the same query answers installed: false (Review Focus 5)', async () => {
    const { maps } = await cached()
    const bare: MapSet = { ...maps, xtopics: undefined }
    expect(answer(bare, { kind: 'topic', id: 'per:abraham' })).toEqual({ kind: 'topic', id: 'per:abraham', installed: false })
  })
})

let built: ReturnType<typeof sampleTopics> | undefined
const cached = () => (built ??= sampleTopics(SAMPLE!, SOURCES!))
if (SAMPLE === undefined || SOURCES === undefined) console.log('topics.test.ts: LP3_SAMPLE or LP3_SOURCES is not set: the fixed topic queries are skipped')
