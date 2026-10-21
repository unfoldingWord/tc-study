/**
 * Reading a layer of a pack a line at a time.
 *
 * The originals' UHB layer is 82 MB unzipped. Held as one string and split, a 2 GB phone runs out of memory; read
 * from the zip's stream, only a chunk and the line being built are alive.
 */

import type JSZip from 'jszip'

/** JSZip's StreamHelper. Its typings leave out `internalStream`, which is documented in its API. */
interface ZipStream {
  on(event: 'data', handler: (chunk: Uint8Array) => void): ZipStream
  on(event: 'end', handler: () => void): ZipStream
  on(event: 'error', handler: (error: unknown) => void): ZipStream
  pause(): ZipStream
  resume(): ZipStream
}

/** The non-empty lines of a stream of UTF-8 bytes. A character cut between two chunks is decoded whole. */
export async function* linesFrom(chunks: AsyncIterable<Uint8Array>): AsyncGenerator<string> {
  const decoder = new TextDecoder('utf-8')
  let tail = ''
  for await (const chunk of chunks) {
    const parts = (tail + decoder.decode(chunk, { stream: true })).split('\n')
    tail = parts.pop()!
    for (const line of parts) if (line.trim()) yield line
  }
  tail += decoder.decode()
  if (tail.trim()) yield tail
}

/** The bytes of a file in a zip, chunk by chunk. The stream runs only while the consumer is waiting for the next one. */
export async function* chunksOf(file: JSZip.JSZipObject): AsyncGenerator<Uint8Array> {
  const stream = (file as unknown as { internalStream(type: 'uint8array'): ZipStream }).internalStream('uint8array')
  const queue: Uint8Array[] = []
  let ended = false
  let failure: unknown
  let wake: (() => void) | null = null
  const notify = () => {
    const resolve = wake
    wake = null
    resolve?.()
  }
  stream.on('data', (chunk: Uint8Array) => {
    queue.push(chunk)
    stream.pause()
    notify()
  })
  stream.on('end', () => {
    ended = true
    notify()
  })
  stream.on('error', (error: unknown) => {
    failure = error ?? new Error('Could not read a file of the pack.')
    notify()
  })
  try {
    while (true) {
      if (failure) throw failure
      const next = queue.shift()
      if (next) {
        yield next
        continue
      }
      if (ended) return
      await new Promise<void>((resolve) => {
        wake = resolve
        stream.resume()
      })
    }
  } finally {
    stream.pause()
  }
}
