import { expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { loadComplement } from './complements'

const bytes = (s: string): Uint8Array => new TextEncoder().encode(s)

test('a numbers file loads', () => {
  const r = loadComplement(new Uint8Array(readFileSync(join(import.meta.dir, '../complements/es.numbers.json'))))
  expect(r.ok).toBe(true)
  if (r.ok && r.value.kind === 'numbers') expect(r.value.words.once).toBe(11)
})

test('a file for other queries, or that is not JSON, is refused and never thrown', () => {
  const other = loadComplement(bytes('{"kind":"numbers","lang":"es","version":"x","for":"queries/2","words":{}}'))
  expect(other).toEqual({ ok: false, problem: { code: 'E_COMPLEMENT', kind: 'numbers', lang: 'es', message: expect.any(String) } })
  const junk = loadComplement(bytes('{nope'))
  expect(junk.ok).toBe(false)
  if (!junk.ok) expect(junk.problem.code).toBe('E_COMPLEMENT')
  expect(loadComplement(new Uint8Array([0xff, 0xfe])).ok).toBe(false)
})

test('a classifier is validated', () => {
  const ok = { kind: 'classifier', lang: 'es', version: 'v', for: 'queries/1', labels: ['passage', 'concept'], vocab: ['a', 'b', 'c'], counts: [[1, 0, 2], [0, 1, 1]], totals: [3, 2], docs: [2, 1] }
  expect(loadComplement(bytes(JSON.stringify(ok))).ok).toBe(true)
  expect(loadComplement(bytes(JSON.stringify({ ...ok, counts: [[1, 0]] }))).ok).toBe(false)
  expect(loadComplement(bytes(JSON.stringify({ ...ok, kind: 'other' }))).ok).toBe(false)
})
