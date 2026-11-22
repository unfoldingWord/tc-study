import { afterAll, describe, expect, test } from 'bun:test'
import { createHash } from 'node:crypto'
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { trimAcai, trimAcaiPlaces } from '@bt-synergy/language-pack-v3'
import { main, toCrlf, type TopicSource, urlOf } from './fetch-topic-sources'
import { manifestOf } from './tarball'
import { tarGz } from './tarball.fixture'

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

/** What a `tree` pin "has": two ACAI person files and one file outside its folder, in a GitHub-style tarball. */
const TREE_FILES: [string, string][] = [
  ['people/json/Isaac.json', JSON.stringify({ id: 'person:Isaac', primary_id: 'person:Isaac', gender: 'male', localizations: { spa: { preferred_label: 'Isaac' } } })],
  ['people/json/Sarah.json', JSON.stringify({ id: 'person:Sarah', primary_id: 'person:Sarah', gender: 'female', localizations: { spa: { preferred_label: 'Sara' } } })],
  ['places/json/Bethel.json', JSON.stringify({ id: 'place:Bethel', primary_id: 'place:Bethel', alternate_sources: { tipnr: ['Bethel@Gen.12.8-Zec'] }, place_types: { acai: ['town'] }, localizations: { spa: { preferred_label: 'Betel' } } })],
  ['README.md', 'not in the folder'],
]
const treeFiles = (prefix: string) => new Map(TREE_FILES.filter(([p]) => p.startsWith(prefix)).map(([p, t]) => [p, new TextEncoder().encode(t)]))
const trimmed = (s: TopicSource): string => (s.tree === 'acai-places' ? trimAcaiPlaces : trimAcai)(new Map(TREE_FILES.filter(([p]) => p.startsWith(s.path))), s.commit, [])

/** The pins with the hashes of the fake bodies, and a fetch that serves them by URL. */
function fake(corrupt?: string) {
  const sources = PINS.sources.map((s) =>
    s.tree !== undefined
      ? { ...s, manifestSha256: sha(manifestOf(treeFiles(s.path))), sha256: sha(trimmed(s)) }
      : s.rawSha256 === undefined
        ? { ...s, sha256: sha(body(s)) }
        : { ...s, rawSha256: sha(body(s)), sha256: sha(toCrlf(Buffer.from(body(s)))) },
  )
  const byUrl = new Map(sources.map((s) => [urlOf(s), s]))
  const urls: string[] = []
  const fetchFn = async (url: string): Promise<Response> => {
    urls.push(url)
    const s = byUrl.get(url)
    if (!s) return new Response('nope', { status: 404 })
    if (s.tree !== undefined) {
      const files = corrupt !== undefined && urlOf(sources.find((x) => x.name === corrupt)!) === url ? TREE_FILES.map(([p, t]): [string, string] => [p, `${t} `]) : TREE_FILES
      return new Response(tarGz(`${s.repository.split('/')[1]}-${s.commit}`, files))
    }
    return new Response(s.name === corrupt ? 'tampered' : body(s))
  }
  return { sources, fetchFn, urls }
}
/** What `main` writes for a pin. */
const written = (s: TopicSource): string => (s.tree !== undefined ? trimmed(s) : s.eol === 'crlf' ? body(s).replace(/\n/g, '\r\n') : body(s))
const quiet = { log: () => {}, error: () => {} }

describe('fetch-topic-sources', () => {
  test('writes every file at its target', async () => {
    const { sources, fetchFn } = fake()
    const out = join(temp(), 'topics')
    expect(await main(['--out', out], quiet, fetchFn, sources)).toBe(0)
    for (const s of sources) expect(readFileSync(join(out, s.target), 'utf8')).toBe(written(s))
    expect(JSON.parse(readFileSync(join(out, 'acai', 'people.json'), 'utf8')).people.map((p: { id: string }) => p.id)).toEqual(['person:Isaac', 'person:Sarah'])
    expect(readdirSync(join(out, 'theographic')).sort()).toEqual(['events.json', 'people.json', 'places.json', 'verses.json'])
    expect(readdirSync(join(out, 'en_obs', 'obs-repo', 'content')).length).toBe(50)
    expect(readdirSync(join(out, 'bsb_obs')).sort()).toEqual(['01', '02', '03', '04', '05', '06', '07', '08', '09', '10'])
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

  test('a folder whose files are not the pinned ones (manifest) fails and leaves nothing', async () => {
    const { sources, fetchFn } = fake('acai-people')
    const out = join(temp(), 'topics')
    const errors: string[] = []
    expect(await main(['--out', out], { log: () => {}, error: (l) => errors.push(l) }, fetchFn, sources)).toBe(1)
    expect(errors.join('\n')).toMatch(/acai\/people\.json: the 2 files under people\/json\/ have the manifest sha256 [0-9a-f]{64}, the pin says/)
    expect(existsSync(out)).toBe(false)
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
      'bcv-commons/bible-story-builder': commitOf('Bible Story Builder'),
      'BibleAquifer/ACAI': commitOf('ACAI'),
      'openbibleinfo/Bible-Geocoding-Data': commitOf('OpenBible.info'),
    }
    for (const s of PINS.sources) if (s.host !== 'url') expect(s.commit).toBe(want[s.repository])
    const theo = [...md.matchAll(/`(events|people|places|verses)\.json` `([0-9a-f]{64})`/g)]
    expect(theo.length).toBe(4)
    for (const m of theo) expect(PINS.sources.find((s) => s.target === `theographic/${m[1]}.json`)?.sha256).toBe(m[2])
    const obs = [...md.matchAll(/^([0-9a-f]{64})  (\d\d)\.md$/gm)]
    expect(obs.length).toBe(50)
    for (const m of obs) expect(PINS.sources.find((s) => s.target === `en_obs/obs-repo/content/${m[2]}.md`)?.sha256).toBe(m[1])
    expect(PINS.sources.find((s) => s.name === 'tipnr')?.sha256).toBe(/sha256 of the file: `([0-9a-f]{64})`/.exec(md)![1])
    const bsb = [...md.matchAll(/^([0-9a-f]{64})  (\d\d\/\d\d)\.md$/gm)]
    expect(bsb.length).toBe(50)
    for (const m of bsb) expect(PINS.sources.find((s) => s.target === `bsb_obs/${m[2]}.md`)?.sha256).toBe(m[1])
    const acai = PINS.sources.find((s) => s.name === 'acai-people')!
    expect(acai.manifestSha256).toBe(/ACAI.*manifest sha256 `([0-9a-f]{64})`/.exec(md)![1])
    expect(acai.sha256).toBe(/ACAI.*trimmed file sha256 `([0-9a-f]{64})`/.exec(md)![1])
    expect(urlOf(acai)).toBe('https://codeload.github.com/BibleAquifer/ACAI/tar.gz/5375d0d334bb6d635ef1813e4d3df58eb30efcca')
    const places = PINS.sources.find((s) => s.name === 'acai-places')!
    expect(places.commit).toBe(acai.commit)
    expect(places.manifestSha256).toBe(/ACAI places.*manifest sha256 `([0-9a-f]{64})`/.exec(md)![1])
    expect(places.sha256).toBe(/ACAI places.*trimmed file sha256 `([0-9a-f]{64})`/.exec(md)![1])
    expect(PINS.sources.find((s) => s.name === 'openbible-ancient')?.sha256).toBe(/OpenBible.info Bible Geocoding.*sha256 of the file: `([0-9a-f]{64})`/.exec(md)![1])
    for (const name of ['land', 'lakes', 'rivers_lake_centerlines']) {
      expect(PINS.sources.find((s) => s.name === `naturalearth-${name}`)?.sha256).toBe(new RegExp(`\`ne_10m_${name}\.zip\` \`([0-9a-f]{64})\``).exec(md)![1])
    }
    expect(PINS.sources.length).toBe(1 + 4 + 50 + 50 + 1 + 1 + 1 + 3)
  })

  test('the URLs are raw GitHub for GitHub repositories and Door43 for the stories', () => {
    const urls = PINS.sources.map(urlOf)
    expect(urls.find((u) => u.includes('TIPNR'))).toMatch(/^https:\/\/raw\.githubusercontent\.com\/STEPBible\/STEPBible-Data\/be4191f[0-9a-f]+\/Proper%20Nouns\/TIPNR%20-/)
    expect(urls.find((u) => u.endsWith('events.json'))).toMatch(/^https:\/\/raw\.githubusercontent\.com\/robertrouse\/theographic-bible-metadata\/744355c[0-9a-f]+\/json\/events\.json$/)
    expect(urls.find((u) => u.endsWith('01.md'))).toBe('https://git.door43.org/unfoldingWord/en_obs/raw/commit/d39a1dc7a7557ac54e4a8fecc3462147fe7eec3b/content/01.md')
    expect(urls.filter((u) => u.startsWith('https://naciscdn.org/naturalearth/10m/physical/ne_10m_')).length).toBe(3)
    expect(urls.find((u) => u.endsWith('OBS/01/01.md'))).toBe('https://raw.githubusercontent.com/bcv-commons/bible-story-builder/c07d45395d01b987c31f4e06871314f129c975e8/templates/OBS/01/01.md')
  })
})
