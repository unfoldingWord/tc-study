import { describe, expect, test } from 'bun:test'
import { readResponseArrayBufferWithProgress } from './readResponseArrayBufferWithProgress'

function streamResponse(chunks: Uint8Array[], contentLength?: number): Response {
  const headers = new Headers()
  if (contentLength != null) {
    headers.set('Content-Length', String(contentLength))
  }
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(chunk)
      controller.close()
    },
  })
  return new Response(stream, { headers })
}

describe('readResponseArrayBufferWithProgress', () => {
  test('reports byte progress while streaming', async () => {
    const updates: Array<{ loaded: number; total: number; percentage: number }> = []
    const a = new Uint8Array([1, 2, 3])
    const b = new Uint8Array([4, 5])
    const buf = await readResponseArrayBufferWithProgress(
      streamResponse([a, b], 5),
      (p) => updates.push({ ...p })
    )

    expect(new Uint8Array(buf)).toEqual(new Uint8Array([1, 2, 3, 4, 5]))
    expect(updates[0]).toEqual({ loaded: 0, total: 5, percentage: 0 })
    expect(updates.at(-1)).toEqual({ loaded: 5, total: 5, percentage: 100 })
    expect(updates.some((u) => u.loaded === 3 && u.percentage === 60)).toBe(true)
  })

  test('falls back to arrayBuffer when no progress callback', async () => {
    const buf = await readResponseArrayBufferWithProgress(
      new Response(new Uint8Array([9, 8, 7]))
    )
    expect(new Uint8Array(buf)).toEqual(new Uint8Array([9, 8, 7]))
  })
})
