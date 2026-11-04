import { afterAll, describe, expect, test } from 'bun:test'
import { spawnSync } from 'node:child_process'
import { cpSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { catalogView, hex, KNOWN, readerOutput, readSegment } from '@bt-synergy/language-pack-v3'
import { main, optionsFromArgs, USAGE } from './build-v3'

// The sample of es-419 Titus the language-pack-v3 package tests with: real parts, a trimmed list.
const DATA = join(import.meta.dir, '..', '..', 'language-pack-v3', 'spec', 'tests', 'data')
const LIST = join(DATA, 'es-419', 'list.json')
const ORIGINALS = join(DATA, 'originals', 'list.json')
const PARTS = join(DATA, 'parts')
const BUILT = '2026-11-01T10:00:00Z'

const temps: string[] = []
afterAll(() => {
  for (const dir of temps) rmSync(dir, { recursive: true, force: true })
})
const temp = (): string => {
  const dir = mkdtempSync(join(tmpdir(), 'build-v3-'))
  temps.push(dir)
  return dir
}

/** What `main` prints and its exit code. */
async function run(args: string[]) {
  const out: string[] = []
  const err: string[] = []
  const code = await main(args, { log: (line) => out.push(line), error: (line) => err.push(line) })
  return { code, out, err }
}

const sample = (out: string, extra: string[] = []): string[] => ['--list', LIST, '--originals', ORIGINALS, '--parts', PARTS, '--out', out, '--built', BUILT, ...extra]

const read = (path: string): Uint8Array => new Uint8Array(readFileSync(path))

async function catalogOf(path: string) {
  const { seg } = await readSegment(read(path), { known: KNOWN.catalog, expectedClass: 'catalog' })
  return catalogView(seg)
}

/** Every file under `dir`, by relative path (forward slashes), with its bytes as hex. */
function snapshot(dir: string, prefix = ''): Record<string, string> {
  const files: Record<string, string> = {}
  for (const entry of readdirSync(join(dir, prefix), { withFileTypes: true })) {
    const path = prefix === '' ? entry.name : `${prefix}/${entry.name}`
    if (entry.isDirectory()) Object.assign(files, snapshot(dir, path))
    else files[path] = Buffer.from(readFileSync(join(dir, path))).toString('hex')
  }
  return files
}

/** The list files of the sample with parts the folder does not have: a book of the originals and of a bridge text that `--books tit` does not ask for. */
function listsWithAnotherBook(dir: string): { list: string; originals: string } {
  const list = JSON.parse(readFileSync(LIST, 'utf8'))
  const originals = JSON.parse(readFileSync(ORIGINALS, 'utf8'))
  const missing = (part: { sha256: string; book?: string }) => ({ ...part, sha256: 'ab'.repeat(32), book: 'rut' })
  list.parts.push(missing(list.parts.find((part: { kind: string }) => part.kind === 'book')))
  originals.parts.push(missing(originals.parts[0]))
  mkdirSync(dir, { recursive: true })
  writeFileSync(join(dir, 'list.json'), JSON.stringify(list))
  writeFileSync(join(dir, 'originals.json'), JSON.stringify(originals))
  return { list: join(dir, 'list.json'), originals: join(dir, 'originals.json') }
}

describe('build-v3: es-419 Titus', () => {
  const out = temp()
  let result: Awaited<ReturnType<typeof run>>

  test('exits 0 and prints one line per segment: class, book or group, KB, 12 digits of the id', async () => {
    result = await run(sample(out))
    expect(result.err).toEqual([])
    expect(result.code).toBe(0)
    const files = readdirSync(join(out, 'segments'))
    // One line for every segment file and the two catalogs.
    expect(result.out.filter((line) => /^\S+\s+\S+\s+\d+\.\d KB\s+[0-9a-f]{12}$/.test(line))).toHaveLength(files.length + 2)
    const book = result.out.find((line) => /^book\s+tit\s/.test(line))
    expect(book).toBeDefined()
    expect(result.out.some((line) => /^catalog\s+common\s/.test(line))).toBe(true)
    expect(result.out.some((line) => /^catalog\s+es-419\s/.test(line))).toBe(true)
    expect(result.out.some((line) => /^orig\s+tit\s/.test(line))).toBe(true)
  })

  test('the language catalog has a book:tit unit that names a segment present in segments/', async () => {
    const catalog = await catalogOf(join(out, 'catalog-es-419.seg'))
    expect(catalog.about.catalog).toBe('es-419')
    const unit = catalog.units.find((u) => u.id === 'book:tit')
    expect(unit).toBeDefined()
    expect(unit!.segments.length).toBeGreaterThan(0)
    for (const index of unit!.segments) {
      const id = hex(catalog.segments[index].id)
      expect(existsSync(join(out, 'segments', `${id}.seg`))).toBe(true)
    }
    // Every segment of the catalog is a file, and the file is the segment (its name is its id).
    for (const entry of catalog.segments) expect(existsSync(join(out, 'segments', `${hex(entry.id)}.seg`))).toBe(true)
    expect(catalog.about).toMatchObject({ publisher: 'unfoldingWord', revision: 1, built: BUILT, origin: 'published' })
  })

  test('the common catalog has orig:tit, and the language catalog requires it', async () => {
    const common = await catalogOf(join(out, 'catalog-common.seg'))
    expect(common.about.catalog).toBe('common')
    expect(common.units.map((u) => u.id)).toContain('orig:tit')
    const language = await catalogOf(join(out, 'catalog-es-419.seg'))
    expect(language.requires).toHaveLength(1)
    const [name, revision, id] = language.requires![0]
    expect([name, revision]).toEqual(['common', 1])
    const { id: commonId } = await readSegment(read(join(out, 'catalog-common.seg')), { known: KNOWN.catalog, expectedClass: 'catalog' })
    expect(hex(id)).toBe(commonId)
  })

  test('report.txt has a header (date, language, books, counts) and then the lines of the build', () => {
    const lines = readFileSync(join(out, 'report.txt'), 'utf8').split('\n')
    const header = lines.slice(0, lines.indexOf(''))
    expect(header.join('\n')).toContain(BUILT)
    expect(header.join('\n')).toContain('es-419')
    expect(header.join('\n')).toMatch(/books:\s+tit/)
    expect(header.join('\n')).toMatch(/segments/)
    expect(header.join('\n')).toContain('registry: none')
    expect(readFileSync(join(out, 'report.txt'), 'utf8').endsWith('\n')).toBe(true)
  })

  test('every segment file re-read with readerOutput gives no error', async () => {
    const names = [...readdirSync(join(out, 'segments')).map((name) => join(out, 'segments', name)), join(out, 'catalog-es-419.seg'), join(out, 'catalog-common.seg')]
    expect(names.length).toBeGreaterThan(4)
    for (const name of names) {
      const output = (await readerOutput(read(name))) as { error?: string }
      expect(output.error).toBeUndefined()
      expect(output).toBeTypeOf('object')
    }
  })

  test('without --registry, no registry is read or written', () => {
    expect(readdirSync(out).filter((name) => name.startsWith('registry'))).toEqual([])
  })
})

describe('build-v3: repeated builds', () => {
  test('two runs with the same --built write the same files (also report.txt)', async () => {
    const a = temp()
    const b = temp()
    expect((await run(sample(a))).code).toBe(0)
    expect((await run(sample(b))).code).toBe(0)
    expect(snapshot(a)).toEqual(snapshot(b))
  })

  test('another --built changes the catalogs and nothing else of the segments', async () => {
    const a = temp()
    const b = temp()
    expect((await run(sample(a))).code).toBe(0)
    expect((await run(sample(b).map((arg) => (arg === BUILT ? '2026-11-02T10:00:00Z' : arg)))).code).toBe(0)
    const names = (dir: string) => readdirSync(join(dir, 'segments')).sort()
    expect(names(a)).toEqual(names(b))
    expect(snapshot(a)['catalog-es-419.seg']).not.toBe(snapshot(b)['catalog-es-419.seg'])
  })

  test('--registry creates the folder and the file; a second run reuses it and nothing changes', async () => {
    const registry = join(temp(), 'sub', 'registry')
    const a = temp()
    const b = temp()
    const first = await run(sample(a, ['--registry', registry]))
    expect(first.code).toBe(0)
    const file = join(registry, 'registry-es-419.json')
    expect(existsSync(file)).toBe(true)
    const written = readFileSync(file, 'utf8')
    const parsed = JSON.parse(written)
    expect(Object.keys(parsed).length).toBeGreaterThan(0)
    expect(Object.keys(parsed).some((key) => key.includes('tw'))).toBe(true)
    expect(readFileSync(join(a, 'report.txt'), 'utf8')).toMatch(/registry:.*registry-es-419\.json.*0 articles read/)

    const second = await run(sample(b, ['--registry', registry]))
    expect(second.code).toBe(0)
    expect(readFileSync(file, 'utf8')).toBe(written)
    // The report differs in what it says of the registry; everything else is the same bytes.
    const { 'report.txt': _a, ...filesA } = snapshot(a)
    const { 'report.txt': _b, ...filesB } = snapshot(b)
    expect(filesB).toEqual(filesA)
    expect(readFileSync(join(b, 'report.txt'), 'utf8')).toMatch(new RegExp(`registry:.*registry-es-419\\.json.*${Object.keys(parsed).length} articles read`))
  })

  test('a registry that exists is the one the sids come from', async () => {
    const registry = temp()
    const a = temp()
    await run(sample(a, ['--registry', registry]))
    const file = join(registry, 'registry-es-419.json')
    const parsed = JSON.parse(readFileSync(file, 'utf8'))
    // The first article gets a sid the builder would not choose on its own; the build keeps it.
    const key = Object.keys(parsed)[0]
    parsed[key][0].sid = 'kept-sid'
    writeFileSync(file, JSON.stringify(parsed))
    const b = temp()
    expect((await run(sample(b, ['--registry', registry]))).code).toBe(0)
    expect(JSON.parse(readFileSync(file, 'utf8'))[key][0].sid).toBe('kept-sid')
  })
})

describe('build-v3: --books', () => {
  test('--books tit asks only for Titus: the parts of another book are not opened, and without it they are', async () => {
    const { list, originals } = listsWithAnotherBook(temp())
    const base = ['--list', list, '--originals', originals, '--parts', PARTS, '--built', BUILT]

    const only = temp()
    const restricted = await run([...base, '--out', only, '--books', 'tit'])
    expect(restricted.err).toEqual([])
    expect(restricted.code).toBe(0)
    const common = await catalogOf(join(only, 'catalog-common.seg'))
    expect(common.units.map((u) => u.id)).toEqual(['orig:tit'])

    const all = await run([...base, '--out', temp()])
    expect(all.code).toBe(2)
    expect(all.err.join('\n')).toContain('abababab')
  })

  test('a book that is not one of the 66 is a usage error', async () => {
    const result = await run(sample(temp(), ['--books', 'tit,xyz']))
    expect(result.code).toBe(1)
    expect(result.err.join('\n')).toContain('xyz')
    expect(result.err.join('\n')).toContain(USAGE)
  })

  test('a book the source has no originals of is a build error that names it', async () => {
    const result = await run(sample(temp(), ['--books', 'mat']))
    expect(result.code).toBe(2)
    expect(result.err.join('\n')).toContain('mat')
  })
})

describe('build-v3: arguments and errors', () => {
  test('no arguments: exit 1 with the usage', async () => {
    const result = await run([])
    expect(result.code).toBe(1)
    expect(result.err.join('\n')).toContain(USAGE)
    expect(result.out).toEqual([])
  })

  test('the usage text says how the build is made reproducible', () => {
    expect(USAGE).toContain('--built')
    expect(USAGE).toMatch(/reproducib|same bytes/i)
    for (const flag of ['--list', '--originals', '--parts', '--out', '--books', '--registry', '--revision', '--publisher']) expect(USAGE).toContain(flag)
  })

  test.each([
    ['a missing --out', (out: string) => sample(out).filter((_, i, all) => all[i - 1] !== '--out' && all[i] !== '--out')],
    ['an unknown flag', (out: string) => [...sample(out), '--nope', '1']],
    ['a flag without its value', (out: string) => [...sample(out), '--books']],
    ['a --revision that is not a number', (out: string) => [...sample(out), '--revision', 'x']],
    ['a --built that is not RFC 3339', (out: string) => [...sample(out), '--built', 'yesterday']],
  ])('%s: exit 1 with the usage', async (_name, make) => {
    const result = await run(make(temp()))
    expect(result.code).toBe(1)
    expect(result.err.join('\n')).toContain(USAGE)
  })

  test('a --parts directory that does not exist: exit 1, the message names it', async () => {
    const missing = join(temp(), 'no-parts')
    const result = await run(sample(temp()).map((arg) => (arg === PARTS ? missing : arg)))
    expect(result.code).toBe(1)
    expect(result.err.join('\n')).toContain(missing)
  })

  test('a list that does not exist: exit 1, the message names it', async () => {
    const missing = join(temp(), 'no-list.json')
    const result = await run(sample(temp()).map((arg) => (arg === LIST ? missing : arg)))
    expect(result.code).toBe(1)
    expect(result.err.join('\n')).toContain(missing)
  })

  test('a list that is not a parts list: exit 2, the message names it', async () => {
    const bad = join(temp(), 'list.json')
    writeFileSync(bad, '{"not":"a list"}')
    const result = await run(sample(temp()).map((arg) => (arg === LIST ? bad : arg)))
    expect(result.code).toBe(2)
    expect(result.err.join('\n')).toContain(bad)
  })

  test('a part the parts folder does not have: exit 2, the message names the part', async () => {
    const parts = temp()
    cpSync(PARTS, parts, { recursive: true })
    // The bridge text of Titus: the build cannot go without it.
    const gone = `${JSON.parse(readFileSync(LIST, 'utf8')).parts.find((part: { kind: string; resource: string }) => part.kind === 'book' && part.resource.endsWith('/glt')).sha256}.part.gz`
    rmSync(join(parts, gone))
    const result = await run(sample(temp()).map((arg) => (arg === PARTS ? parts : arg)))
    expect(result.code).toBe(2)
    expect(result.err.join('\n')).toContain(gone.replace('.part.gz', ''))
  })

  test('--revision and --publisher go to both catalogs, and the language requires that revision of the common one', async () => {
    const out = temp()
    expect((await run(sample(out, ['--revision', '7', '--publisher', 'Idiomas Puentes']))).code).toBe(0)
    for (const name of ['catalog-es-419.seg', 'catalog-common.seg']) {
      expect((await catalogOf(join(out, name))).about).toMatchObject({ revision: 7, publisher: 'Idiomas Puentes' })
    }
    expect((await catalogOf(join(out, 'catalog-es-419.seg'))).requires![0][1]).toBe(7)
  })
})

describe('build-v3: as a script', () => {
  const script = join(import.meta.dir, 'build-v3.ts')
  const cli = (args: string[]) => spawnSync(process.execPath, [script, ...args], { encoding: 'utf8' })

  test('exit 0 on the sample, with the lines on stdout', () => {
    const out = temp()
    const result = cli(sample(out))
    expect(result.status).toBe(0)
    expect(result.stdout).toMatch(/^book\s+tit\s/m)
    expect(existsSync(join(out, 'catalog-es-419.seg'))).toBe(true)
  })

  test('exit 1 with the usage on stderr when an argument is missing', () => {
    const result = cli(['--list', LIST])
    expect(result.status).toBe(1)
    expect(result.stderr).toContain(USAGE)
  })

  test('exit 2 with the message on stderr when the build fails', () => {
    const result = cli(sample(temp(), ['--books', 'mat']))
    expect(result.status).toBe(2)
    expect(result.stderr).toContain('mat')
  })
})

describe('build-v3: the maps', () => {
  const EN_LIST = join(DATA, 'en', 'list.json')

  test('--map-lang en with the English list writes the xmap core and the tit part, and the es-419 map core', async () => {
    const out = temp()
    const result = await run(sample(out, ['--map-lang', 'en', '--map-list', EN_LIST]))
    expect(result.err).toEqual([])
    expect(result.code).toBe(0)
    const classes: Record<string, string[]> = {}
    for (const name of readdirSync(join(out, 'segments'))) {
      const output = (await readerOutput(read(join(out, 'segments', name)))) as { h?: { class?: string; part?: string } }
      const h = output.h
      if (h?.class !== undefined) (classes[h.class] ??= []).push(h.part ?? '-')
    }
    expect(classes.xmap?.sort()).toEqual(['core', 'tit'])
    expect(classes.map).toContain('core')
    expect(result.out.some((line) => /^xmap: core \d+ bytes, 1 parts \d+ bytes, total \d+ bytes$/.test(line))).toBe(true)
    expect(result.out.some((line) => /^map es-419: core \d+ bytes/.test(line))).toBe(true)
  })

  test('--book-names reads a file and a bad flag value is a usage error', async () => {
    const names = join(temp(), 'names.json')
    writeFileSync(names, JSON.stringify({ tit: ['Tito', 'Tit', 'Tit'] }))
    const out = temp()
    expect((await run(sample(out, ['--map-lang', 'en', '--map-list', EN_LIST, '--book-names', names]))).code).toBe(0)
    expect((await run(sample(temp(), ['--map-lang', 'x y']))).code).toBe(1)
    expect((await run(sample(temp(), ['--book-names', join(temp(), 'none.json')]))).code).toBe(1)
  })
})

describe('build-v3: --topics', () => {
  const EN_LIST = join(DATA, 'en', 'list.json')
  const TOPICS = join(DATA, 'topics')
  /** The fixtures as a sources folder: `tipnr/`, `theographic/` and the stories of `en_obs/obs-repo/content/`. */
  function sources(): string {
    const dir = temp()
    mkdirSync(join(dir, 'tipnr'))
    cpSync(join(TOPICS, 'tipnr-subset.txt'), join(dir, 'tipnr', 'TIPNR.txt'))
    cpSync(join(TOPICS, 'theographic-subset'), join(dir, 'theographic'), { recursive: true })
    const content = join(dir, 'en_obs', 'obs-repo', 'content')
    mkdirSync(content, { recursive: true })
    let n = 0
    const stories = new Map<number, string>()
    for (const line of readFileSync(join(TOPICS, 'obs-refs.txt'), 'utf8').split(/\r?\n/)) {
      const h = /^=== (\d+)$/.exec(line)
      if (h) stories.set((n = Number(h[1])), '')
      else if (n > 0) stories.set(n, `${stories.get(n)}${line}\n`)
    }
    for (const [story, text] of stories) writeFileSync(join(content, `${String(story).padStart(2, '0')}.md`), text)
    return dir
  }
  const files = (out: string): Record<string, string> => snapshot(out, 'segments')

  test('adds the xtopics and the topics segments and leaves every other segment as the build without it', async () => {
    const plain = temp()
    const withTopics = temp()
    const base = ['--map-lang', 'en', '--map-list', EN_LIST]
    expect((await run(sample(plain, base))).code).toBe(0)
    const result = await run(sample(withTopics, [...base, '--topics', sources()]))
    expect(result.err).toEqual([])
    expect(result.code).toBe(0)
    expect(result.out.some((line) => /^xtopics\s+-\s/.test(line))).toBe(true)
    expect(result.out.some((line) => /^topics\s+es-419\s/.test(line))).toBe(true)
    const before = files(plain)
    const after = files(withTopics)
    for (const [name, hex] of Object.entries(before)) expect(after[name]).toBe(hex)
    expect(Object.keys(after).length).toBeGreaterThan(Object.keys(before).length)
  })

  test('a --topics folder without the three sources is a usage error that names the missing folder', async () => {
    const result = await run(sample(temp(), ['--topics', temp()]))
    expect(result.code).toBe(1)
    expect(result.err.join('\n')).toMatch(/--topics: .*tipnr/)
  })

  test('a --topics folder missing a Theographic file, the stories or the TIPNR file, or with two TIPNR files, is a usage error that names it', async () => {
    const missing = sources()
    rmSync(join(missing, 'theographic', 'places.json'))
    const a = await run(sample(temp(), ['--topics', missing]))
    expect(a.code).toBe(1)
    expect(a.err.join('\n')).toMatch(/--topics: .*places\.json is not a file/)

    const noStories = sources()
    for (const f of readdirSync(join(noStories, 'en_obs', 'obs-repo', 'content'))) rmSync(join(noStories, 'en_obs', 'obs-repo', 'content', f))
    const b = await run(sample(temp(), ['--topics', noStories]))
    expect(b.code).toBe(1)
    expect(b.err.join('\n')).toMatch(/--topics: .*content has no NN\.md/)

    const two = sources()
    cpSync(join(two, 'tipnr', 'TIPNR.txt'), join(two, 'tipnr', 'OTHER.txt'))
    const c = await run(sample(temp(), ['--topics', two]))
    expect(c.code).toBe(1)
    expect(c.err.join('\n')).toMatch(/--topics: .*exactly one \.txt file/)
  })
})

describe('build-v3: --aligned', () => {
  test('is a flag with no value: the other flags after it are still read, and giving it twice is a usage error', async () => {
    const options = optionsFromArgs([...sample(temp()), '--aligned', '--revision', '3'])
    expect(options.aligned).toBe(true)
    expect(options.revision).toBe(3)
    expect(optionsFromArgs(sample(temp())).aligned).toBe(false)
    const twice = await run(sample(temp(), ['--aligned', '--aligned']))
    expect(twice.code).toBe(1)
    expect(twice.err.join('\n')).toMatch(/--aligned is given twice/)
  })

  test('adds the aligned segments, changes the language catalog, and leaves every other segment as the build without it', async () => {
    const plain = temp()
    const withAligned = temp()
    const base = await run(sample(plain, []))
    expect(base.code).toBe(0)
    const result = await run(sample(withAligned, ['--aligned']))
    expect(result.err).toEqual([])
    expect(result.code).toBe(0)
    const before = snapshot(plain, 'segments')
    const after = snapshot(withAligned, 'segments')
    for (const [name, hex] of Object.entries(before)) expect(after[name]).toBe(hex)
    // The flag has an effect: more segments, at least one `aligned`, another language catalog
    expect(Object.keys(after).length).toBeGreaterThan(Object.keys(before).length)
    const aligned = result.out.filter((line) => /^aligned\s/.test(line))
    expect(aligned.length).toBeGreaterThan(0)
    expect(base.out.some((line) => /^aligned\s/.test(line))).toBe(false)
    expect(readFileSync(join(withAligned, 'catalog-es-419.seg')).equals(readFileSync(join(plain, 'catalog-es-419.seg')))).toBe(false)
    expect(readFileSync(join(withAligned, 'catalog-common.seg')).equals(readFileSync(join(plain, 'catalog-common.seg')))).toBe(true)
    // report.txt says how many units were built, 0 included
    expect(readFileSync(join(plain, 'report.txt'), 'utf8')).toMatch(/^aligned: off, 0 units$/m)
    expect(readFileSync(join(withAligned, 'report.txt'), 'utf8')).toContain(`aligned: on, ${aligned.length} units`)
  })
})
