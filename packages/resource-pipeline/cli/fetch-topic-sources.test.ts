import { afterAll, describe, expect, test } from 'bun:test'
import { createHash } from 'node:crypto'
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { main, toCrlf, type TopicSource, urlOf } from './fetch-topic-sources'

const PINS = JSON.parse(readFileSync(join(import.meta.dir, 'topic-sources.json'), 'utf8')) as { sources: TopicSource[] }
const made: string[] = []
const temp = (): string => {
  const d = mkdtempSync(join(tmpdir(), 'fts-'))
  made.push(d)
  return d
}
afterAll(() => {
  for (const d of made) rmSync(d, { recursive: true, force: true })
})

/** The body a source "has" on the fake network: its path, so the hash is of known bytes. */
const body = (s: TopicSource): string => `body of ${s.path}\nsecond line\n`
const sha = (t: string | Uint8Array): string => createHash('sha256').update(t).digest('hex')

/** The pins with the hashes of the fake bodies, and a fetch that serves them by URL. */
function fake(corrupt?: string) {
  const sources = PINS.sources.map((s) =>
    s.rawSha256 === undefined ? { ...s, sha256: sha(body(s)) } : { ...s, rawSha256: sha(body(s)), sha256: sha(toCrlf(Buffer.from(body(s)))) },
  )
  const byUrl = new Map(sources.map((s) => [urlOf(s), s]))
  const urls: string[] = []
  const fetchFn = async (url: string): Promise<Response> => {
    urls.push(url)
    const s = byUrl.get(url)
    if (!s) return new Response('nope', { status: 404 })
    return new Response(s.name === corrupt ? 'tampered' : body(s))
  }
  return { sources, fetchFn, urls }
}
const quiet = { log: () => {}, error: () => {} }

describe('fetch-topic-sources', () => {
  test('writes every file at its target', async () => {
    const { sources, fetchFn } = fake()
    const out = join(temp(), 'topics')
    expect(await main(['--out', out], quiet, fetchFn, sources)).toBe(0)
    for (const s of sources) expect(readFileSync(join(out, s.target), 'utf8')).toBe(s.eol === 'crlf' ? body(s).replace(/\n/g, '\r\n') : body(s))
    expect(readdirSync(join(out, 'theographic')).sort()).toEqual(['events.json', 'people.json', 'places.json', 'verses.json'])
    expect(readdirSync(join(out, 'en_obs', 'obs-repo', 'content')).length).toBe(50)
  })

  test('a wrong hash fails and leaves nothing', async () => {
    const { sources, fetchFn } = fake('theographic-places')
    const out = join(temp(), 'topics')
    const errors: string[] = []
    expect(await main(['--out', out], { log: () => {}, error: (l) => errors.push(l) }, fetchFn, sources)).toBe(1)
    expect(errors.join('\n')).toMatch(/theographic\/places\.json/)
    expect(existsSync(out)).toBe(false)
    const existing = temp()
    expect(await main(['--out', existing], quiet, fetchFn, sources)).toBe(1)
    expect(readdirSync(existing)).toEqual([])
  })

  test('a failed download fails and leaves nothing', async () => {
    const { sources } = fake()
    const out = join(temp(), 'topics')
    expect(await main(['--out', out], quiet, async () => new Response('x', { status: 500 }), sources)).toBe(1)
    expect(existsSync(out)).toBe(false)
  })

  test('refuses an out folder inside the upload folder', async () => {
    const { sources, fetchFn, urls } = fake()
    const work = temp()
    for (const out of [join(work, 'v3-out'), join(work, 'v3-out', 'topics')]) {
      const errors: string[] = []
      expect(await main(['--out', out, '--work', work], { log: () => {}, error: (l) => errors.push(l) }, fetchFn, sources)).toBe(2)
      expect(errors.join('\n')).toMatch(/v3-out/)
      expect(existsSync(out)).toBe(false)
    }
    expect(await main(['--out', join(temp(), 'v3-out', 'x')], quiet, fetchFn, sources)).toBe(2)
    expect(urls).toEqual([])
    expect(await main(['--out', join(work, 'topics'), '--work', work], quiet, fetchFn, sources)).toBe(0)
  })

  test('--out is required', async () => {
    expect(await main([], quiet, async () => new Response(''), [])).toBe(2)
  })

  test('the pins equal fuentes.md', () => {
    const md = readFileSync(join(import.meta.dir, '..', '..', 'language-pack-v3', 'spec', 'fuentes.md'), 'utf8')
    const commitOf = (label: string): string => new RegExp(`\\| ${label}.*?commit \`([0-9a-f]{40})\``).exec(md)![1]
    const want: Record<string, string> = {
      'STEPBible/STEPBible-Data': commitOf('STEPBible TIPNR'),
      'robertrouse/theographic-bible-metadata': commitOf('Theographic Bible Metadata'),
      'unfoldingWord/en_obs': commitOf('English OBS'),
    }
    for (const s of PINS.sources) expect(s.commit).toBe(want[s.repository])
    const theo = [...md.matchAll(/`(events|people|places|verses)\.json` `([0-9a-f]{64})`/g)]
    expect(theo.length).toBe(4)
    for (const m of theo) expect(PINS.sources.find((s) => s.target === `theographic/${m[1]}.json`)?.sha256).toBe(m[2])
    const obs = [...md.matchAll(/^([0-9a-f]{64})  (\d\d)\.md$/gm)]
    expect(obs.length).toBe(50)
    for (const m of obs) expect(PINS.sources.find((s) => s.target === `en_obs/obs-repo/content/${m[2]}.md`)?.sha256).toBe(m[1])
    expect(PINS.sources.find((s) => s.name === 'tipnr')?.sha256).toBe(/sha256 of the file: `([0-9a-f]{64})`/.exec(md)![1])
    expect(PINS.sources.length).toBe(1 + 4 + 50)
  })

  test('the URLs are raw GitHub for GitHub repositories and Door43 for the stories', () => {
    const urls = PINS.sources.map(urlOf)
    expect(urls.find((u) => u.includes('TIPNR'))).toMatch(/^https:\/\/raw\.githubusercontent\.com\/STEPBible\/STEPBible-Data\/be4191f[0-9a-f]+\/Proper%20Nouns\/TIPNR%20-/)
    expect(urls.find((u) => u.endsWith('events.json'))).toMatch(/^https:\/\/raw\.githubusercontent\.com\/robertrouse\/theographic-bible-metadata\/744355c[0-9a-f]+\/json\/events\.json$/)
    expect(urls.find((u) => u.endsWith('01.md'))).toBe('https://git.door43.org/unfoldingWord/en_obs/raw/commit/d39a1dc7a7557ac54e4a8fecc3462147fe7eec3b/content/01.md')
  })
})
