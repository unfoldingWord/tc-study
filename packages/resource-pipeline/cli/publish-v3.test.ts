import { afterAll, describe, expect, test } from 'bun:test'
import { cpSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { catalogView, hex, keyId, KNOWN, readSegment, verifyCatalog } from '@bt-synergy/language-pack-v3'
import { commonFolderProblem, main } from './publish-v3'
import { testKey } from './testKey'

const DATA = join(import.meta.dir, '..', '..', 'language-pack-v3', 'spec', 'tests', 'data')
const ES = join(DATA, 'es-419', 'list.json')
const EN = join(DATA, 'en', 'list.json')
const ORIGINALS = join(DATA, 'originals', 'list.json')
const PARTS = join(DATA, 'parts')

const temps: string[] = []
afterAll(() => {
  for (const dir of temps) rmSync(dir, { recursive: true, force: true })
})
const temp = (): string => {
  const dir = mkdtempSync(join(tmpdir(), 'publish-v3-'))
  temps.push(dir)
  return dir
}

type Run = { code: number; out: string[]; err: string[]; result: any }

async function publish(args: string[], env: Record<string, string | undefined> = {}): Promise<Run> {
  const out: string[] = []
  const err: string[] = []
  const code = await main(args, env, { log: (l) => err.push(l), error: (l) => err.push(l), out: (l) => out.push(l) })
  return { code, out, err, result: out.length > 0 ? JSON.parse(out[out.length - 1]) : undefined }
}

const common = (bucket: string, lang: string, list: string, extra: string[] = [], work = temp(), parts = PARTS) =>
  ['--lang', lang, '--list', list, '--originals', ORIGINALS, '--parts', parts, '--work', work, '--bucket-dir', bucket, ...extra]
const en = (bucket: string, list = EN, extra: string[] = [], work = temp()) => common(bucket, 'en', list, extra, work)
const es = (bucket: string, list = ES, extra: string[] = [], work = temp()) => common(bucket, 'es-419', list, ['--map-list', EN, ...extra], work)

/** Every file of the folder with its bytes (hex) and mtime. */
function snapshot(dir: string, prefix = ''): Record<string, string> {
  const files: Record<string, string> = {}
  if (!existsSync(join(dir, prefix))) return files
  for (const entry of readdirSync(join(dir, prefix), { withFileTypes: true })) {
    const path = prefix === '' ? entry.name : `${prefix}/${entry.name}`
    if (entry.isDirectory()) Object.assign(files, snapshot(dir, path))
    else files[path] = `${statSync(join(dir, path)).mtimeMs}:${Buffer.from(readFileSync(join(dir, path))).toString('hex')}`
  }
  return files
}

async function catalog(bucket: string, name: string) {
  const bytes = new Uint8Array(readFileSync(join(bucket, 'v3', 'catalog', `${name}.seg`)))
  const { seg, id } = await readSegment(bytes, { known: KNOWN.catalog, expectedClass: 'catalog' })
  return { id, model: catalogView(seg) }
}

/** A copy of a list without the parts that `drop` picks. */
function listWithout(file: string, drop: (part: { kind: string; resource: string }) => boolean): string {
  const list = JSON.parse(readFileSync(file, 'utf8'))
  const before = list.parts.length
  list.parts = list.parts.filter((part: { kind: string; resource: string }) => !drop(part))
  expect(list.parts.length).toBeLessThan(before)
  const path = join(temp(), 'list.json')
  writeFileSync(path, JSON.stringify(list))
  return path
}

describe('publish-v3', () => {
  test('publishes en then es-419', async () => {
    const bucket = temp()
    const first = await publish(en(bucket))
    expect(first.err.filter((l) => l.startsWith('publish-v3:'))).toEqual([])
    expect(first.code).toBe(0)
    expect(first.result.outcome).toBe('published')
    expect(first.result.lang).toBe('en')
    expect(first.result.catalogs.common.revision).toBe(1)
    expect(first.result.catalogs.lang.revision).toBe(1)
    expect(first.result.segments.uploaded).toBeGreaterThan(0)
    expect(existsSync(join(bucket, 'v3', 'catalog', 'common.seg'))).toBe(true)
    expect(existsSync(join(bucket, 'v3', 'catalog', 'en.seg'))).toBe(true)
    const commonCatalog = await catalog(bucket, 'common')
    expect(first.result.catalogs.common.id).toBe(commonCatalog.id)

    const before = snapshot(bucket)
    const second = await publish(es(bucket))
    expect(second.err.filter((l) => l.startsWith('publish-v3:'))).toEqual([])
    expect(second.code).toBe(0)
    expect(second.result.outcome).toBe('published')
    const after = snapshot(bucket)
    for (const [path, value] of Object.entries(before)) expect(after[path]).toBe(value)
    expect(existsSync(join(bucket, 'v3', 'catalog', 'es-419.seg'))).toBe(true)
    const es419 = await catalog(bucket, 'es-419')
    const required = es419.model.requires!.find(([name]) => name === 'common')!
    expect(required[1]).toBe(1)
    expect(hex(required[2])).toBe(commonCatalog.id)
    expect(second.result.catalogs.lang.id).toBe(es419.id)
  })

  test('--ta-config is passed to the build: a folder that does not exist fails it', async () => {
    const run = await publish(en(temp(), EN, ['--no-upload', '--ta-config', join(temp(), 'no-such-folder')]))
    expect(run.code).toBe(1)
    expect(run.err.join(' ')).toContain('--ta-config')
  })

  test('es-419 before en is skipped', async () => {
    const bucket = temp()
    mkdirSync(join(bucket, 'v3'), { recursive: true })
    const before = snapshot(bucket)
    const run = await publish(es(bucket))
    expect(run.code).toBe(0)
    expect(run.result).toEqual({ outcome: 'skipped', lang: 'es-419', reason: 'no common catalog' })
    expect(snapshot(bucket)).toEqual(before)
  })

  test('second run is unchanged', async () => {
    const bucket = temp()
    expect((await publish(en(bucket))).code).toBe(0)
    expect((await publish(es(bucket))).code).toBe(0)
    const before = snapshot(bucket)
    for (const args of [en(bucket), es(bucket)]) {
      const run = await publish(args)
      expect(run.err.filter((l) => l.startsWith('publish-v3:'))).toEqual([])
      expect(run.code).toBe(0)
      expect(run.result.outcome).toBe('unchanged')
      expect(run.result.segments).toEqual({ uploaded: 0, present: 0 })
    }
    expect(snapshot(bucket)).toEqual(before)
  })

  test('revision grows on change', async () => {
    const bucket = temp()
    await publish(en(bucket))
    await publish(es(bucket))
    const first = await catalog(bucket, 'es-419')
    const changed = listWithout(ES, (part) => part.kind === 'book' && part.resource.endsWith('/tq'))
    const run = await publish(es(bucket, changed))
    expect(run.err.filter((l) => l.startsWith('publish-v3:'))).toEqual([])
    expect(run.result.outcome).toBe('published')
    const second = await catalog(bucket, 'es-419')
    expect(second.model.about.revision).toBe(2)
    expect(hex(second.model.about.previous!)).toBe(first.id)
    expect(run.result.catalogs.lang).toEqual({ revision: 2, id: second.id })
    expect(run.result.catalogs.common.revision).toBe(1)
  })

  test('the map language with the common catalog unchanged: only its catalog is put, and it requires the published common', async () => {
    // In the fixture every en part feeds the common catalog (its resources and its map), so the en-only change is made by
    // taking the en catalog out of the bucket: the common catalog is then equal to the published one and en has to be put.
    const bucket = temp()
    await publish(en(bucket))
    const commonBefore = snapshot(bucket)['v3/catalog/common.seg']
    const firstCommon = await catalog(bucket, 'common')
    rmSync(join(bucket, 'v3', 'catalog', 'en.seg'))
    const run = await publish(en(bucket))
    expect(run.err.filter((l) => l.startsWith('publish-v3:'))).toEqual([])
    expect(run.code).toBe(0)
    expect(run.result.outcome).toBe('published')
    expect(snapshot(bucket)['v3/catalog/common.seg']).toBe(commonBefore)
    expect(run.result.catalogs.common).toEqual({ revision: 1, id: firstCommon.id })
    const english = await catalog(bucket, 'en')
    const required = english.model.requires!.find(([name]) => name === 'common')!
    expect(required[1]).toBe(1)
    expect(hex(required[2])).toBe(firstCommon.id)
    expect(run.result.segments.uploaded).toBe(0)
  })

  test('a change of the common catalog bumps its revision, and the language requires the new one', async () => {
    const bucket = temp()
    await publish(en(bucket))
    const first = await catalog(bucket, 'common')
    const changed = listWithout(EN, (part) => part.kind === 'titles' && part.resource.endsWith('/tw'))
    const run = await publish(en(bucket, changed))
    expect(run.err.filter((l) => l.startsWith('publish-v3:'))).toEqual([])
    expect(run.code).toBe(0)
    const second = await catalog(bucket, 'common')
    const english = await catalog(bucket, 'en')
    const required = english.model.requires!.find(([name]) => name === 'common')!
    expect(required[1]).toBe(second.model.about.revision)
    expect(hex(required[2])).toBe(second.id)
    expect(second.id).not.toBe(first.id)
    expect(second.model.about.revision).toBe(2)
    expect(hex(second.model.about.previous!)).toBe(first.id)
  })

  test('fetches missing parts from the bucket', async () => {
    const bucket = temp()
    const parts = temp()
    cpSync(PARTS, parts, { recursive: true })
    const list = JSON.parse(readFileSync(EN, 'utf8'))
    const sha: string = list.parts[0].sha256
    mkdirSync(join(bucket, 'parts'), { recursive: true })
    cpSync(join(parts, `${sha}.part.gz`), join(bucket, 'parts', `${sha}.part.gz`))
    rmSync(join(parts, `${sha}.part.gz`))
    const run = await publish(common(bucket, 'en', EN, [], temp(), parts))
    expect(run.err.filter((l) => l.startsWith('publish-v3:'))).toEqual([])
    expect(run.code).toBe(0)
    expect(existsSync(join(parts, `${sha}.part.gz`))).toBe(true)
    expect(run.result.outcome).toBe('published')

    // Missing in both: exit 1.
    rmSync(join(parts, `${sha}.part.gz`))
    rmSync(join(bucket, 'parts', `${sha}.part.gz`))
    const lost = await publish(common(bucket, 'en', EN, [], temp(), parts))
    expect(lost.code).toBe(1)
    expect(lost.err.join('\n')).toContain(sha)
  })

  test('--no-upload builds and puts nothing', async () => {
    const bucket = temp()
    const run = await publish(en(bucket, EN, ['--no-upload']))
    expect(run.code).toBe(0)
    expect(run.result.outcome).toBe('built')
    expect(run.result.catalogs.lang.revision).toBe(1)
    expect(snapshot(bucket)).toEqual({})
  })
})

describe('publish-v3: arguments', () => {
  test('no credentials and no --no-upload: exit 2', async () => {
    const run = await publish(['--lang', 'en', '--list', EN, '--originals', ORIGINALS, '--parts', PARTS, '--work', temp()])
    expect(run.code).toBe(2)
    expect(run.out).toEqual([])
  })

  test('only --no-upload without a bucket runs against an empty one', async () => {
    const run = await publish(['--lang', 'en', '--list', EN, '--originals', ORIGINALS, '--parts', PARTS, '--work', temp(), '--no-upload'])
    expect(run.err.filter((l) => l.startsWith('publish-v3:'))).toEqual([])
    expect(run.result.outcome).toBe('built')
  })

  test('partial R2 env: exit 2', async () => {
    const base = ['--lang', 'en', '--list', EN, '--originals', ORIGINALS, '--parts', PARTS, '--work', temp()]
    expect((await publish(base, { R2_ENDPOINT: 'https://x.example', R2_BUCKET: 'b' })).code).toBe(2)
    expect((await publish([...base, '--no-upload'], { R2_ENDPOINT: 'https://x.example' })).code).toBe(2)
  })

  test('--books with the map language and real R2 env: exit 2', async () => {
    const env = { R2_ENDPOINT: 'https://x.example', R2_BUCKET: 'b', R2_ACCESS_KEY_ID: 'k', R2_SECRET_ACCESS_KEY: 's' }
    const run = await publish(['--lang', 'en', '--list', EN, '--originals', ORIGINALS, '--parts', PARTS, '--work', temp(), '--books', 'tit'], env)
    expect(run.code).toBe(2)
    expect(run.err.join('\n')).toContain('--books')
  })

  test('--books with the map language is allowed with --bucket-dir', async () => {
    const run = await publish(en(temp(), EN, ['--books', 'tit']))
    expect(run.err.filter((l) => l.startsWith('publish-v3:'))).toEqual([])
    expect(run.code).toBe(0)
  })

  test('--lang must be a language tag and not "common"', async () => {
    for (const lang of ['common', 'ES', 'a_b', '-x', 'x-', '../x', 'a b']) {
      const bucket = temp()
      const run = await publish(common(bucket, lang, EN))
      expect(run.code).toBe(2)
      expect(snapshot(bucket)).toEqual({})
    }
  })

  test('--sign-key is refused: nothing signs yet', async () => {
    expect((await publish(en(temp(), EN, ['--sign-key', 'key.pem']))).code).toBe(2)
  })

  test('the common folder may not be the build folder or inside it', () => {
    expect(commonFolderProblem('/w/v3-out', '/w/v3-out')).toBeDefined()
    expect(commonFolderProblem('/w/v3-out/segments', '/w/v3-out')).toBeDefined()
    expect(commonFolderProblem('/w/v3-out/common', '/w/v3-out')).toBeDefined()
    expect(commonFolderProblem('/w/common', '/w/v3-out')).toBeUndefined()
    expect(commonFolderProblem('/w/v3-out2', '/w/v3-out')).toBeUndefined()
  })

  test('the downloaded common folder is outside the build folder, so published segments survive a run', async () => {
    const bucket = temp()
    await publish(en(bucket))
    const work = temp()
    const before = snapshot(bucket)
    expect((await publish(es(bucket, ES, [], work))).code).toBe(0)
    for (const [path, value] of Object.entries(before)) expect(snapshot(bucket)[path]).toBe(value)
    expect(readdirSync(join(work, 'common', 'segments')).length).toBeGreaterThan(0)
    expect(existsSync(join(work, 'v3-out', 'catalog-common.seg'))).toBe(false)
  })
})

describe('publish-v3 --sign-key', () => {
  const trustedOf = (key: { publicKey: Uint8Array }) => ({ [keyId(key.publicKey)]: key.publicKey })
  const signedBy = async (bucket: string, name: string, key: { publicKey: Uint8Array }): Promise<boolean> =>
    verifyCatalog(new Uint8Array(readFileSync(join(bucket, 'v3', 'catalog', `${name}.seg`))), trustedOf(key)).then(() => true, () => false)
  const newKey = () => {
    const key = testKey()
    temps.push(key.dir)
    return key
  }

  test('catalogs are published signed; the same key again is unchanged and puts nothing', async () => {
    const key = newKey()
    const bucket = temp()
    const first = await publish(en(bucket, EN, ['--sign-key', key.pem]))
    expect(first.err.filter((l) => l.startsWith('publish-v3:'))).toEqual([])
    expect(first.result.outcome).toBe('published')
    expect(await signedBy(bucket, 'common', key)).toBe(true)
    expect(await signedBy(bucket, 'en', key)).toBe(true)
    expect((await publish(es(bucket, ES, ['--sign-key', key.pem]))).result.outcome).toBe('published')
    expect(await signedBy(bucket, 'es-419', key)).toBe(true)

    const before = snapshot(bucket)
    for (const args of [en(bucket, EN, ['--sign-key', key.pem]), es(bucket, ES, ['--sign-key', key.pem])]) {
      const run = await publish(args)
      expect(run.code).toBe(0)
      expect(run.result.outcome).toBe('unchanged')
      expect(run.result.segments).toEqual({ uploaded: 0, present: 0 })
    }
    expect(snapshot(bucket)).toEqual(before)
    // the key is nowhere in the log or the bucket
    const pem = readFileSync(key.pem, 'utf8').split('\n')[1]
    expect(JSON.stringify(Object.values(before))).not.toContain(Buffer.from(pem).toString('hex'))
  })

  test('a catalog equal apart from about but unsigned is republished signed, revision + 1; segments are not put again', async () => {
    const key = newKey()
    const bucket = temp()
    await publish(en(bucket))
    await publish(es(bucket))
    const unsigned = await catalog(bucket, 'es-419')
    const segmentsBefore = snapshot(bucket, 'v3/seg')

    // map language: common and language republished signed
    const run = await publish(en(bucket, EN, ['--sign-key', key.pem]))
    expect(run.code).toBe(0)
    expect(run.result.outcome).toBe('published')
    expect(run.result.catalogs.common.revision).toBe(2)
    expect(run.result.catalogs.lang.revision).toBe(2)
    expect(await signedBy(bucket, 'common', key)).toBe(true)
    expect(await signedBy(bucket, 'en', key)).toBe(true)
    expect(snapshot(bucket, 'v3/seg')).toEqual(segmentsBefore)
    expect(run.result.segments.uploaded).toBe(0)

    // another language, now against the signed common
    const second = await publish(es(bucket, ES, ['--sign-key', key.pem]))
    expect(second.result.outcome).toBe('published')
    expect(second.result.catalogs.lang.revision).toBe(unsigned.model.about.revision + 1)
    expect(await signedBy(bucket, 'es-419', key)).toBe(true)
    expect((await publish(es(bucket, ES, ['--sign-key', key.pem]))).result.outcome).toBe('unchanged')
  })

  test('a catalog signed by another key only is republished with this one', async () => {
    const a = newKey()
    const b = newKey()
    const bucket = temp()
    await publish(en(bucket, EN, ['--sign-key', a.pem]))
    const run = await publish(en(bucket, EN, ['--sign-key', b.pem]))
    expect(run.result.outcome).toBe('published')
    expect(run.result.catalogs.lang.revision).toBe(2)
    expect(await signedBy(bucket, 'en', b)).toBe(true)
    expect(await signedBy(bucket, 'en', a)).toBe(false)
  })

  test('a missing or bad key file is refused before anything is put', async () => {
    const bucket = temp()
    mkdirSync(join(bucket, 'v3'), { recursive: true })
    const before = snapshot(bucket)
    const missing = await publish(en(bucket, EN, ['--sign-key', join(temp(), 'none.pem')]))
    expect(missing.code).toBe(2)
    const dir = temp()
    writeFileSync(join(dir, 'bad.pem'), 'not a key SECRETWORD')
    const bad = await publish(en(bucket, EN, ['--sign-key', join(dir, 'bad.pem')]))
    expect(bad.code).toBe(1)
    expect(bad.err.join('\n')).not.toContain('SECRETWORD')
    expect(snapshot(bucket)).toEqual(before)
  })
})
