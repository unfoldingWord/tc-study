import { describe, expect, test } from 'bun:test'
import { partsProgressView } from './partsProgressView'

describe('partsProgressView', () => {
  test('nothing downloading: nothing to show', () => {
    expect(partsProgressView({})).toBeNull()
  })

  test('one language: its unit and parts done, and the percent', () => {
    expect(partsProgressView({ en: { unit: 'shared', done: 31, total: 124 } })).toEqual({
      label: 'Downloading parts: en shared 31/124',
      percent: 25,
    })
  })

  test('several languages: each one, and the percent of all their parts', () => {
    expect(
      partsProgressView({ en: { unit: 'book tit', done: 3, total: 10 }, 'es-419': { unit: 'shared', done: 1, total: 10 } })
    ).toEqual({ label: 'Downloading parts: en book tit 3/10 · es-419 shared 1/10', percent: 20 })
  })
})
