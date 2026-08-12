import { afterEach, describe, expect, test } from 'bun:test'

import { resolveUseUsjPipeline } from '../src/resolveUseUsjPipeline'

const ENV_KEYS = ['USE_USJ_PIPELINE', 'VITE_USE_USJ_PIPELINE'] as const

afterEach(() => {
  for (const k of ENV_KEYS) {
    delete process.env[k]
  }
})

describe('resolveUseUsjPipeline', () => {
  test('defaults to false when unset', () => {
    expect(resolveUseUsjPipeline()).toBe(false)
    expect(resolveUseUsjPipeline(undefined)).toBe(false)
  })

  test('explicit option wins over env', () => {
    process.env.USE_USJ_PIPELINE = '1'
    expect(resolveUseUsjPipeline(false)).toBe(false)
    expect(resolveUseUsjPipeline(true)).toBe(true)
  })

  test('reads USE_USJ_PIPELINE env', () => {
    process.env.USE_USJ_PIPELINE = 'true'
    expect(resolveUseUsjPipeline()).toBe(true)
    process.env.USE_USJ_PIPELINE = '0'
    expect(resolveUseUsjPipeline()).toBe(false)
  })

  test('reads VITE_USE_USJ_PIPELINE when USE_USJ unset', () => {
    process.env.VITE_USE_USJ_PIPELINE = '1'
    expect(resolveUseUsjPipeline()).toBe(true)
  })
})
