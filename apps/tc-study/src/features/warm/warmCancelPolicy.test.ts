import { describe, expect, test } from 'bun:test'
import { shouldCancelWarmJobsForLanguage } from './warmCancelPolicy'

describe('shouldCancelWarmJobsForLanguage', () => {
  test('keeps warm jobs when the other pane still uses that language', () => {
    expect(
      shouldCancelWarmJobsForLanguage({
        previousLanguage: 'en',
        nextTextLanguage: 'es',
        nextHelpsLanguage: 'en',
      })
    ).toBe(false)
    expect(
      shouldCancelWarmJobsForLanguage({
        previousLanguage: 'en',
        nextTextLanguage: 'en',
        nextHelpsLanguage: 'es',
      })
    ).toBe(false)
  })

  test('cancels when neither pane still uses that language', () => {
    expect(
      shouldCancelWarmJobsForLanguage({
        previousLanguage: 'en',
        nextTextLanguage: 'es',
        nextHelpsLanguage: 'es',
      })
    ).toBe(true)
  })

  test('empty previous language is a no-op', () => {
    expect(
      shouldCancelWarmJobsForLanguage({
        previousLanguage: '',
        nextTextLanguage: 'es',
        nextHelpsLanguage: 'en',
      })
    ).toBe(false)
  })
})
