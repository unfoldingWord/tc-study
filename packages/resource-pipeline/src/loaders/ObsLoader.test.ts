import { describe, expect, test } from 'bun:test'
import { storedZip } from '../download/zipFixture'
import { parseObsStoryMarkdown } from '../obs/parseObsMarkdown'
import { ObsLoader } from './ObsLoader'

const STORY1 = `# 1. The Creation

![OBS Image](https://cdn.door43.org/obs/jpg/360px/obs-en-01-01.jpg)

God made everything.

![OBS Image](./img/obs-en-01-02.jpg)

God saw it was good.

_A Bible story from: Genesis 1-2_
`
const STORY2 = `# 2. Sin Enters the World

![OBS Image](https://cdn.door43.org/obs/jpg/360px/obs-en-02-01.jpg)

The serpent lied.

_A Bible story from: Genesis 3_
`
const TEXTS: Record<string, string> = { 'content/01.md': STORY1, 'content/02.md': STORY2 }

const key = 'unfoldingWord/en/obs'
const meta = (over: Record<string, unknown> = {}) =>
  ({
    resourceKey: key,
    release: { tag_name: 'v9' },
    contentMetadata: { ingredients: [{ identifier: '01', path: './content/01.md' }, { identifier: '02', path: './content/02.md' }] },
    ...over,
  }) as never

function setup(files: Record<string, string>, metadata = meta()) {
  const store = new Map<string, any>()
  const calls: string[] = []
  const door43 = {
    config: { baseUrl: 'https://git.door43.org' },
    async downloadZipball(owner: string, repo: string, ref: string) {
      calls.push(`${owner}/${repo}@${ref}`)
      return storedZip(Object.fromEntries(Object.entries(files).map(([p, t]) => [`en_obs/${p}`, t])))
    },
    findRepository() { throw new Error('findRepository called') },
    fetchTextContent() { throw new Error('fetchTextContent called') },
  }
  const loader = new ObsLoader({
    cacheAdapter: { get: async (k: string) => store.get(k), set: async (k: string, v: unknown) => void store.set(k, v) },
    catalogAdapter: { get: async () => metadata },
    door43Client: door43,
  })
  return { loader, store, calls }
}

const files = { 'manifest.yaml': 'dublin_core: {}\n', ...TEXTS }

// What the network client used to give: parse the text, resolve each image against raw/tag/<ref>/<dir>/.
function expectedRow(n: number, md: string, ref: string, dir: string) {
  const parsed = parseObsStoryMarkdown(n, md)
  const base = `https://git.door43.org/unfoldingWord/en_obs/raw/tag/${ref}/${dir}`
  for (const f of parsed.frames) {
    f.resolvedSrc = /^https?:/.test(f.imageUrl.trim()) ? f.imageUrl.trim() : new URL(f.imageUrl.trim(), base).href
  }
  return parsed
}

const strip = (row: any) => { const { timestamp, ...rest } = row; return rest }

describe('ObsLoader reads the zip', () => {
  test('the rows from the zip equal the rows from the network', async () => {
    const { loader, store } = setup(files)
    await loader.downloadResource(key)
    for (const [n, id] of [[1, '01'], [2, '02']] as const) {
      const row = store.get(`obs:${key}:${id}`)
      expect(row.content).toEqual(expectedRow(n, TEXTS[`content/${id}.md`], 'v9', 'content/'))
      expect(strip(row)).toEqual({ content: row.content, resourceKey: key, storyId: id })
    }
  })

  test('resolvedSrc uses the release tag', async () => {
    const { loader } = setup(files)
    const story = await loader.loadContent(key, '01')
    expect(story.frames[1].resolvedSrc).toBe('https://git.door43.org/unfoldingWord/en_obs/raw/tag/v9/content/img/obs-en-01-02.jpg')
  })

  test('downloads once, at the catalog ref, with no findRepository or fetchTextContent call', async () => {
    const { loader, calls } = setup(files)
    await loader.downloadResource(key)
    await loader.loadContent(key, '02')
    expect(calls).toEqual(['unfoldingWord/en_obs@v9'])
  })

  test('without a release the ref is the default branch', async () => {
    const { loader, calls } = setup(files, meta({ release: undefined, default_branch: 'main' }))
    await loader.loadContent(key, '01')
    expect(calls).toEqual(['unfoldingWord/en_obs@main'])
  })

  test('a story missing from the zip fails naming the path', async () => {
    const { loader } = setup({ 'manifest.yaml': 'x', 'content/01.md': STORY1 })
    await expect(loader.loadContent(key, '02')).rejects.toThrow('content/02.md')
    await expect(loader.downloadResource(key)).rejects.toThrow('content/02.md')
  })

  test('a directory ingredient and a flat content/NN.md both read', async () => {
    const dir = setup(files, meta({ contentMetadata: { ingredients: [{ identifier: 'obs', path: './content', isDir: true }] } }))
    const flat = setup(files)
    const a = await dir.loader.loadContent(key, '02')
    const b = await flat.loader.loadContent(key, '02')
    expect(a).toEqual(b)
    expect(a.title).toContain('Sin Enters the World')
  })

  test('a directory ingredient with fewer than 50 files succeeds, rows only for the files there', async () => {
    const { loader, store } = setup(files, meta({ contentMetadata: { ingredients: [{ identifier: 'obs', path: './content', isDir: true }] } }))
    await loader.downloadResource(key)
    expect([...store.keys()].filter((k) => k.startsWith('obs:')).sort()).toEqual([`obs:${key}:01`, `obs:${key}:02`])
    expect(loader.lastSkipped.length).toBe(48)
  })

  test('an explicit id missing from the zip fails naming it, and every failed id is named', async () => {
    const { loader } = setup({ 'manifest.yaml': 'x' })
    const err = await loader.downloadResource(key).then(() => '', (e) => String(e.message))
    expect(err).toContain('2 OBS stories')
    expect(err).toContain('01: ')
    expect(err).toContain('02: ')
    expect(err).toContain('content/02.md')
  })

  test('a bad zip fails, even for a directory ingredient', async () => {
    const { loader } = setup(files, meta({ contentMetadata: { ingredients: [{ identifier: 'obs', path: './content', isDir: true }] } }))
    ;(loader as any).door43Client.downloadZipball = async () => new TextEncoder().encode('<html>502</html>').buffer
    await expect(loader.downloadResource(key)).rejects.toThrow()
  })
})
