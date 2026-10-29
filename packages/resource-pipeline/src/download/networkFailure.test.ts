import { describe, expect, test } from 'bun:test'
import { Door43ApiError } from '@bt-synergy/door43-api'
import { isNetworkFailure, isOffline } from './networkFailure'

describe('isNetworkFailure', () => {
  test('anything that fails while the device says it is offline', () => {
    expect(isNetworkFailure(new Error('Cannot read properties of undefined'), false)).toBe(true)
  })

  test('offline, a failure that carries an HTTP status still stays an error: the server did answer', () => {
    expect(isNetworkFailure(new Error('tn_TIT.tsv: 404 Not Found'), false)).toBe(false)
    expect(isNetworkFailure(new Error('Failed to fetch content from https://git.door43.org/x: 404 Not Found'), false)).toBe(false)
    const http = new Door43ApiError('Failed to fetch repo tree: 500 Internal Server Error', { code: 'HTTP_ERROR', status: 500 })
    expect(isNetworkFailure(http, false)).toBe(false)
  })

  test('fetch rejecting with no network (Chrome, Firefox, Safari)', () => {
    expect(isNetworkFailure(new TypeError('Failed to fetch'), true)).toBe(true)
    expect(isNetworkFailure(new TypeError('NetworkError when attempting to fetch resource.'), true)).toBe(true)
    expect(isNetworkFailure(new TypeError('Load failed'), true)).toBe(true)
  })

  test("Door43's client wrapping a fetch that never got an answer", () => {
    const wrapped = new Door43ApiError('Failed to fetch content', { code: 'NETWORK_ERROR' })
    expect(isNetworkFailure(wrapped, true)).toBe(true)
    expect(isNetworkFailure(new Door43ApiError('Failed to fetch', { code: 'NETWORK_ERROR' }), true)).toBe(true)
  })

  test('a number in a language code or a URL is not an HTTP status', () => {
    expect(isNetworkFailure(new Error('es-419_gl/es-419/tn: Failed to fetch'), true)).toBe(true)
    expect(isNetworkFailure(new Error('https://git.door43.org/es-419_gl/es-419_tn/archive/v66.zip: Load failed'), true)).toBe(true)
  })

  test('a download that wraps the network failure in its own message, or as its cause', () => {
    expect(isNetworkFailure(new Error('Zip download failed: Failed to fetch'), true)).toBe(true)
    expect(isNetworkFailure(new Error('Download failed', { cause: new TypeError('Failed to fetch') }), true)).toBe(true)
  })

  test('the server answered: an HTTP status is not a network failure', () => {
    expect(isNetworkFailure(new Error('Failed to fetch content from https://git.door43.org/x: 404 Not Found'), true)).toBe(false)
    const http = new Door43ApiError('Failed to fetch repo tree: 500 Internal Server Error', { code: 'HTTP_ERROR', status: 500 })
    expect(isNetworkFailure(http, true)).toBe(false)
  })

  test('a bug or a timeout stays an error', () => {
    expect(isNetworkFailure(new TypeError("Cannot read properties of undefined (reading 'books')"), true)).toBe(false)
    expect(isNetworkFailure(new Door43ApiError('Request timeout after 30000ms', { code: 'TIMEOUT' }), true)).toBe(false)
    expect(isNetworkFailure('Failed', true)).toBe(false)
  })

  test('with no online flag (Node), only the error decides', () => {
    expect(isNetworkFailure(new TypeError('Failed to fetch'))).toBe(true)
    expect(isNetworkFailure(new Error('boom'))).toBe(false)
  })
})

describe('isOffline', () => {
  test('only a navigator that says offline is offline', () => {
    expect(isOffline({ onLine: false })).toBe(true)
    expect(isOffline({ onLine: true })).toBe(false)
    expect(isOffline(undefined)).toBe(false)
  })
})
