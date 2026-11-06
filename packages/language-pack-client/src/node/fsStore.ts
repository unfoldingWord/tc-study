import { mkdir, readdir, readFile, rename, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { ClientError } from '../errors'
import { isStoreId, type BlobStore, type InstalledState } from '../store/types'

function check(id: string): void {
  if (!isStoreId(id)) throw new ClientError('E_ARG', 'segment id must be 64 lowercase hex')
}

const isNotFound = (e: unknown) => (e as { code?: string })?.code === 'ENOENT'

function storeError(e: unknown): ClientError {
  return new ClientError('E_STORE', e instanceof Error ? e.message : String(e))
}

export function fsStore(dir: string): BlobStore {
  const path = (id: string) => join(dir, 'seg', id.slice(0, 2), id)
  const statePath = join(dir, 'state.json')
  return {
    async has(id) {
      if (!isStoreId(id)) return false
      try {
        await readFile(path(id))
        return true
      } catch (e) {
        if (isNotFound(e)) return false
        throw storeError(e)
      }
    },
    async get(id) {
      if (!isStoreId(id)) return undefined
      try {
        return new Uint8Array(await readFile(path(id)))
      } catch (e) {
        if (isNotFound(e)) return undefined
        throw storeError(e)
      }
    },
    async put(id, bytes) {
      check(id)
      try {
        const p = path(id)
        await mkdir(join(dir, 'seg', id.slice(0, 2)), { recursive: true })
        await writeFile(p + '.tmp', bytes)
        await rename(p + '.tmp', p)
      } catch (e) {
        throw storeError(e)
      }
    },
    async delete(id) {
      check(id)
      try {
        await rm(path(id), { force: true })
      } catch (e) {
        throw storeError(e)
      }
    },
    async ids() {
      try {
        const out: string[] = []
        for (const d of await readdir(join(dir, 'seg'))) {
          for (const f of await readdir(join(dir, 'seg', d))) if (isStoreId(f)) out.push(f)
        }
        return out
      } catch (e) {
        if (isNotFound(e)) return []
        throw storeError(e)
      }
    },
    async getState() {
      try {
        return JSON.parse(await readFile(statePath, 'utf8')) as InstalledState
      } catch (e) {
        if (isNotFound(e)) return undefined
        throw storeError(e)
      }
    },
    async setState(state) {
      try {
        await mkdir(dir, { recursive: true })
        await writeFile(statePath + '.tmp', JSON.stringify(state))
        await rename(statePath + '.tmp', statePath)
      } catch (e) {
        throw storeError(e)
      }
    },
  }
}
