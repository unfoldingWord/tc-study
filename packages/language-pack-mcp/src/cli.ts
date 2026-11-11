#!/usr/bin/env node
/**
 * `tc-packs-mcp`: the local MCP server over STDIO. Packs are kept in a folder (default `~/.tc-language-packs`), so after
 * `install_language` every tool answers with no network. Settings come from the environment:
 *   TC_PACKS_DIR     where the packs are kept
 *   TC_PACKS_SERVER  where they are downloaded from (default: the staging Worker)
 *   TC_PACKS_KEYS    trusted publisher keys, "keyId:hex,keyId:hex" (default: the staging publisher key)
 *   TC_PACKS_LANG    the language to use when a call names none (default: the last one installed)
 * Nothing is written to stdout but the protocol; messages go to stderr.
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { createClient, httpSource } from '@bt-synergy/language-pack-client'
import { fsStore } from '@bt-synergy/language-pack-client/node/fsStore'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { createPacksServer } from './server'

const VERSION = '0.1.0'
/** The staging publisher key (`language-pack-v3/keys/78d2e6299a2de4d0.pub`). Production needs its own. */
const STAGING_KEYS = '78d2e6299a2de4d0:c2057cec32b948452849e7fcba6af323961a091ea82645eb297bb368e1c8d911'
const STAGING_SERVER = 'https://translation-helps-mcp-v2-preview.unfoldingword.workers.dev'

if (process.argv.includes('--help') || process.argv.includes('-h')) {
  process.stderr.write(
    `tc-packs-mcp ${VERSION}: a local MCP server over tC Language Packs (format 3), on STDIO.\n` +
      'Add it to an MCP host (Cursor, Claude Desktop, Atomic Chat…) as the command "node" with this file as its argument.\n' +
      'Environment: TC_PACKS_DIR, TC_PACKS_SERVER, TC_PACKS_KEYS, TC_PACKS_LANG.\n',
  )
  process.exit(0)
}

export function parseKeys(spec: string): Record<string, Uint8Array> {
  const keys: Record<string, Uint8Array> = {}
  for (const entry of spec.split(',').map((s) => s.trim()).filter(Boolean)) {
    const [id, hex] = entry.split(':')
    if (!id || !hex || !/^[0-9a-f]{64}$/i.test(hex)) throw new Error(`TC_PACKS_KEYS: "${entry}" is not keyId:64 hex digits`)
    keys[id] = Uint8Array.from(hex.match(/../g)!, (p) => parseInt(p, 16))
  }
  return keys
}

const dir = process.env.TC_PACKS_DIR || join(homedir(), '.tc-language-packs')
await mkdir(dir, { recursive: true })
const langFile = join(dir, 'last-language.txt')

const client = createClient({
  store: fsStore(join(dir, 'store')),
  source: httpSource({ base: process.env.TC_PACKS_SERVER || STAGING_SERVER }),
  trust: { trustedKeys: parseKeys(process.env.TC_PACKS_KEYS || STAGING_KEYS) },
})

const server = createPacksServer({
  client,
  version: VERSION,
  loadLang: async () => process.env.TC_PACKS_LANG || (await readFile(langFile, 'utf8').then((s) => s.trim(), () => undefined)) || undefined,
  saveLang: async (lang) => writeFile(langFile, lang + '\n', 'utf8'),
})

await server.connect(new StdioServerTransport())
process.stderr.write(`tc-packs-mcp ${VERSION} ready. Packs in ${dir}.\n`)
