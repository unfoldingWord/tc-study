import { afterEach, describe, expect, test } from 'bun:test'
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import JSZip from 'jszip'
import { main } from '../../cli/fetch-ta-config'
import { configsOfZip, fetchTaConfigs, readTaConfigs, taReleases } from './taConfig'

const TA = 'es-419_gl/es-419/ta'
const ZIP = 'https://git.door43.org/es-419_gl/es-419_ta/archive/v4.zip'
const taResource = (over: Record<string, unknown> = {}) => ({
  key: TA,
  subject: 'Translation Academy',
  stamp: 'v4#2024-07-17T20_15_35Z',
  metadata: { release: { tag_name: 'v4', zipball_url: ZIP } },
  ...over,
})
const list = (resources: unknown[]) => ({ language: 'es-419', resources: [{ key: 'es-419_gl/es-419/tw', subject: 'Translation Words', stamp: 'v37#x' }, ...resources] })

async function zipOf(files: Record<string, string>): Promise<Uint8Array> {
  const zip = new JSZip()
  for (const [path, text] of Object.entries(files)) zip.file(`es-419_ta/${path}`, text)
  return zip.generateAsync({ type: 'uint8array' })
}

const dirs: string[] = []
const tempDir = () => {
  const dir = mkdtempSync(join(tmpdir(), 'ta-config-'))
  dirs.push(dir)
  return dir
}
afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true })
})

describe('taReleases', () => {
  test('the tA resources of a list and their release zips', () => {
    expect(taReleases(list([taResource()]))).toEqual([{ key: TA, tag: 'v4', zip: ZIP }])
    expect(taReleases(list([]))).toEqual([])
  })

  test('refuses a zip off Door43, a release other than the stamp, a list with no release', () => {
    expect(() => taReleases(list([taResource({ metadata: { release: { tag_name: 'v4', zipball_url: 'https://example.com/x.zip' } } })]))).toThrow('is not on')
    expect(() => taReleases(list([taResource({ stamp: 'v5#x' })]))).toThrow('is not the one of the stamp')
    expect(() => taReleases(list([taResource({ metadata: {} })]))).toThrow('names no release zip')
    expect(() => taReleases(list([taResource({ key: '../x/ta' })]))).toThrow('is not a resource key')
  })
})

describe('configsOfZip', () => {
  test('keeps the config.yaml of each manual and nothing else', async () => {
    const zip = await zipOf({ 'translate/config.yaml': 'a:\n', 'checking/config.yaml': 'b:\n', 'translate/toc.yaml': 'x', 'translate/a/config.yaml': 'no', 'manifest.yaml': 'm' })
    const configs = await configsOfZip(zip)
    expect([...configs.entries()].sort()).toEqual([
      ['checking', 'b:\n'],
      ['translate', 'a:\n'],
    ])
  })
})

describe('fetchTaConfigs and readTaConfigs', () => {
  test('write the configs under the resource key, and read them back', async () => {
    const dir = tempDir()
    const listFile = join(dir, 'list.json')
    writeFileSync(listFile, JSON.stringify(list([taResource()])))
    const zip = await zipOf({ 'translate/config.yaml': 'figs-metaphor:\n  dependencies:\n    - figs-simile\n', 'intro/config.yaml': 'ta-intro:\n' })
    const asked: string[] = []
    const out = join(dir, 'ta-config')
    const written = await fetchTaConfigs({ listFile, out, fetchFn: (async (url: string) => (asked.push(url), new Response(zip))) as unknown as typeof fetch })
    expect(asked).toEqual([ZIP])
    expect(written).toEqual(new Map([[TA, ['intro', 'translate']]]))
    expect(readFileSync(join(out, 'es-419_gl', 'es-419', 'ta', 'translate', 'config.yaml'), 'utf8')).toContain('figs-simile')

    const read = readTaConfigs(out, [TA, 'unfoldingWord/en/ta'])
    expect([...read.keys()]).toEqual([TA])
    expect([...read.get(TA)!.keys()]).toEqual(['intro', 'translate'])
  })

  test('a release with no config gives an empty folder, read as an empty map', async () => {
    const dir = tempDir()
    const listFile = join(dir, 'list.json')
    writeFileSync(listFile, JSON.stringify(list([taResource()])))
    const zip = await zipOf({ 'manifest.yaml': 'm' })
    const out = join(dir, 'ta-config')
    await fetchTaConfigs({ listFile, out, fetchFn: (async () => new Response(zip)) as unknown as typeof fetch })
    expect(readTaConfigs(out, [TA])).toEqual(new Map([[TA, new Map()]]))
  })
})

describe('fetch-ta-config', () => {
  const io = () => {
    const lines: string[] = []
    return { lines, io: { log: (l: string) => lines.push(l), error: (l: string) => lines.push(l) } }
  }

  test('exits 1 when a release cannot be fetched, 2 for bad arguments or an out under v3-out', async () => {
    const dir = tempDir()
    const listFile = join(dir, 'list.json')
    writeFileSync(listFile, JSON.stringify(list([taResource()])))
    const failed = io()
    expect(await main(['--list', listFile, '--out', join(dir, 'o')], failed.io, (async () => new Response('no', { status: 404 })) as unknown as typeof fetch)).toBe(1)
    expect(failed.lines.join('\n')).toContain('gave 404')
    expect(await main(['--list', listFile], io().io)).toBe(2)
    expect(await main(['--list', listFile, '--out', join(dir, 'work', 'v3-out', 'x')], io().io)).toBe(2)
    expect(existsSync(join(dir, 'work'))).toBe(false)
  })

  test('exits 0 and says what it wrote', async () => {
    const dir = tempDir()
    const listFile = join(dir, 'list.json')
    writeFileSync(listFile, JSON.stringify(list([taResource()])))
    const zip = await zipOf({ 'translate/config.yaml': 'a:\n' })
    const ok = io()
    expect(await main(['--list', listFile, '--out', join(dir, 'o')], ok.io, (async () => new Response(zip)) as unknown as typeof fetch)).toBe(0)
    expect(ok.lines).toEqual([`${TA} v4: translate/config.yaml`, `1 tA resource(s) written under ${join(dir, 'o')}`])
  })
})
