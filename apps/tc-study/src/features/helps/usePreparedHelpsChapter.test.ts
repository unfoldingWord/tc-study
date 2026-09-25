import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { resolvePreparedHelpsReload } from './usePreparedHelpsChapter'

describe('resolvePreparedHelpsReload', () => {
  test('chapter change with already-loaded book notes skips refetch', () => {
    expect(
      resolvePreparedHelpsReload({
        hasBookPayload: true,
        spanChanged: true,
        hadPreviousSpan: true,
      })
    ).toEqual({ clearRows: false, pending: false, skipFetch: true })
  })

  test('first-load without notes stays on the pending fetch path', () => {
    expect(
      resolvePreparedHelpsReload({
        hasBookPayload: false,
        spanChanged: true,
        hadPreviousSpan: false,
      })
    ).toEqual({ clearRows: true, pending: true, skipFetch: false })
  })

  test('first-load with book payload still hydrates prepared cache', () => {
    expect(
      resolvePreparedHelpsReload({
        hasBookPayload: true,
        spanChanged: true,
        hadPreviousSpan: false,
      })
    ).toEqual({ clearRows: true, pending: false, skipFetch: false })
  })

  test('same-span payload arrival heals without tearing down', () => {
    expect(
      resolvePreparedHelpsReload({
        hasBookPayload: true,
        spanChanged: false,
        hadPreviousSpan: true,
      })
    ).toEqual({ clearRows: false, pending: false, skipFetch: false })
  })
})

describe('prepared helps hooks skip chapter refetch when book notes exist', () => {
  test('usePreparedHelpsChapter wires resolvePreparedHelpsReload', () => {
    const src = readFileSync(join(import.meta.dir, 'usePreparedHelpsChapter.ts'), 'utf8')
    expect(src).toContain('resolvePreparedHelpsReload')
    expect(src).toContain('skipFetch')
    expect(src).toContain('hadPreviousSpan: Boolean(spanRef.current)')
  })
})
