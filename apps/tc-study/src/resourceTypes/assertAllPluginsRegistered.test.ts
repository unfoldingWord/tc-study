import { describe, expect, test } from 'bun:test'
import {
  assertAllCompositionsRegistered,
  assertAllPanelEntriesRegistered,
  assertAllPluginsRegistered,
  collectRequiredPluginDefs,
} from './assertAllPluginsRegistered'

describe('assertAllPluginsRegistered', () => {
  test('passes when every expected id is registered', () => {
    expect(() =>
      assertAllPluginsRegistered(['scripture', 'obs'], ['obs', 'scripture', 'extra'])
    ).not.toThrow()
  })

  test('throws listing missing ids (fail-closed)', () => {
    expect(() => assertAllPluginsRegistered(['a', 'b', 'c'], ['a'])).toThrow(
      /incomplete; missing ids: b, c/
    )
  })

  test('empty expected set always passes', () => {
    expect(() => assertAllPluginsRegistered([], [])).not.toThrow()
    expect(() => assertAllPluginsRegistered([], ['x'])).not.toThrow()
  })
})

describe('assertAllCompositionsRegistered', () => {
  test('passes when every expected composition id is registered', () => {
    expect(() =>
      assertAllCompositionsRegistered(['combined-helps'], ['combined-helps', 'extra'])
    ).not.toThrow()
  })

  test('throws listing missing composition ids (fail-closed)', () => {
    expect(() => assertAllCompositionsRegistered(['combined-helps', 'obs-combined-helps'], [])).toThrow(
      /Composition registration incomplete; missing ids: combined-helps, obs-combined-helps/
    )
  })
})

describe('assertAllPanelEntriesRegistered', () => {
  test('throws listing missing panel entry ids (fail-closed)', () => {
    expect(() =>
      assertAllPanelEntriesRegistered(['combined-helps', 'questions'], ['combined-helps'])
    ).toThrow(/Panel entry registration incomplete; missing ids: questions/)
  })
})

describe('collectRequiredPluginDefs', () => {
  test('returns defs when all exports are valid', () => {
    const plugins = {
      scriptureResourceType: { id: 'scripture' },
      obsResourceType: { id: 'obs' },
    }
    const defs = collectRequiredPluginDefs(
      ['scriptureResourceType', 'obsResourceType'],
      plugins
    )
    expect(defs.map((d) => d.id)).toEqual(['scripture', 'obs'])
  })

  test('throws on missing export (no silent skip)', () => {
    expect(() =>
      collectRequiredPluginDefs(['scriptureResourceType', 'missingType'], {
        scriptureResourceType: { id: 'scripture' },
      })
    ).toThrow(/missing or invalid: missingType/)
  })

  test('throws on export without id', () => {
    expect(() =>
      collectRequiredPluginDefs(['broken'], { broken: { loader: true } })
    ).toThrow(/missing or invalid: broken/)
  })

  test('throws on empty-string id', () => {
    expect(() =>
      collectRequiredPluginDefs(['empty'], { empty: { id: '' } })
    ).toThrow(/missing or invalid: empty/)
  })
})
