import { describe, expect, test } from 'bun:test'
import {
  readResponseArrayBufferWithProgress,
  zipBytePercentage,
} from './readResponseArrayBufferWithProgress'

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

  test('chunked responses without Content-Length still report rising percent', async () => {
    const updates: Array<{ loaded: number; percentage: number }> = []
    const chunk = new Uint8Array(512 * 1024)
    await readResponseArrayBufferWithProgress(
      streamResponse([chunk, chunk]),
      (p) => updates.push({ loaded: p.loaded, percentage: p.percentage })
    )

    expect(updates[0]?.percentage).toBe(0)
    expect(updates.at(-1)?.percentage).toBeGreaterThan(0)
    expect(updates.at(-1)?.percentage).toBeLessThanOrEqual(90)
  })

  test('zipBytePercentage eases unknown length toward 90 and uses real totals', () => {
    expect(zipBytePercentage(0, 0)).toBe(0)
    expect(zipBytePercentage(1_048_576, 0)).toBe(45)
    expect(zipBytePercentage(3, 10)).toBe(30)
  })
})
