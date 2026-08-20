/**
 * Read a fetch Response body into an ArrayBuffer, optionally reporting byte progress.
 * Falls back to response.arrayBuffer() when the body stream is unavailable.
 */

export type ByteProgressCallback = (progress: {
  loaded: number
  total: number
  percentage: number
}) => void

/** Known length → real %; chunked zipballs (no Content-Length) ease toward 90%. */
export function zipBytePercentage(loaded: number, total: number): number {
  if (total > 0) {
    return Math.min(100, Math.round((loaded / total) * 100))
  }
  if (loaded <= 0) return 0
  return Math.min(90, Math.round((loaded / (loaded + 1_048_576)) * 90))
}

export async function readResponseArrayBufferWithProgress(
  response: Response,
  onProgress?: ByteProgressCallback,
  onChunk?: () => void
): Promise<ArrayBuffer> {
  const totalHeader = Number(response.headers.get('Content-Length') || 0)
  const total = Number.isFinite(totalHeader) && totalHeader > 0 ? totalHeader : 0

  if (!onProgress || !response.body) {
    return response.arrayBuffer()
  }

  const reader = response.body.getReader()
  const chunks: Uint8Array[] = []
  let loaded = 0

  onProgress({
    loaded: 0,
    total,
    percentage: 0,
  })

  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    if (value) {
      chunks.push(value)
      loaded += value.byteLength
      onChunk?.()
      onProgress({
        loaded,
        total,
        percentage: zipBytePercentage(loaded, total),
      })
    }
  }

  const merged = new Uint8Array(loaded)
  let offset = 0
  for (const chunk of chunks) {
    merged.set(chunk, offset)
    offset += chunk.byteLength
  }
  return merged.buffer
}
