import { describe, expect, test } from 'bun:test'
import { runDownload, type DownloadThreadMessage } from './runDownload'

function memoryStore() {
  const rows = new Map<string, unknown>()
  return {
    rows,
    async get(key: string) {
      return rows.get(key) ?? null
    },
    async set(key: string, entry: unknown) {
      rows.set(key, entry)
    },
    async delete(key: string) {
      rows.delete(key)
    },
    async has(key: string) {
      return rows.has(key)
    },
    async getAll() {
      return [...rows.keys()]
    },
    async clear() {
      rows.clear()
    },
  }
}

describe('runDownload sin pantalla', () => {
  test('arma el catálogo y los cargadores con los almacenes que recibe y avisa el principio y el fin', async () => {
    const messages: DownloadThreadMessage[] = []
    await runDownload({
      resourceKeys: [],
      skipExisting: true,
      runId: 7,
      post: (m) => messages.push(m),
      isCurrentRun: () => true,
      cacheAdapter: memoryStore() as never,
      catalogAdapter: memoryStore() as never,
      door43Client: {},
    })
    expect(messages.map((m) => m.type)).toEqual(['queue-updated', 'complete'])
    expect(messages.every((m) => m.runId === 7)).toBe(true)
  })

  test('un recurso que el catálogo no conoce se salta sin escribir nada', async () => {
    const cache = memoryStore()
    const messages: DownloadThreadMessage[] = []
    await runDownload({
      resourceKeys: ['nadie/xx/tn'],
      skipExisting: true,
      runId: 1,
      post: (m) => messages.push(m),
      isCurrentRun: () => true,
      cacheAdapter: cache as never,
      catalogAdapter: memoryStore() as never,
      door43Client: { getResourceMetadata: async () => null },
    })
    expect(messages.map((m) => m.type)).toEqual(['queue-updated', 'complete'])
    expect(cache.rows.size).toBe(0)
  })
})
