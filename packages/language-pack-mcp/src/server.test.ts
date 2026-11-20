import { expect, test } from 'bun:test'
import { hitLine } from './server'

test('a search line names the book and reference of a verse hit', () => {
  expect(hitLine({ kind: 'text', book: 'tit', ref: '1:1', snippet: 'a  «b»\nc' })).toBe('Titus 1:1 [text] a «b» c')
})

test('a section hit prints its id, not an empty book and reference', () => {
  const line = hitLine({ kind: 'section', book: '', ref: '', id: 'tw:kt/grace#definition', snippet: 'el «favor»' })
  expect(line).toBe('tw:kt/grace#definition [section] el «favor»')
})
