import { describe, expect, test } from 'bun:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import type { ImportPackResult, PackManifest } from '@bt-synergy/language-pack'
import { LanguagePackResult } from './LanguagePackResult'
import type { OpenedPack } from './openLanguagePacks'

const ULT = 'es-419_gl/es-419/glt'
const TN = 'es-419_gl/es-419/tn'
const TQ = 'es-419_gl/es-419/tq'
const UGNT = 'unfoldingWord/el-x-koine/ugnt'

function manifest(overrides: Partial<PackManifest>): PackManifest {
  return {
    format: 'bt-synergy-language-pack',
    formatVersion: '1.1.0',
    language: 'es-419',
    createdAt: '2026-10-01T00:00:00Z',
    layers: ['receipt', 'sot', 'prepared', 'quote'],
    resources: [],
    ...overrides,
  }
}

function result(overrides: Partial<ImportPackResult>): ImportPackResult {
  return {
    manifest: manifest({}),
    written: 10,
    keptExisting: 0,
    byLayer: {},
    skippedLayers: [],
    originals: [],
    skippedResources: [],
    droppedRows: {},
    ...overrides,
  }
}

const render = (opened: OpenedPack[]) =>
  renderToStaticMarkup(createElement(LanguagePackResult, { progress: null, opened }))

describe('LanguagePackResult', () => {
  test('says what a book pack opened, what it left out and what is still missing', () => {
    const html = render([
      {
        name: 'es-419-tit.langpack.zip',
        kind: 'book',
        ms: 1200,
        result: result({
          manifest: manifest({
            kind: 'book',
            books: ['tit'],
            resources: [
              { key: ULT, role: 'language', stamp: 'v42#x', rows: { sot: 4, prepared: 3 } },
              { key: TN, role: 'language', stamp: 'v66#x', rows: { sot: 2, quote: 5 } },
              { key: TQ, role: 'language', stamp: 'v12#x', rows: { sot: 2 } },
            ],
          }),
          skippedLayers: ['quote'],
          originals: [{ key: UGNT, stamp: 'v0.34#x', status: 'missing' }],
          skippedResources: [{ key: TQ, why: 'el aparato tiene otra versión (v11#y)' }],
        }),
      },
    ])

    expect(html).toContain('es-419')
    expect(html).toContain('GLT')
    expect(html).toContain('TN')
    expect(html).toContain('TIT')
    expect(html).toContain('Quotes will be prepared again on this device')
    expect(html).toContain('UGNT is missing: open the originals pack too')
    expect(html).toContain('TQ: kept as it was on this device')
  })

  test('lists the languages of an originals pack', () => {
    const html = render([
      {
        name: 'originals.langpack.zip',
        kind: 'originals',
        ms: 900,
        result: result({
          manifest: manifest({
            kind: 'originals',
            language: 'originals',
            resources: [
              { key: UGNT, role: 'original', stamp: 'a', rows: { receipt: 1, sot: 30 } },
              { key: 'unfoldingWord/hbo/uhb', role: 'original', stamp: 'b', rows: { receipt: 1, sot: 40 } },
            ],
          }),
        }),
      },
    ])

    expect(html).toContain('el-x-koine')
    expect(html).toContain('hbo')
    expect(html).toContain('UHB')
    expect(html).not.toContain('missing')
  })

  test('says why a pack was refused', () => {
    const html = render([{ name: 'old.langpack.zip', refused: 'other-version', detail: 'sot' }])

    expect(html).toContain('old.langpack.zip')
    expect(html).toContain('Made with another version of the app')
  })

  test('shows the progress of the pack being opened', () => {
    const html = renderToStaticMarkup(
      createElement(LanguagePackResult, {
        progress: { name: 'es-419.langpack.zip', index: 1, count: 2, done: 50, total: 200 },
        opened: null,
      })
    )

    expect(html).toContain('es-419.langpack.zip')
    expect(html).toContain('role="progressbar"')
    expect(html).toContain('aria-valuenow="25"')
  })
})
