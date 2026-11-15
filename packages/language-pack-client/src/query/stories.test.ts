import { afterEach, beforeAll, describe, expect, test } from 'bun:test'
import { createClient } from '../client'
import { httpSource } from '../source/http'
import { memoryStore } from '../store/memory'
import { type FakeServer, startFakeServer } from '../../test/fakeServer'
import { buildSample, type Sample } from '../../test/sample'

let sample: Sample
let noTitle: Sample
let noNotes: Sample
let trust: { trustedKeys: Record<string, Uint8Array> }
const bytesOf = (h: string) => Uint8Array.from(h.match(/../g)!, (p) => parseInt(p, 16))
let server: FakeServer | undefined
afterEach(() => server?.stop())

beforeAll(async () => {
  sample = await buildSample()
  // Story 2 with an empty title, and a language with stories and no notes.
  noTitle = await buildSample({
    revision: 2,
    tweak: {
      row: (row) => {
        if (!row.key.startsWith('obs:es-419_gl/es-419/obs:02')) return row
        const value = JSON.parse(JSON.stringify(row.value))
        value.content.title = ''
        return { ...row, value }
      },
    },
  })
  noNotes = await buildSample({ revision: 3, tweak: { omit: (row) => row.key.startsWith('tn:es-419_gl/es-419/obs-tn:') } })
  trust = { trustedKeys: { [sample.keys.keyId]: bytesOf(sample.keys.publicKey) } }
}, 120_000)

async function open(want: Parameters<ReturnType<typeof createClient>['install']>[1], content: Sample = sample) {
  server?.stop()
  server = startFakeServer(content, {})
  const client = createClient({ store: memoryStore(), source: httpSource({ base: server.url }), trust })
  await client.install('es-419', want)
  return client.open('es-419')
}

describe('stories', () => {
  test('"gen 1" lists stories 1 and 2, with titles and ranges', async () => {
    const r = await open({ books: [] })
    const a = await r.stories('gen 1')
    expect(a.query).toBe('stories')
    expect(a.data!.ref).toBe('gen 1')
    expect(a.data!.stories.map((s) => [s.n, s.id, s.title])).toEqual([
      [1, 'obs:1', 'La creación'],
      [2, 'obs:2', 'El pecado entra al mundo'],
    ])
    expect(a.data!.stories[0]!.refs).toEqual(['gen 1:1-2:25'])
    expect(a.notInstalled).toEqual([])
  })

  test('passage edges: the first and the last verse of a range list the story, one verse outside does not', async () => {
    const r = await open({ books: [] })
    const ids = async (ref: string) => (await r.stories(ref)).data!.stories.map((s) => s.n)
    expect(await ids('exo 4:30-5:1')).toEqual([10])
    expect(await ids('exo 4')).toEqual([])
    expect(await ids('exo 4:30')).toEqual([])
    expect(await ids('exo 5:1')).toEqual([10])
    expect(await ids('gen 2:25')).toEqual([1, 2])
    expect(await ids('gen 3:24')).toEqual([2])
    expect(await ids('gen 4:1')).toEqual([])
  })

  test('a book with no story gives an empty list, not notInstalled', async () => {
    const r = await open({ books: [] })
    const a = await r.stories('tit 1')
    expect(a.data).toEqual({ ref: 'tit 1', stories: [] })
    expect(a.notInstalled).toEqual([])
  })

  test('a reference that is not one is E_ARG', async () => {
    const r = await open({ books: [] })
    await expect(r.stories('gen')).rejects.toMatchObject({ code: 'E_ARG' })
    await expect(r.stories('xyz 1')).rejects.toMatchObject({ code: 'E_ARG' })
  })

  test('without the xtopics: data null and notInstalled xtopics, never an empty list', async () => {
    const r = await open({ defaults: false, units: ['topics'], books: [] })
    const a = await r.stories('gen 1')
    expect(a.data).toBeNull()
    expect(a.notInstalled.map((n) => n.unit)).toEqual(['xtopics'])
    expect(a.notInstalled[0]!.bytes).toBeGreaterThan(0)
  })

  test('without the topics: the stories have Story N titles, and the answer says so', async () => {
    const r = await open({ defaults: false, units: ['xtopics'], books: [] })
    const a = await r.stories('gen 1')
    expect(a.data!.stories.map((s) => s.title)).toEqual(['Story 1', 'Story 2'])
    expect(a.notInstalled.map((n) => n.unit)).toEqual(['topics'])
  })

  test('stories() with no ref lists every story in order, without the obs unit', async () => {
    const r = await open({ books: [] })
    const a = await r.stories()
    expect(a.data!.ref).toBeUndefined()
    expect(a.data!.stories.map((s) => s.n)).toEqual([1, 2, 10, 50])
    expect(a.data!.stories[3]!.refs.length).toBeGreaterThan(1)
    expect(a.notInstalled).toEqual([])
    expect(Object.keys(a.revision.units).sort()).toEqual(['topics', 'xtopics'])
  })

  test('a story with no title in the language shows Story N, in stories and in story', async () => {
    const r = await open({ units: ['obs'], books: [] }, noTitle)
    expect((await r.stories('gen 1')).data!.stories.map((s) => s.title)).toEqual(['La creación', 'Story 2'])
    expect((await r.story(2)).data!.title).toBe('Story 2')
  })
})

describe('story', () => {
  test('story(1) has its frames, the note on 1:2 and its question', async () => {
    const r = await open({ units: ['obs'], books: [] })
    const a = await r.story(1)
    expect(a.query).toBe('story')
    const d = a.data!
    expect([d.n, d.id, d.title, d.refs]).toEqual([1, 'obs:1', 'La creación', ['gen 1:1-2:25']])
    expect(d.helps).toEqual({ notes: 'count', questions: 'count', links: 'count' })
    expect(d.frames!.map((f) => [f.ref, f.text])).toEqual([
      ['01:01', 'Dios creó el mundo.'],
      ['01:02', 'Dios creó al hombre y a la mujer.'],
    ])
    expect(d.frames![1]!.notes.map((n) => [n.id, n.concept])).toEqual([['n001', 'ta:translate/figs-metaphor']])
    expect(d.frames![0]!.questions.map((q) => q.id)).toEqual(['q001'])
    expect(d.frames![0]!.links.map((l) => l.concept)).toEqual(['tw:kt/god'])
    expect(a.notInstalled).toEqual([])
    expect(a.revision.units.obs).toBeDefined()
  })

  test("story(1) has the language's reference line, and the image of a frame that has one", async () => {
    const r = await open({ units: ['obs'], books: [] })
    const d = (await r.story(1)).data!
    expect(d.reference).toBe('Una historia de la Biblia: Génesis 1-2')
    expect(d.frames![0]!.image).toBe('https://cdn.door43.org/obs/jpg/360px/obs-es-419-01-01.jpg')
    expect(d.frames![1]!.image).toBeUndefined()
  })

  test('story(1) without obs gives the title and notInstalled obs with its bytes', async () => {
    const r = await open({ books: [] })
    const a = await r.story(1)
    expect(a.data!.title).toBe('La creación')
    expect(a.data!.refs).toEqual(['gen 1:1-2:25'])
    expect(a.data!.frames).toBeUndefined()
    expect(a.data!.helps).toEqual({ notes: 'none', questions: 'none', links: 'none' })
    expect(a.notInstalled).toHaveLength(1)
    expect(a.notInstalled[0]!.unit).toBe('obs')
    expect(a.notInstalled[0]!.bytes).toBe(r.size('obs'))
    expect(a.notInstalled[0]!.bytes).toBeGreaterThan(0)
  })

  test('a language with stories and no notes: helps.notes is none, not 0', async () => {
    const r = await open({ units: ['obs'], books: [] }, noNotes)
    const d = (await r.story(1)).data!
    expect(d.helps).toEqual({ notes: 'none', questions: 'count', links: 'count' })
    expect(d.frames![1]!.notes).toEqual([])
  })

  test('a story with no row of a table that the language has: state zero', async () => {
    const r = await open({ units: ['obs'], books: [] })
    expect((await r.story(2)).data!.helps).toEqual({ notes: 'zero', questions: 'zero', links: 'zero' })
  })

  test('story(51), story(0) and story(1.5) are E_ARG', async () => {
    const r = await open({ units: ['obs'], books: [] })
    await expect(r.story(51)).rejects.toMatchObject({ code: 'E_ARG' })
    await expect(r.story(0)).rejects.toMatchObject({ code: 'E_ARG' })
    await expect(r.story(1.5)).rejects.toMatchObject({ code: 'E_ARG' })
  })
})
