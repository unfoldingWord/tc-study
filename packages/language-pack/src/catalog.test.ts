import { expect, test } from 'bun:test'
import { buildIdOf, catalogEntryOf, catalogPath, compatKeyOf, packPath } from './catalog'
import { PACK_FORMAT, PACK_FORMAT_VERSION, type PackManifest, type PackVersions } from './types'

const VERSIONS: PackVersions = {
  sot: { usjProcessing: '2.3.0-usj' },
  prepared: { scripturePrepare: 6000230 },
  quote: { helpsQuote: 8 },
  align: { helpsAlign: 11 },
  text: { helpsText: 1 },
}

test('the compatibility key names the format and the five versions', () => {
  expect(compatKeyOf('1.1.0', VERSIONS)).toBe('f1.1-u2.3.0-p6000230-q8-a11-t1')
})

test('a pack without one of the versions has no compatibility key', () => {
  expect(() => compatKeyOf('1.1.0', { sot: { usjProcessing: '2.3.0-usj' } })).toThrow()
})

test('the build id changes with the generator, and not with the order of the stamps', async () => {
  const stamps = { 'es-419_gl/es-419/glt': 'v42#2026-10-01', 'unfoldingWord/hbo/uhb': 'v3.0.0#2026-08-14' }
  const a = await buildIdOf({ generator: 'aaa', stamps })
  expect(await buildIdOf({ generator: 'aaa', stamps: Object.fromEntries(Object.entries(stamps).reverse()) })).toBe(a)
  expect(await buildIdOf({ generator: 'bbb', stamps })).not.toBe(a)
  expect(a).toMatch(/^[0-9a-f]{16}$/)
})

test('the paths of the catalog and of the pack follow the compatibility key and the language', () => {
  expect(catalogPath('f1.1-u2.3.0-p6000230-q8-a11-t1', 'es-419')).toBe('catalog/f1.1-u2.3.0-p6000230-q8-a11-t1/es-419.json')
  expect(packPath('f1.1-u2.3.0-p6000230-q8-a11-t1', 'originals', 'abc')).toBe(
    'packs/f1.1-u2.3.0-p6000230-q8-a11-t1/originals/abc.langpack.zip',
  )
})

test('the entry names its pack by content, its resources with stamps, and what was left out', async () => {
  const manifest: PackManifest = {
    format: PACK_FORMAT,
    formatVersion: PACK_FORMAT_VERSION,
    language: 'es-419',
    kind: 'language',
    requires: [{ key: 'unfoldingWord/hbo/uhb', stamp: 'v3.0.0#2026-08-14' }],
    createdAt: '2026-10-20T10:00:00.000Z',
    layers: ['receipt', 'sot'],
    versions: VERSIONS,
    resources: [
      { key: 'es-419_gl/es-419/glt', role: 'language', stamp: 'v42#2026-10-01', subject: 'Aligned Bible', rows: { sot: 3 } },
      { key: 'es-419_gl/es-419/tn', role: 'language', stamp: 'v7#2026-09-02', rows: { sot: 2 } },
    ] as PackManifest['resources'],
  }
  const compat = compatKeyOf(manifest.formatVersion, manifest.versions!)
  const build = { id: await buildIdOf({ generator: 'g1', stamps: {} }), generator: 'g1', stamps: {} }
  const bytes = new Uint8Array([1, 2, 3, 4, 5])
  const left = [{ key: 'es-419_gl/es-419/gst', why: 'no tiene est' }]

  const entry = catalogEntryOf({ manifest, compat, build, bytes, sha256: 'deadbeef', left })

  expect(entry.schema).toBe(1)
  expect(entry.language).toBe('es-419')
  expect(entry.compat).toBe(compat)
  expect(entry.build).toEqual(build)
  expect(entry.createdAt).toBe(manifest.createdAt)
  expect(entry.pack.path).toBe(`packs/${compat}/es-419/deadbeef.langpack.zip`)
  expect(entry.pack.bytes).toBe(5)
  expect(entry.pack.sha256).toBe('deadbeef')
  expect(entry.versions).toEqual(manifest.versions!)
  expect(entry.requires).toEqual(manifest.requires!)
  expect(entry.resources).toEqual([
    { key: 'es-419_gl/es-419/glt', stamp: 'v42#2026-10-01', subject: 'Aligned Bible' },
    { key: 'es-419_gl/es-419/tn', stamp: 'v7#2026-09-02', subject: undefined },
  ])
  expect(entry.left).toContainEqual({ key: 'es-419_gl/es-419/gst', why: 'no tiene est' })
  expect(entry.views).toBeUndefined()
})
