import { describe, expect, test } from 'bun:test'
import { helpsLoadErrorView } from './helpsLoadErrorView'

describe('helpsLoadErrorView', () => {
  test('helps that could not be fetched with no network are "not on this device"', () => {
    expect(helpsLoadErrorView('Failed to fetch', true)).toEqual({ kind: 'not-on-device' })
    expect(helpsLoadErrorView('Anything at all', false)).toEqual({ kind: 'not-on-device' })
  })

  test('a server answer or another failure stays an error with its message', () => {
    expect(helpsLoadErrorView('tn_RUT.tsv: 404 Not Found', true)).toEqual({ kind: 'error', message: 'tn_RUT.tsv: 404 Not Found' })
    expect(helpsLoadErrorView('Parse failed at line 3', true)).toEqual({ kind: 'error', message: 'Parse failed at line 3' })
  })
})
