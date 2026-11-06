import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import JSZip from 'jszip'
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

  test('the committed originals fixture lists Titus', async () => {
    const source = await zipSource(new Uint8Array(readFileSync(join(DATA, 'originals-tit.langpack.zip'))))
    const [ugnt] = await source.resources('originals')
    expect(ugnt).toMatchObject({ key: UGNT, kind: 'Greek New Testament', books: ['tit'] })
  })
})
