import { describe, expect, test } from 'bun:test'
import { adapterOf, buildPatch, licenseOf, type PatchSource } from './patch'

const info = { licenses: [{ eng: { name: 'CC BY-SA 4.0 License' } }], copyright: { dates: '2022', holder: { name: 'unfoldingWord' } } }

describe('licenseOf', () => {
  test('the adapter is a parameter and defaults to Mission Mutual', () => {
    expect(licenseOf(info, 'k').rights).toBe('© 2022 unfoldingWord; adapted by Mission Mutual')
    expect(licenseOf(info, 'k', 'Other Org').rights).toBe('© 2022 unfoldingWord; adapted by Other Org')
  })
})

describe('adapterOf', () => {
  test('reads the adapter from the notice when it names one', () => {
    expect(adapterOf('<p>Notes © 2022 unfoldingWord. <cite>Notes</cite> adapted &amp; released by Mission Mutual</p>')).toBe('Mission Mutual')
    expect(adapterOf('<p>Adapted by Some Group.</p>')).toBe('Some Group')
    expect(adapterOf('<p>Questions by Mission Mutual</p>')).toBeUndefined()
  })
})

describe('buildPatch attribution', () => {
  test('an empty adaptation_notice throws: the attribution never vanishes', async () => {
    const source: PatchSource = {
      repo: 'R',
      commit: 'abc',
      metadata: { title: 'T', license_info: info, adaptation_notice: '<p> </p>' },
      books: new Map([['tit', [{ content_id: 1, name: 'n', content: [], associations: {} } as never]]]),
    }
    await expect(
      buildPatch({
        lang: 'hi',
        source: 'aquifer',
        tn: source,
        taMap: new Map(),
        base: { tn: [], tq: [] },
        origs: new Map([['tit', ['orig:tit', 'stamp']]]),
        common: { revision: 1, id: '0'.repeat(64) },
        about: { revision: 1, built: '2026-01-01T00:00:00Z', publisher: 'p' },
      }),
    ).rejects.toThrow(/adaptation_notice is empty/)
  })
})
