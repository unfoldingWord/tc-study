/**
 * A row source over format 2.0 parts on a disk (Node only): a parts list (`catalog/<compat>/<language>.json`) and the
 * folder of the part files it names. The order of the rows, the filters and `lang` are in `source/rows.ts`.
 */

import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { partRows, type ResourceRef, type Row, type RowFilter, type RowSource } from '../source/rows'

type ListPart = { sha256: string; kind: string; resource: string; book?: string; group?: string; layers: string[] }
type ListResource = { key: string; stamp: string; subject?: string }
type List = { language: string; resources: ListResource[]; parts: ListPart[] }

/** The parts list at `path`: `schema 2`, with the fields this source reads. The rest of the list (`code`, `units`...) is not read. */
async function readList(path: string): Promise<List> {
  let list: Partial<List> & { schema?: unknown }
  try {
    list = JSON.parse(await readFile(path, 'utf8'))
  } catch (error) {
    throw new Error(`Cannot read the parts list ${path}: ${(error as Error).message}`)
  }
  if (list?.schema !== 2 || typeof list.language !== 'string' || !Array.isArray(list.parts) || !Array.isArray(list.resources)) {
    throw new Error(`${path} is not a parts list (schema 2 with a language, resources and parts)`)
  }
  for (const part of list.parts) {
    if (typeof part.sha256 !== 'string' || typeof part.resource !== 'string' || !Array.isArray(part.layers)) {
      throw new Error(`${path}: a part needs a sha256, a resource and its layers`)
    }
  }
  for (const resource of list.resources) {
    if (typeof resource.key !== 'string' || typeof resource.stamp !== 'string' || resource.stamp === '') {
      throw new Error(`${path}: a resource needs a key and a stamp`)
    }
  }
  return list as List
}

/**
 * - `list`: the parts list of a language, e.g. `es-419/list.json`;
 * - `partsDir`: the folder that holds `<sha256>.part.gz` for every part the lists name;
 * - `originals`: the originals list, for `lang: 'originals'` (without it the source has no originals).
 *
 * A part is checked against its name (the sha256 of its bytes) when it is read; one that is missing, or does not match,
 * fails the sequence that reaches it, naming the part.
 */
export async function partsSource(o: { list: string; partsDir: string; originals?: string }): Promise<RowSource> {
  const lists: List[] = [await readList(o.list)]
  if (o.originals) lists.push(await readList(o.originals))
  // The language list says `es-419`; the originals list says `originals`.
  const listOf = (lang: string): List | undefined => lists.find((list) => list.language === lang)

  async function readPart(part: ListPart): Promise<Row[]> {
    const name = `${part.sha256}.part.gz`
    const what = `Part ${part.sha256} (${part.kind} of ${part.resource}${part.book ? ` ${part.book}` : ''})`
    let bytes: Uint8Array
    try {
      bytes = await readFile(join(o.partsDir, name))
    } catch (error) {
      throw new Error(`${what} cannot be read from ${o.partsDir}: ${(error as Error).message}`)
    }
    if (createHash('sha256').update(bytes).digest('hex') !== part.sha256) throw new Error(`${what} does not match its sha256: the file is damaged`)
    try {
      return partRows(bytes)
    } catch (error) {
      throw new Error(`${what} is not a part file: ${(error as Error).message}`)
    }
  }

  async function* rows(f: RowFilter): AsyncGenerator<Row> {
    const list = listOf(f.lang)
    if (!list) return
    // `layers` of a part is the layers it holds (a test of the sample checks it), so a part without the layer is not opened.
    const parts = list.parts.filter(
      (part) =>
        (f.resource === undefined || part.resource === f.resource) &&
        (f.book === undefined || part.book === f.book) &&
        (f.layer === undefined || part.layers.includes(f.layer)),
    )
    for (const part of parts) {
      for (const row of await readPart(part)) {
        if (f.layer === undefined || row.layer === f.layer) yield row
      }
    }
  }

  return {
    rows,
    async resources(lang) {
      const list = listOf(lang)
      if (!list) return []
      return list.resources.map((resource): ResourceRef => {
        // The books this source has parts for, which a trimmed list holds fewer of than the resource's own `books`.
        const books = new Set<string>()
        for (const part of list.parts) if (part.resource === resource.key && part.book) books.add(part.book)
        return { key: resource.key, stamp: resource.stamp, kind: resource.subject ?? '', books: [...books].sort() }
      })
    },
  }
}
