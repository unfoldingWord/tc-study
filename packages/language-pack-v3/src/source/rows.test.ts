import { describe, expect, test } from 'bun:test'
import JSZip from 'jszip'
import { gzip, ungzip } from 'pako'
import { partsSource } from '../node/partsSource'
import { lines, partRows, type ResourceRef, type Row, type RowSource } from './rows'
import { zipSource } from './zipSource'

// The data is a sample of real files (spec/tests/data/README.md): es-419 Titus of staging, UGNT Titus, three common
// parts of es-419 and the format 1.1 pack of the same Titus.
const join = (...path: string[]) => path.join('/')
const DATA = join(import.meta.dir, '..', '..', 'spec', 'tests', 'data')
const LIST = join(DATA, 'es-419', 'list.json')
const ORIGINALS = join(DATA, 'originals', 'list.json')
const PARTS = join(DATA, 'parts')
const ZIP = join(DATA, 'es-419-tit.langpack.zip')

const FIVE = ['glt', 'gst', 'tn', 'tq', 'twl'].map((id) => `es-419_gl/es-419/${id}`)
const STAMPS: Record<string, string> = {
  'es-419_gl/es-419/glt': 'v42#2026-08-11T12_22_03Z',
  'es-419_gl/es-419/gst': 'v40#2024-07-17T20_13_11Z',
  'es-419_gl/es-419/tn': 'v66#2024-07-17T20_13_08Z',
  'es-419_gl/es-419/tq': 'v38#2024-07-17T20_13_05Z',
  'es-419_gl/es-419/twl': 'v18#2024-07-17T20_13_06Z',
}
const SUBJECTS: Record<string, string> = {
  'es-419_gl/es-419/glt': 'Aligned Bible',
  'es-419_gl/es-419/gst': 'Aligned Bible',
  'es-419_gl/es-419/tn': 'TSV Translation Notes',
  'es-419_gl/es-419/tq': 'TSV Translation Questions',
  'es-419_gl/es-419/twl': 'TSV Translation Words Links',
}

async function collect(rows: AsyncIterable<Row>): Promise<Row[]> {
  const out: Row[] = []
  for await (const row of rows) out.push(row)
  return out
}

const pair = (row: Row) => `${row.layer}\u0000${row.key}`
const multiset = (rows: Row[]) => rows.map(pair).sort()
const bytesOf = async (path: string) => new Uint8Array(await Bun.file(path).arrayBuffer())

/** Dates a cache sets when it writes or reads a row: a part leaves them out, a 1.1 pack keeps them. */
const VOLATILE = new Set(['timestamp', 'expiresAt', 'processingDate', 'downloadCompletedAt', 'cachedAt', 'catalogedAt'])
function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`
  if (value && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([k]) => !VOLATILE.has(k))
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonical(v)}`).join(',')}}`
  }
  return JSON.stringify(value)
}

const byKey = (refs: ResourceRef[]) => new Map(refs.map((r) => [r.key, r]))

async function sources(): Promise<{ parts: RowSource; zip: RowSource; originals: RowSource }> {
  const originals = await partsSource({ list: ORIGINALS, partsDir: PARTS })
  return {
    parts: await partsSource({ list: LIST, partsDir: PARTS, originals: ORIGINALS }),
    zip: await zipSource(await bytesOf(ZIP), originals),
    originals,
  }
}

describe('es-419 Titus, five resources: parts and the format 1.1 pack', () => {
  test('give the same multiset of (layer, key)', async () => {
    const { parts, zip } = await sources()
    const fromParts: Row[] = []
    for (const resource of FIVE) fromParts.push(...(await collect(parts.rows({ lang: 'es-419', book: 'tit', resource }))))
    const fromZip: Row[] = []
    for (const resource of FIVE) fromZip.push(...(await collect(zip.rows({ lang: 'es-419', book: 'tit', resource }))))
    expect(fromParts.length).toBe(72)
    expect(multiset(fromParts)).toEqual(multiset(fromZip))
    // sot 19, prepared 35, quote 6, align 12: tN and tWL carry the quotes and the alignments.
    const perLayer: Record<string, number> = {}
    for (const row of fromParts) perLayer[row.layer] = (perLayer[row.layer] ?? 0) + 1
    expect(perLayer).toEqual({ sot: 19, prepared: 35, quote: 6, align: 12 })
    // The pack holds nothing besides those rows (no receipts, no other resource).
    expect(multiset(await collect(zip.rows({ lang: 'es-419' })))).toEqual(multiset(fromParts))
  })

  test('give the same values once the dates a cache sets are left out', async () => {
    const { parts, zip } = await sources()
    const values = async (source: RowSource) => {
      const map = new Map<string, string>()
      for (const resource of FIVE) {
        for await (const row of source.rows({ lang: 'es-419', book: 'tit', resource })) map.set(pair(row), canonical(row.value))
      }
      return map
    }
    const a = await values(parts)
    const b = await values(zip)
    expect(a.size).toBe(72)
    expect(b.size).toBe(72)
    for (const [key, value] of a) expect(b.get(key)).toBe(value)
  })

  test('resources("es-419") lists the five with their stamps, subjects and books', async () => {
    const { parts, zip } = await sources()
    for (const source of [parts, zip]) {
      const found = byKey(await source.resources('es-419'))
      for (const key of FIVE) {
        const ref = found.get(key)
        expect(ref).toBeDefined()
        expect(ref!.stamp.length).toBeGreaterThan(0)
        expect(ref!.stamp).toBe(STAMPS[key])
        expect(ref!.kind).toBe(SUBJECTS[key])
        expect(ref!.books).toEqual(['tit'])
      }
    }
  })

  test('resources give the stamp of each book as format 2.0 records it: g and 10 digits of the blob', async () => {
    const { parts, zip } = await sources()
    const originals = byKey(await parts.resources('originals'))
    expect(originals.get('unfoldingWord/el-x-koine/ugnt')!.bookStamps).toEqual({ tit: 'g987ab2025a' })
    // `bookBlobs` of the list has 27 books for the UGNT; the source has rows for one, and says only that one.
    expect(originals.get('unfoldingWord/el-x-koine/ugnt')!.books).toEqual(['tit'])
    const found = byKey(await parts.resources('es-419'))
    const BLOBS: Record<string, string> = {
      'es-419_gl/es-419/glt': 'g9c65570ffd',
      'es-419_gl/es-419/gst': 'gbde5d47ec7',
      'es-419_gl/es-419/tn': 'gbb0c56a52f',
      'es-419_gl/es-419/tq': 'gb5c5eb1dc4',
      'es-419_gl/es-419/twl': 'ge970df02e3',
    }
    for (const key of FIVE) expect(found.get(key)!.bookStamps).toEqual({ tit: BLOBS[key] })
    // A resource of no book (tW) or without blobs in its list (uGL) has none, and no empty map.
    for (const key of ['es-419_gl/es-419/tw', 'es-419_gl/es-419/ugl']) expect('bookStamps' in found.get(key)!).toBe(false)
    // A format 1.1 pack records them in its catalog.json (the same Door43 rows): the same stamps, and none where the parts have none.
    const fromZip = byKey(await zip.resources('es-419'))
    for (const key of FIVE) expect(fromZip.get(key)!.bookStamps).toEqual({ tit: BLOBS[key] })
    for (const [key, ref] of fromZip) expect(ref.bookStamps).toEqual(found.get(key)?.bookStamps)
  })

  test('the stamps of the books are those that the quote and align keys of the sample name after "@"', async () => {
    const { parts } = await sources()
    const stamps = new Map<string, string>()
    for (const lang of ['es-419', 'originals']) {
      for (const ref of await parts.resources(lang)) if (ref.bookStamps?.tit) stamps.set(ref.key, ref.bookStamps.tit)
    }
    const named = new Map<string, string>()
    for (const layer of ['quote', 'align']) {
      for await (const row of parts.rows({ lang: 'es-419', layer })) {
        for (const match of row.key.matchAll(/([a-zA-Z0-9_.-]+(?:\/[a-zA-Z0-9_.-]+){2})@(g[0-9a-f]{10})/g)) named.set(match[1], match[2])
      }
    }
    // tN, tWL, UGNT (quote and align keys) and GLT, GST (align keys).
    expect([...named.keys()].sort()).toEqual(
      ['es-419_gl/es-419/glt', 'es-419_gl/es-419/gst', 'es-419_gl/es-419/tn', 'es-419_gl/es-419/twl', 'unfoldingWord/el-x-koine/ugnt'].sort(),
    )
    for (const [key, stamp] of named) expect(stamps.get(key)).toBe(stamp)
  })

  test('the parts list also names the common resources, with a stamp each', async () => {
    const { parts } = await sources()
    const found = byKey(await parts.resources('es-419'))
    expect([...found.keys()].sort()).toEqual([...FIVE, 'es-419_gl/es-419/tw', 'es-419_gl/es-419/ugl'].sort())
    expect(found.get('es-419_gl/es-419/tw')).toEqual({
      key: 'es-419_gl/es-419/tw',
      stamp: 'v37#2024-07-17T20_12_37Z',
      kind: 'Translation Words',
      books: [],
      title: 'Palabras de Traducción',
      license: 'CC BY-SA 4.0',
    })
    expect(found.get('es-419_gl/es-419/ugl')!.kind).toBe('Greek Lexicon')
    for (const ref of found.values()) expect(ref.stamp.length).toBeGreaterThan(0)
  })
})

describe('order of the rows', () => {
  test('parts: the order of the list\'s parts, then of the lines in each part', async () => {
    const list = (await Bun.file(LIST).json()) as { parts: Array<{ sha256: string }> }
    const expected: string[] = []
    for (const part of list.parts) {
      const text = new TextDecoder().decode(ungzip(await bytesOf(join(PARTS, `${part.sha256}.part.gz`))))
      for (const line of text.split('\n').filter(Boolean)) {
        const row = JSON.parse(line) as Row
        expected.push(pair(row))
      }
    }
    const { parts } = await sources()
    const first = (await collect(parts.rows({ lang: 'es-419' }))).map(pair)
    expect(first.length).toBe(expected.length)
    expect(first).toEqual(expected)
    // Twice the same: nothing in the order depends on the run.
    expect((await collect(parts.rows({ lang: 'es-419' }))).map(pair)).toEqual(expected)
  })

  test('zip: the manifest\'s resources, in each the layers sot, prepared, quote, align, text, index, then the lines of the file', async () => {
    const zip = await JSZip.loadAsync(await bytesOf(ZIP))
    const manifest = JSON.parse(await zip.file('manifest.json')!.async('string')) as { resources: Array<{ key: string; rows: Record<string, number> }> }
    const expected: string[] = []
    for (const resource of manifest.resources) {
      for (const layer of ['sot', 'prepared', 'quote', 'align', 'text', 'index']) {
        if (!resource.rows[layer]) continue
        const text = await zip.file(`rows/${layer}/${encodeURIComponent(resource.key).replace(/%/g, '~')}.jsonl`)!.async('string')
        for (const line of text.split('\n').filter(Boolean)) expected.push(`${layer}\u0000${(JSON.parse(line) as { key: string }).key}`)
      }
    }
    const { zip: source } = await sources()
    const got = (await collect(source.rows({ lang: 'es-419' }))).map(pair)
    expect(got.length).toBe(72)
    expect(got).toEqual(expected)
  })
})

describe('filters', () => {
  test('a filter that matches nothing gives an empty sequence', async () => {
    const { parts, zip } = await sources()
    for (const source of [parts, zip]) {
      expect(await collect(source.rows({ lang: 'es-419', book: 'gen' }))).toEqual([])
      expect(await collect(source.rows({ lang: 'es-419', resource: 'es-419_gl/es-419/nope' }))).toEqual([])
      expect(await collect(source.rows({ lang: 'es-419', layer: 'index' }))).toEqual([])
      expect(await collect(source.rows({ lang: 'es-419', layer: 'receipt' }))).toEqual([])
      expect(await collect(source.rows({ lang: 'fr' }))).toEqual([])
      expect(await collect(source.rows({ lang: 'es-419', book: 'tit', resource: 'es-419_gl/es-419/tq', layer: 'align' }))).toEqual([])
    }
  })

  test('layer, resource and book narrow the rows', async () => {
    const { parts, zip } = await sources()
    for (const source of [parts, zip]) {
      const quotes = await collect(source.rows({ lang: 'es-419', layer: 'quote' }))
      expect(quotes.length).toBe(6)
      expect(quotes.every((r) => r.layer === 'quote' && r.key.startsWith('helps-quote:'))).toBe(true)
      const tq = await collect(source.rows({ lang: 'es-419', resource: 'es-419_gl/es-419/tq' }))
      expect(tq.length).toBe(11)
      expect(tq.every((r) => r.key.includes('es-419_gl/es-419/tq'))).toBe(true)
      expect((await collect(source.rows({ lang: 'es-419', book: 'tit', layer: 'sot', resource: 'es-419_gl/es-419/tn' }))).map((r) => r.key)).toEqual([
        'tn:es-419_gl/es-419/tn:tit',
        'tn:es-419_gl/es-419/tn:tit:1',
        'tn:es-419_gl/es-419/tn:tit:2',
        'tn:es-419_gl/es-419/tn:tit:3',
      ])
    }
  })

  test('parts: a part without a book (tW, lexicon, titles) does not match a book, and does match when none is asked', async () => {
    const { parts } = await sources()
    const all = await collect(parts.rows({ lang: 'es-419' }))
    const tit = await collect(parts.rows({ lang: 'es-419', book: 'tit' }))
    expect(tit.length).toBe(72)
    expect(all.length).toBeGreaterThan(tit.length)
    const keys = new Set(all.map((r) => r.key))
    expect(keys.has('es-419_gl/es-419/tw/bible/kt/grace')).toBe(true)
    expect(keys.has('es-419_gl/es-419/ugl/content/1.json')).toBe(true)
    expect(keys.has('es-419_gl/es-419/ugl/content/999.json')).toBe(true)
    expect(keys.has('helps-text:tw-title:es-419_gl/es-419/tw@v37#2024-07-17T20_12_37Z:kt/grace')).toBe(true)
    expect((await collect(parts.rows({ lang: 'es-419', layer: 'text' }))).length).toBe(1055)
    expect((await collect(parts.rows({ lang: 'es-419', resource: 'es-419_gl/es-419/ugl' }))).length).toBe(981)
  })

  test('parts: what a list declares for a part\'s layers is what the part holds', async () => {
    for (const path of [LIST, ORIGINALS]) {
      const list = (await Bun.file(path).json()) as { parts: Array<{ sha256: string; layers: string[]; rows: number }> }
      for (const part of list.parts) {
        const text = new TextDecoder().decode(ungzip(await bytesOf(join(PARTS, `${part.sha256}.part.gz`))))
        const rows = text.split('\n').filter(Boolean).map((line) => JSON.parse(line) as Row)
        expect(rows.length).toBe(part.rows)
        expect([...new Set(rows.map((r) => r.layer))].sort()).toEqual([...part.layers].sort())
      }
    }
  })
})

describe('the originals', () => {
  test('resources give the title and the license text the list states, and a pack gives the title; none gives rights or a credit line', async () => {
    const { parts, zip } = await sources()
    const fromList = byKey(await parts.resources('es-419'))
    expect(fromList.get('es-419_gl/es-419/tn')).toMatchObject({ title: 'Notas de Traducción', license: 'CC BY-SA 4.0' })
    const fromPack = byKey(await zip.resources('es-419'))
    expect(fromPack.get('es-419_gl/es-419/tn')!.title).toBe('Notas de Traducción')
    expect('license' in fromPack.get('es-419_gl/es-419/tn')!).toBe(false)
    for (const ref of [...fromList.values(), ...fromPack.values()]) {
      expect('rights' in ref).toBe(false)
      expect('attribution' in ref).toBe(false)
    }
  })

  test('partsSource gives the UGNT Titus rows and its stamp', async () => {
    const { parts } = await sources()
    const rows = await collect(parts.rows({ lang: 'originals', book: 'tit' }))
    expect(rows.length).toBe(12)
    expect(rows.map((r) => r.layer)).toContain('prepared')
    expect(rows.every((r) => r.key.includes('unfoldingWord/el-x-koine/ugnt'))).toBe(true)
    expect(rows.map((r) => r.key)).toContain('scripture-usj:unfoldingWord/el-x-koine/ugnt:tit:1')
    expect(await parts.resources('originals')).toEqual([
      {
        key: 'unfoldingWord/el-x-koine/ugnt',
        stamp: 'v0.34#2023-09-27T02_19_31Z',
        kind: 'Greek New Testament',
        books: ['tit'],
        bookStamps: { tit: 'g987ab2025a' },
        title: 'unfoldingWord® Greek New Testament',
        license: 'CC BY-SA 4.0',
      },
    ])
    // A language the source does not hold is not an error: it has nothing.
    expect(await parts.resources('fr')).toEqual([])
  })

  test('without an originals list, partsSource has no originals', async () => {
    const parts = await partsSource({ list: LIST, partsDir: PARTS })
    expect(await collect(parts.rows({ lang: 'originals' }))).toEqual([])
    expect(await parts.resources('originals')).toEqual([])
  })

  test('zipSource hands the originals to the source it was given', async () => {
    const { zip, originals } = await sources()
    expect((await collect(zip.rows({ lang: 'originals', book: 'tit' }))).map(pair)).toEqual((await collect(originals.rows({ lang: 'originals', book: 'tit' }))).map(pair))
    expect((await zip.resources('originals')).map((r) => r.key)).toEqual(['unfoldingWord/el-x-koine/ugnt'])
    const alone = await zipSource(await bytesOf(ZIP))
    expect(await collect(alone.rows({ lang: 'originals' }))).toEqual([])
    expect(await alone.resources('originals')).toEqual([])
  })
})

describe('what a source refuses', () => {
  test('partsSource: a part the list names and the folder lacks fails when it is read, and says which', async () => {
    const parts = await partsSource({ list: LIST, partsDir: join(DATA, 'no-such-folder') })
    const sha = ((await Bun.file(LIST).json()) as { parts: Array<{ sha256: string }> }).parts[0].sha256
    await expect(collect(parts.rows({ lang: 'es-419' }))).rejects.toThrow(sha)
  })

  test('partsSource: a part a filter excludes is never opened; one it keeps, and the folder lacks, fails naming it', async () => {
    // The folder does not exist: any part that is opened fails. The sample's `parts/` lacks parts that the full list names,
    // and a run with `book` or `resource` must not trip over them.
    const dir = join(DATA, 'no-such-folder')
    const parts = await partsSource({ list: LIST, partsDir: dir, originals: ORIGINALS })
    const listed = (await Bun.file(LIST).json()) as { parts: Array<{ sha256: string; resource: string; book?: string; layers: string[] }> }
    const tq = listed.parts.filter((part) => part.resource === 'es-419_gl/es-419/tq')
    expect(tq.length).toBe(1)
    const excluded: Array<Parameters<RowSource['rows']>[0]> = [
      { lang: 'es-419', book: 'gen' },
      { lang: 'es-419', resource: 'es-419_gl/es-419/nope' },
      { lang: 'es-419', layer: 'index' },
      { lang: 'es-419', resource: 'es-419_gl/es-419/tq', book: 'gen' },
      { lang: 'es-419', resource: 'es-419_gl/es-419/tq', layer: 'align' },
      { lang: 'originals', book: 'gen' },
      { lang: 'fr' },
    ]
    for (const filter of excluded) expect(await collect(parts.rows(filter))).toEqual([])
    for (const filter of [{ lang: 'es-419', resource: 'es-419_gl/es-419/tq' }, { lang: 'es-419', resource: 'es-419_gl/es-419/tq', book: 'tit' }, { lang: 'es-419', book: 'tit', layer: 'sot', resource: 'es-419_gl/es-419/tq' }]) {
      await expect(collect(parts.rows(filter))).rejects.toThrow(tq[0].sha256)
    }
  })

  test('partsSource: a blob the list writes badly gives no stamp, and no stamps gives no map', async () => {
    const list = (await Bun.file(ORIGINALS).json()) as { resources: Array<{ metadata: { contentMetadata: Record<string, unknown> } }> }
    const dir = join(process.env.TEMP ?? process.env.TMPDIR ?? '/tmp', `langpack-v3-${crypto.randomUUID()}`)
    let n = 0
    const bookStamps = async (blobs: unknown): Promise<Record<string, string> | undefined> => {
      const copy = structuredClone(list)
      if (blobs === undefined) delete copy.resources[0].metadata.contentMetadata.bookBlobs
      else copy.resources[0].metadata.contentMetadata.bookBlobs = blobs
      const path = join(dir, `${n++}.json`)
      await Bun.write(path, JSON.stringify(copy))
      const [ugnt] = await (await partsSource({ list: path, partsDir: PARTS })).resources('originals')
      return ugnt.bookStamps
    }
    try {
      expect(await bookStamps({ tit: '0123456789abcdef0123' })).toEqual({ tit: 'g0123456789' })
      // Not well formed: no stamp for the book. Without a stamp the map is left out, not empty.
      for (const bad of [undefined, null, [], 'text', {}, { rom: '0123456789abcdef' }, { tit: '' }, { tit: '0123' }, { tit: 'ABCDEF0123456789' }, { tit: 'xyz0123456789' }, { tit: 12345678901 }]) {
        expect(await bookStamps(bad)).toBeUndefined()
      }
    } finally {
      await Bun.$`rm -rf ${dir}`.quiet()
    }
  })

  test('partsSource: a file that is not a parts list', async () => {
    await expect(partsSource({ list: join(DATA, 'es-419-tit.langpack.zip'), partsDir: PARTS })).rejects.toThrow()
    await expect(partsSource({ list: join(DATA, 'no-such-list.json'), partsDir: PARTS })).rejects.toThrow()
  })

  test('zipSource: a zip without a manifest, one of another format and one of a newer major', async () => {
    const make = async (files: Record<string, string>) => {
      const zip = new JSZip()
      for (const [name, text] of Object.entries(files)) zip.file(name, text)
      return zip.generateAsync({ type: 'uint8array' })
    }
    await expect(zipSource(await make({ 'rows/sot/x.jsonl': '' }))).rejects.toThrow('manifest.json')
    await expect(zipSource(await make({ 'manifest.json': JSON.stringify({ format: 'other', formatVersion: '1.1.0', language: 'xx', resources: [] }) }))).rejects.toThrow('bt-synergy-language-pack')
    await expect(zipSource(await make({ 'manifest.json': JSON.stringify({ format: 'bt-synergy-language-pack', formatVersion: '2.0.0', language: 'xx', resources: [] }) }))).rejects.toThrow('2.0.0')
    await expect(zipSource(new Uint8Array([1, 2, 3]))).rejects.toThrow()
  })

  test('zipSource: a manifest that counts rows the zip lacks', async () => {
    const zip = new JSZip()
    zip.file('manifest.json', JSON.stringify({ format: 'bt-synergy-language-pack', formatVersion: '1.1.0', language: 'xx', kind: 'language', layers: ['sot'], resources: [{ key: 'o/xx/r', role: 'language', stamp: 's', rows: { sot: 1 } }] }))
    const source = await zipSource(await zip.generateAsync({ type: 'uint8array' }))
    await expect(collect(source.rows({ lang: 'xx' }))).rejects.toThrow('o/xx/r')
  })
})

describe('zip: the book of a row, from its key', () => {
  const RES = 'o_gl/xx/tn'
  const SCRIPTURE = 'o_gl/xx/glt'
  const WORDS = 'o_gl/xx/tw'
  async function pack(manifest: Record<string, unknown>, rows: Record<string, Array<[string, unknown]>>): Promise<RowSource> {
    const zip = new JSZip()
    zip.file('manifest.json', JSON.stringify({ format: 'bt-synergy-language-pack', formatVersion: '1.1.0', language: 'xx', layers: [], ...manifest }))
    for (const [file, list] of Object.entries(rows)) zip.file(`rows/${file}.jsonl`, list.map(([key, entry]) => JSON.stringify({ key, entry })).join('\n') + '\n')
    return zipSource(await zip.generateAsync({ type: 'uint8array' }))
  }
  const enc = (key: string) => encodeURIComponent(key).replace(/%/g, '~')

  test('book-scoped resources: source rows, prepared rows, quotes and aligned quotes; others have none', async () => {
    const source = await pack(
      {
        kind: 'language',
        resources: [
          { key: RES, role: 'language', stamp: 'a', subject: 'TSV Translation Notes', rows: { sot: 2, prepared: 2, quote: 2, align: 1 }, books: ['rut', 'tit'] },
          { key: SCRIPTURE, role: 'language', stamp: 'b', subject: 'Aligned Bible', rows: { sot: 3 }, books: ['rut', 'tit'] },
          { key: WORDS, role: 'language', stamp: 'c', subject: 'Translation Words', rows: { sot: 1, prepared: 1, text: 1 } },
        ],
      },
      {
        [`sot/${enc(RES)}`]: [[`tn:${RES}:tit`, 1], [`tn:${RES}:rut:1`, 2]],
        [`prepared/${enc(RES)}`]: [[`prepared:notes:${RES}:tit:1:full`, 3], [`prepared:notes:${RES}:RUT:1:light`, 4]],
        [`quote/${enc(RES)}`]: [[`helps-quote:${RES}@g1:o/el/ugnt@g2+2.3.0-usj:tit:1`, 5], [`helps-quote:${RES}@g1:o/el/ugnt@g2+2.3.0-usj:rut:2`, 6]],
        [`align/${enc(RES)}`]: [[`helps-align:${RES}@g1:o/el/ugnt@g2+2.3.0-usj:${SCRIPTURE}@g3+1:rut:1`, 7]],
        [`sot/${enc(SCRIPTURE)}`]: [[`scripture-usj:${SCRIPTURE}:tit`, 8], [`scripture-usj:${SCRIPTURE}:tit:0`, 9], [`scripture-usj:${SCRIPTURE}:rut`, 10]],
        [`sot/${enc(WORDS)}`]: [[`${WORDS}/bible/kt/grace`, 11]],
        [`prepared/${enc(WORDS)}`]: [[`prepared:words:${WORDS}:bible/kt/grace:bible/kt/grace:full`, 12]],
        [`text/${enc(WORDS)}`]: [[`helps-text:tw-title:${WORDS}@v1:kt/grace`, 13]],
      },
    )
    const keys = async (f: Parameters<RowSource['rows']>[0]) => (await collect(source.rows(f))).map((r) => r.key)
    expect(await keys({ lang: 'xx', book: 'tit' })).toEqual([
      `tn:${RES}:tit`,
      `prepared:notes:${RES}:tit:1:full`,
      `helps-quote:${RES}@g1:o/el/ugnt@g2+2.3.0-usj:tit:1`,
      `scripture-usj:${SCRIPTURE}:tit`,
      `scripture-usj:${SCRIPTURE}:tit:0`,
    ])
    expect(await keys({ lang: 'xx', book: 'rut' })).toEqual([
      `tn:${RES}:rut:1`,
      `prepared:notes:${RES}:RUT:1:light`,
      `helps-quote:${RES}@g1:o/el/ugnt@g2+2.3.0-usj:rut:2`,
      `helps-align:${RES}@g1:o/el/ugnt@g2+2.3.0-usj:${SCRIPTURE}@g3+1:rut:1`,
      `scripture-usj:${SCRIPTURE}:rut`,
    ])
    // tW: its keys are not about a book, whatever their parts look like.
    expect(await keys({ lang: 'xx', resource: WORDS })).toEqual([`${WORDS}/bible/kt/grace`, `prepared:words:${WORDS}:bible/kt/grace:bible/kt/grace:full`, `helps-text:tw-title:${WORDS}@v1:kt/grace`])
    expect(await keys({ lang: 'xx', resource: WORDS, book: 'bible/kt/grace' })).toEqual([])
    expect(await keys({ lang: 'xx', book: 'bible' })).toEqual([])
    // Resources and books of a pack that carries everything: what its manifest says.
    const refs = byKey(await source.resources('xx'))
    expect(refs.get(RES)).toEqual({ key: RES, stamp: 'a', kind: 'TSV Translation Notes', books: ['rut', 'tit'] })
    expect(refs.get(WORDS)).toEqual({ key: WORDS, stamp: 'c', kind: 'Translation Words', books: [] })
  })

  test('books a pack carries: a book pack, a base pack and a pack with originals', async () => {
    const resource = { key: RES, role: 'language', stamp: 'a', subject: 'TSV Translation Notes', rows: { sot: 1 }, books: ['jon', 'rut', 'tit'] }
    const book = await pack({ kind: 'book', books: ['rut', 'tit'], resources: [resource] }, { [`sot/${enc(RES)}`]: [[`tn:${RES}:tit`, 1]] })
    expect((await book.resources('xx'))[0].books).toEqual(['rut', 'tit'])
    const base = await pack({ kind: 'base', resources: [{ ...resource, rows: {} }] }, {})
    expect((await base.resources('xx'))[0].books).toEqual([])
    const both = await pack(
      { kind: 'language', resources: [resource, { key: 'o/el/ugnt', role: 'original', stamp: 'u', subject: 'Greek New Testament', rows: { sot: 1 }, books: ['tit'] }] },
      { [`sot/${enc(RES)}`]: [[`tn:${RES}:tit`, 1]], [`sot/${enc('o/el/ugnt')}`]: [['scripture-usj:o/el/ugnt:tit', 2]] },
    )
    expect((await both.resources('xx')).map((r) => r.key)).toEqual([RES])
    expect((await both.resources('originals')).map((r) => r.key)).toEqual(['o/el/ugnt'])
    expect((await collect(both.rows({ lang: 'originals' }))).map((r) => r.key)).toEqual(['scripture-usj:o/el/ugnt:tit'])
  })
})

describe('lines of a part file', () => {
  const a = { layer: 'sot', key: 'k:1', value: { n: 1 } }
  const b = { layer: 'prepared', key: 'k:2', value: 'text\nwith a break' }
  const jsonl = (rows: object[], eol: string) => rows.map((row) => JSON.stringify(row)).join(eol)

  test('LF and CRLF end a line, the last line needs no end, blank lines are skipped', () => {
    expect(lines('a\nb\n')).toEqual(['a', 'b'])
    expect(lines('a\nb')).toEqual(['a', 'b'])
    expect(lines('a\r\nb\r\n')).toEqual(['a', 'b'])
    expect(lines('a\r\nb')).toEqual(['a', 'b'])
    expect(lines('a\r\n\r\nb\n\n')).toEqual(['a', 'b'])
    expect(lines('a\n\r\n \r\nb')).toEqual(['a', 'b'])
    expect(lines('')).toEqual([])
    expect(lines('\r\n')).toEqual([])
  })

  test('partRows reads a part whose lines end in CRLF, or in nothing', () => {
    const rows = [a, b]
    const texts = [
      jsonl(rows, '\n'),
      jsonl(rows, '\n') + '\n',
      jsonl(rows, '\r\n'),
      jsonl(rows, '\r\n') + '\r\n',
      jsonl(rows, '\r\n\r\n') + '\r\n',
    ]
    for (const text of texts) expect(partRows(gzip(new TextEncoder().encode(text)))).toEqual(rows)
    // A break inside a value is escaped in JSONL, so it never splits a row.
    expect(partRows(gzip(new TextEncoder().encode(jsonl([b], '\r\n'))))[0].value).toBe('text\nwith a break')
  })
})
