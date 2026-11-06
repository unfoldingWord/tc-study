import { expect, test } from 'bun:test'
import { emptyState } from './state'

test('emptyState is a fresh v1 value each time', () => {
  expect(emptyState()).toEqual({ v: 1, published: {}, active: {}, units: {} })
  expect(emptyState()).not.toBe(emptyState())
})
