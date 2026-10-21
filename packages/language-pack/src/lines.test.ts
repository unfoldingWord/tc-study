import { describe, expect, it, test } from 'bun:test'
import JSZip from 'jszip'
import { chunksOf, linesFrom } from './lines'

async function* from(chunks: Uint8Array[]): AsyncIterable<Uint8Array> {
  for (const chunk of chunks) yield chunk
}

async function collect(gen: AsyncIterable<string>): Promise<string[]> {
  const out: string[] = []
  for await (const line of gen) out.push(line)
  return out
}

describe('lines of a stream of bytes', () => {
  test('a Hebrew word split between two chunks is decoded whole', async () => {
    const bytes = new TextEncoder().encode('{"w":"קָנִ֔יתָה"}\n{"w":"x"}\n')
    const cut = 9 // inside the second letter's bytes
    expect(await collect(linesFrom(from([bytes.slice(0, cut), bytes.slice(cut)])))).toEqual(['{"w":"קָנִ֔יתָה"}', '{"w":"x"}'])
  })
  test('the last line without a newline, and a line longer than a chunk, both come', async () => {
    const text = 'a'.repeat(100) + '\nlast'
    const bytes = new TextEncoder().encode(text)
    const chunks = Array.from({ length: Math.ceil(bytes.length / 7) }, (_, i) => bytes.slice(i * 7, i * 7 + 7))
    expect(await collect(linesFrom(from(chunks)))).toEqual(['a'.repeat(100), 'last'])
  })
  test('blank lines are skipped', async () => {
    expect(await collect(linesFrom(from([new TextEncoder().encode('x\n\n\ny\n')])))).toEqual(['x', 'y'])
  })
})

describe('the chunks of a file inside a zip', () => {
  it('give back the file whole, a line at a time, even when the consumer is slow', async () => {
    const lines = Array.from({ length: 2000 }, (_, i) => JSON.stringify({ n: i, w: 'קָנִ֔יתָה' }))
    const zip = new JSZip()
    zip.file('layer.jsonl', lines.join('\n') + '\n')
    const loaded = await JSZip.loadAsync(await zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE' }))
    const got: string[] = []
    for await (const line of linesFrom(chunksOf(loaded.file('layer.jsonl')!))) {
      if (got.length % 500 === 0) await new Promise((resolve) => setTimeout(resolve, 1))
      got.push(line)
    }
    expect(got).toEqual(lines)
  })
  it('fail when the file cannot be read', async () => {
    const zip = new JSZip()
    zip.file('layer.jsonl', 'x'.repeat(1000))
    const bytes = await zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE' })
    // Garbage in place of the entry's compressed bytes: the directory still lists it, but it cannot be inflated.
    const loaded = await JSZip.loadAsync(bytes)
    const file = loaded.file('layer.jsonl')!
    ;(file as unknown as { _data: { compressedContent?: Uint8Array } })._data.compressedContent = new Uint8Array([0xff, 0xff, 0xff])
    await expect(collect(linesFrom(chunksOf(file)))).rejects.toThrow(/invalid|incorrect|corrupt|data|block|stored/i)
  })
})
