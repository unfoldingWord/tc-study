import { describe, expect, test } from 'bun:test'
import { applyScriptureContentLoadFailure, NOT_ON_DEVICE } from './scriptureContentLoad'

/** As ScriptureLoader wraps a load that could not reach Door43. */
function wrapped(cause: Error): Error {
  const error = new Error(`Scripture content not available for es-419_gl/es-419/glt/rut: ${cause.message}.`)
  ;(error as Error & { cause?: unknown }).cause = cause
  return error
}

describe('applyScriptureContentLoadFailure', () => {
  test('a book that is not on the device and could not be fetched is "not on this device", not an error', () => {
    const failure = applyScriptureContentLoadFailure(wrapped(new TypeError('Failed to fetch')), true)
    expect(failure).toEqual({ error: NOT_ON_DEVICE, isLoading: false, retryWhenMetadataArrives: false })
  })

  test('a server answer (404) or another failure stays an error with its message', () => {
    const failure = applyScriptureContentLoadFailure(wrapped(new Error('rut.usfm: 404 Not Found')), true)
    expect(failure.error).toContain('404 Not Found')
  })

  test('a metadata miss before the catalog lands still waits for it', () => {
    const failure = applyScriptureContentLoadFailure(new Error('Resource metadata not found: x'), false)
    expect(failure.retryWhenMetadataArrives).toBe(true)
  })
})
