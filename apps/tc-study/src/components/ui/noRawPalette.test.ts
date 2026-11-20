import { describe, expect, test } from 'bun:test'
import { expectNoRawPalette } from './noRawPalette.test-helper'

describe('expectNoRawPalette', () => {
  test('flags ring-gray-500 and outline-red-500 like the global freeze', () => {
    expect(() => expectNoRawPalette('inline-flex ring-gray-500')).toThrow()
    expect(() => expectNoRawPalette('outline outline-red-500')).toThrow()
  })

  test('allows token utility classes', () => {
    expectNoRawPalette('bg-surface text-fg border-border')
  })
})
