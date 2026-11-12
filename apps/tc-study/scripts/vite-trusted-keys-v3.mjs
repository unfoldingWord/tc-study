import { existsSync, readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { loadEnv } from 'vite'

const here = path.dirname(fileURLToPath(import.meta.url))
const folder = path.resolve(here, '../../../packages/language-pack-v3/keys')

/**
 * Reads the `*.pub` public keys of `language-pack-v3/keys/` at build time and exposes them as the constant
 * `__TC_V3_KEYS__` (`{ <key id = file name>: <64 hex chars> }`). No key is copied into source. A staging build
 * (`VITE_TCS_PACKS=staging`) with no key fails: it could trust no catalog. Shared by vite.config.js and .ts.
 */
export function trustedKeysV3() {
  return {
    name: 'tc-study-trusted-keys-v3',
    config(_, env) {
      const keys = {}
      for (const file of existsSync(folder) ? readdirSync(folder).filter((f) => f.endsWith('.pub')).sort() : []) {
        keys[file.slice(0, -'.pub'.length)] = readFileSync(path.join(folder, file), 'utf8').trim()
      }
      const staging = loadEnv(env.mode, path.resolve(here, '..'), 'VITE_').VITE_TCS_PACKS === 'staging' || process.env.VITE_TCS_PACKS === 'staging'
      if (!Object.keys(keys).length && staging && env.command === 'build') {
        throw new Error(`No *.pub keys in ${folder}: a staging build (VITE_TCS_PACKS=staging) would trust no format 3 catalog`)
      }
      return { define: { __TC_V3_KEYS__: JSON.stringify(keys) } }
    },
  }
}
