import { describe, expect, test } from 'bun:test'
import { filesOfTarball, manifestOf } from './tarball'
import { chunks, fileHeader, gzipSync, tar, tarGz } from './tarball.fixture'

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

describe('filesOfTarball refuses what is not a whole tarball', () => {
  const files: [string, string][] = [['people/json/a.json', 'x'.repeat(700)], ['people/json/b.json', 'y']]
  test('a body that is not gzip', async () => {
    await expect(filesOfTarball(chunks(new TextEncoder().encode('<html>not a tarball</html>')), 'people/json/')).rejects.toThrow()
  })
  test('a tarball cut inside an entry', async () => {
    const whole = tar('r', files)
    const cut = new Uint8Array(gzipSync(whole.subarray(0, 512 * 6 + 100)))
    await expect(filesOfTarball(chunks(cut), 'people/json/')).rejects.toThrow('cut short')
  })
  test('a size field that is not octal', async () => {
    const t = tar('r', files)
    const at = t.findIndex((_, i) => i % 512 === 0 && new TextDecoder().decode(t.subarray(i, i + 20)).startsWith('r/people/json/a.json'))
    t.set(new TextEncoder().encode('zzzzzzzzzzz'), at + 124)
    await expect(filesOfTarball(chunks(new Uint8Array(gzipSync(t))), 'people/json/')).rejects.toThrow('is not octal')
  })
  test('a body that fails half way', async () => {
    const gz = tarGz('r', files)
    async function* failing(): AsyncIterable<Uint8Array> {
      yield gz.subarray(0, 40)
      throw new Error('the connection dropped')
    }
    await expect(filesOfTarball(failing(), 'people/json/')).rejects.toThrow('the connection dropped')
  })
  test('a big file outside the folder is skipped, not held', async () => {
    const big = new Uint8Array(3 * 1024 * 1024)
    const got = await filesOfTarball(chunks(tarGz('r', [['assets/big.bin', big], ['people/json/b.json', 'y']]), 65536), 'people/json/')
    expect([...got.keys()]).toEqual(['people/json/b.json'])
  })
  test('a header of exactly 512 bytes of body (no padding)', async () => {
    const body = new Uint8Array(512).fill(65)
    const t = new Uint8Array([...fileHeader('r/people/json/c.json', 512), ...body, ...new Uint8Array(1024)])
    const got = await filesOfTarball(chunks(new Uint8Array(gzipSync(t))), 'people/json/')
    expect(got.get('people/json/c.json')!.length).toBe(512)
  })
})

test('manifestOf: one line per file, sorted by path', () => {
  const m = manifestOf(new Map([['b', new Uint8Array([1])], ['a', new Uint8Array(0)]]))
  expect(m).toBe('a\te3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855\nb\t4bf5122f344554c53bde2ebb8cd2b7e3d1600ad631c385a5d7cce23c7785459a\n')
})
