import { ClientError } from '../errors'
import { isStoreId, type BlobStore, type InstalledState } from './types'

function check(id: string): void {
  if (!isStoreId(id)) throw new ClientError('E_ARG', 'segment id must be 64 lowercase hex')
}

export function memoryStore(): BlobStore {
  const blobs = new Map<string, Uint8Array>()
  let state: InstalledState | undefined
  return {
    async has(id) {
      return blobs.has(id)
    },
    async get(id) {
      return blobs.get(id)
    },
    async put(id, bytes) {
      check(id)
      blobs.set(id, bytes)
    },
    async delete(id) {
      check(id)
      blobs.delete(id)
    },
    async ids() {
      return [...blobs.keys()]
    },
    async getState() {
      return state === undefined ? undefined : structuredClone(state)
    },
    async setState(s) {
      state = structuredClone(s)
    },
  }
}
