import { describe, expect, test } from 'bun:test'
import { helpsLoadErrorView } from './helpsLoadErrorView'

describe('helpsLoadErrorView', () => {
  test('helps that could not be fetched with no network are "not on this device"', () => {
    expect(helpsLoadErrorView('Failed to fetch')).toEqual({ kind: 'not-on-device' })
    expect(helpsLoadErrorView('Failed to fetch: this device is offline')).toEqual({ kind: 'not-on-device' })
    expect(helpsLoadErrorView('Invalid TSV at line 5')).toEqual({ kind: 'error', message: 'Invalid TSV at line 5' })
  })

  test('a server answer or another failure stays an error with its message', () => {
    expect(helpsLoadErrorView('tn_RUT.tsv: 404 Not Found')).toEqual({ kind: 'error', message: 'tn_RUT.tsv: 404 Not Found' })
    expect(helpsLoadErrorView('Parse failed at line 3')).toEqual({ kind: 'error', message: 'Parse failed at line 3' })
  })
})
