import { describe, expect, test } from 'bun:test'
import { filesOfTarball, manifestOf } from './tarball'
import { chunks, tarGz } from './tarball.fixture'

const dec = (b: Uint8Array | undefined): string => new TextDecoder().decode(b)
const LONG = `people/json/${'A'.repeat(120)}.json`

describe('filesOfTarball', () => {
  for (const gnuLong of [false, true]) {
    test(`keeps the files under the prefix, across chunks, with long names (${gnuLong ? 'GNU L' : 'pax'})`, async () => {
      const gz = tarGz('ACAI-0123', [
        ['README.md', 'not kept'],
        ['people/json/Isaac.json', '{"id":"person:Isaac"}'],
        ['people/json/Empty.json', ''],
        [LONG, '{"id":"person:Long"}'],
        ['people/md/Isaac.md', 'not kept'],
      ], gnuLong)
      const files = await filesOfTarball(chunks(gz), 'people/json/')
      expect([...files.keys()].sort()).toEqual(['people/json/Empty.json', 'people/json/Isaac.json', LONG].sort())
      expect(dec(files.get('people/json/Isaac.json'))).toBe('{"id":"person:Isaac"}')
      expect(dec(files.get(LONG))).toBe('{"id":"person:Long"}')
      expect(files.get('people/json/Empty.json')!.length).toBe(0)
    })
  }
  test('one chunk gives the same files', async () => {
    const gz = tarGz('r', [['people/json/a.json', 'x'.repeat(1500)]])
    expect(dec((await filesOfTarball(chunks(gz, gz.length), 'people/json/')).get('people/json/a.json'))).toBe('x'.repeat(1500))
  })
})

test('manifestOf: one line per file, sorted by path', () => {
  const m = manifestOf(new Map([['b', new Uint8Array([1])], ['a', new Uint8Array(0)]]))
  expect(m).toBe('a\te3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855\nb\t4bf5122f344554c53bde2ebb8cd2b7e3d1600ad631c385a5d7cce23c7785459a\n')
})
