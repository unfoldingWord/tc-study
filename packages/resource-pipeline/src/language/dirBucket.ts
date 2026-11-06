import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { dirname, isAbsolute, join } from 'node:path'
import type { PackBucket } from './publishLanguage'

/** A bucket in a folder: `<root>/<key>`. For local runs and tests; a key with `..` or an absolute key is refused. */
export function dirBucket(root: string): PackBucket {
  const path = (key: string): string => {
    if (key === '' || isAbsolute(key) || key.split(/[\\/]/).includes('..')) throw new Error(`Refused bucket key: ${JSON.stringify(key)}`)
    return join(root, key)
  }
  const bytes = (key: string): Uint8Array | null => {
    const file = path(key)
    return existsSync(file) ? new Uint8Array(readFileSync(file)) : null
  }
  return {
    async getJson<T>(key: string) {
      const body = bytes(key)
      return body === null ? null : (JSON.parse(new TextDecoder().decode(body)) as T)
    },
    async has(key) {
      return existsSync(path(key))
    },
    async stat(key) {
      const file = path(key)
      return existsSync(file) ? { uploaded: statSync(file).mtime } : null
    },
    async getBytes(key) {
      return bytes(key)
    },
    async put(key, body) {
      const file = path(key)
      mkdirSync(dirname(file), { recursive: true })
      writeFileSync(file, body)
    },
  }
}
