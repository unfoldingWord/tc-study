import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import JSZip from 'jszip'
import { extractOrig } from '../build/orig'
import { zipSource } from './zipSource'

const DATA = join(import.meta.dir, '..', '..', 'spec', 'tests', 'data')
const UGNT = 'unfoldingWord/el-x-koine/ugnt'

/** A format 1.1 pack of the originals the way `prepare-language` writes it: `role: "original"`, `rows.sot`, no `books`. */
async function originalsPack(keys: string[]): Promise<Uint8Array> {
  const zip = new JSZip()
  const manifest = {
    format: 'bt-synergy-language-pack',
    formatVersion: '1.1.0',
    language: 'es-419',
    kind: 'originals',
    resources: [{ key: UGNT, role: 'original', stamp: 'v0.34#2023-09-27T02_19_31Z', subject: 'Greek New Testament', rows: { sot: keys.length } }],
  }
  zip.file('manifest.json', JSON.stringify(manifest))
  zip.file(`rows/sot/${encodeURIComponent(UGNT).replace(/%/g, '~')}.jsonl`, keys.map((key) => JSON.stringify({ key, entry: {} })).join('\n') + '\n')
  return zip.generateAsync({ type: 'uint8array' })
}

describe('zipSource: the books of an original', () => {
  test('an original without "books" in the manifest lists the books of its sot rows', async () => {
    const pack = await originalsPack([`scripture-usj:${UGNT}:tit:1`, `scripture-usj:${UGNT}:tit:2`, `scripture-usj:${UGNT}:phm`])
    const source = await zipSource(pack)
    expect((await source.resources('originals')).map((r) => [r.key, r.books])).toEqual([[UGNT, ['phm', 'tit']]])
  })

  test('the committed originals fixture lists Titus, with its stamp from catalog.json', async () => {
    const source = await zipSource(new Uint8Array(readFileSync(join(DATA, 'originals-tit.langpack.zip'))))
    const [ugnt] = await source.resources('originals')
    expect(ugnt).toMatchObject({ key: UGNT, kind: 'Greek New Testament', books: ['tit'], bookStamps: { tit: 'g987ab2025a' } })
  })

  test('without catalog.json an original has no book stamps', async () => {
    const source = await zipSource(await originalsPack([`scripture-usj:${UGNT}:tit:1`]))
    const [ugnt] = await source.resources('originals')
    expect(ugnt!.bookStamps).toBeUndefined()
  })
})

const MACULA = 'Biblica/el-x-koine/macula'

/** The fixture's originals pack plus a MACULA resource the way `prepare-language` writes it: subject `Original Language Syntax`, sot rows only. */
async function withMacula(): Promise<Uint8Array> {
  const zip = await JSZip.loadAsync(readFileSync(join(DATA, 'originals-tit.langpack.zip')))
  const manifest = JSON.parse(await zip.file('manifest.json')!.async('string'))
  const rows = [
    { key: `${MACULA}/referents/TIT`, entry: { words: [['ζωῆς', 'G2222']] } },
    { key: `${MACULA}/trees/TIT`, entry: { sentences: [['*', ['s', 56001001]]] } },
    { key: `${MACULA}/trees/PHM`, entry: { sentences: [] } },
  ]
  manifest.resources.push({ key: MACULA, role: 'original', stamp: '3b8aa380e8#2026-10-15T02_19_35.000Z', subject: 'Original Language Syntax', rows: { receipt: 1, sot: rows.length } })
  zip.file('manifest.json', JSON.stringify(manifest))
  zip.file(`rows/sot/${encodeURIComponent(MACULA).replace(/%/g, '~')}.jsonl`, rows.map((r) => JSON.stringify(r)).join('\n') + '\n')
  return zip.generateAsync({ type: 'uint8array' })
}

describe('zipSource: MACULA', () => {
  test("a book's rows include its MACULA trees and referents, and only that book's", async () => {
    const source = await zipSource(await withMacula())
    const keys: string[] = []
    for await (const row of source.rows({ lang: 'originals', book: 'tit', layer: 'sot' })) if (row.key.startsWith(MACULA)) keys.push(row.key)
    expect(keys.sort()).toEqual([`${MACULA}/referents/TIT`, `${MACULA}/trees/TIT`])
    const macula = (await source.resources('originals')).find((r) => r.key === MACULA)
    expect(macula!.books).toEqual(['phm', 'tit'])
  })

  test('the orig of a book built from the zip carries its MACULA', async () => {
    const orig = await extractOrig(await zipSource(await withMacula()), 'tit')
    expect(orig.stamp).toBe('g987ab2025a')
    expect(orig.macula).toEqual({
      release: '3b8aa380e8#2026-10-15T02_19_35.000Z',
      trees: { sentences: [['*', ['s', 56001001]]] },
      referents: { words: [['ζωῆς', 'G2222']] },
    })
  })
})
