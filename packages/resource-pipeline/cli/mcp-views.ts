/**
 * Views for a server that answers about a passage (translation-helps-mcp): from a language's pack, one small JSON
 * file per book and chapter with its notes, word links and questions, each note and link with its words in the
 * language's literal and simple bridge texts already found, and the titles of the articles they point to.
 *
 *   bun packages/resource-pipeline/cli/mcp-views.ts --pack <folder>/es-419.langpack.zip --out <folder>
 *
 * A server reads `v1/{lang}/notes/{BOOK}/{chapter}.json` and filters it: no zip, no TSV, no tokenizing, and nothing of
 * bt-synergy's cache formats. The original-language pack is not needed: the alignments travel in the language's pack.
 *
 * Writes in `--out`:
 *   v1/{lang}/index.json                       the sources (keys, titles, versions) and the chapters of each book
 *   v1/{lang}/notes/{BOOK}/{chapter}.json      the chapter's notes, intros included, each with its aligned words
 *   v1/{lang}/word-links/{BOOK}/{chapter}.json the chapter's word links, each with its aligned words and its title
 *   v1/{lang}/questions/{BOOK}/{chapter}.json  the chapter's questions
 */

import 'fake-indexeddb/auto'
import { requireFreshBuilds } from './freshBuilds'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { writeMcpViews } from '../src/language/writeMcpViews'

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`)
  return i >= 0 ? process.argv[i + 1] : undefined
}

const packPath = arg('pack')
if (!packPath) {
  console.error('Uso: mcp-views --pack <idioma>.langpack.zip --out <carpeta>')
  process.exit(2)
}
// Packs made with code compiled before its last change are not this code's packs.
requireFreshBuilds(['@bt-synergy/resource-pipeline', '@bt-synergy/language-pack', '@bt-synergy/cache-adapter-indexeddb', '@bt-synergy/catalog-adapter-indexeddb'])

await writeMcpViews({ pack: readFileSync(resolve(packPath)), outDir: arg('out') ?? '.', log: console.log })
