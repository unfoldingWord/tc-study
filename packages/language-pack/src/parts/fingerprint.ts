/**
 * Fingerprints (spec §2): what a part or a unit was built from, as one sha256. The build computes them from the bytes
 * it holds, the Worker from Door43's tree, tc-study's app from its own files, so every rule here is plain and exact:
 * git blob shas, one manifest normalization, one stable JSON, Web Crypto only.
 */

import { sha256Hex, stableJson } from './partFile'

/** Bumped when the rules below change: every fingerprint changes with it. */
export const FINGERPRINT_VERSION = 1

const hex = (digest: ArrayBuffer) => Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('')

/** `sha1("blob <byte length>\0" + bytes)`: the sha Door43's git tree gives the file, with no download. */
export async function gitBlobSha(bytes: Uint8Array): Promise<string> {
  const header = new TextEncoder().encode(`blob ${bytes.length}\0`)
  const all = new Uint8Array(header.length + bytes.length)
  all.set(header, 0)
  all.set(bytes, header.length)
  return hex(await globalThis.crypto.subtle.digest('SHA-1', all))
}

/** Lines of `dublin_core` a release bumps without changing anything a pack holds. */
const RELEASE_KEYS = new Set(['version', 'modified', 'issued'])

const blankOrComment = (line: string) => line === '' || /^ *#/.test(line)
const indentOf = (line: string) => line.length - line.trimStart().length
/** A scalar that YAML would read as something else, or that runs on: `|`, `>`, flow, anchors, aliases, tags. */
const NOT_PLAIN = /^[|>[{&*!]/

/**
 * A relation item without its `?v=…`, or null when the item is not one plain or quoted scalar on its line.
 * `'hbo/uhb?v=2.1.30'` → `'hbo/uhb'`.
 */
function relationItem(line: string): string | null {
  const m = line.match(/^( *- +)(.*)$/)
  if (!m) return null
  const value = m[2]
  const quoted = /^'[^']*(?:''[^']*)*'$/.test(value) || /^"[^"\\]*(?:\\.[^"\\]*)*"$/.test(value)
  if (!quoted && (value === '' || /^['"]/.test(value) || NOT_PLAIN.test(value) || /:( |$)/.test(value))) return null
  const q = quoted ? value[0] : ''
  const inner = quoted ? value.slice(1, -1) : value
  return `${m[1]}${q}${inner.replace(/\?v=.*$/, '')}${q}`
}

/** The normalized lines, or null when the manifest is not in the shape the rule knows. */
function normalizedLines(lines: string[]): string[] | null {
  const heads = lines.flatMap((line, i) => (line.startsWith('dublin_core:') ? [i] : []))
  if (heads.length !== 1 || !/^dublin_core:( +#.*)?$/.test(lines[heads[0]])) return null
  const start = heads[0]
  let end = start + 1
  while (end < lines.length && (blankOrComment(lines[end]) || lines[end].startsWith(' ') || lines[end].startsWith('\t'))) end++
  const block = lines.slice(start + 1, end)
  if (block.some((line) => /^ *\t/.test(line))) return null
  const first = block.find((line) => !blankOrComment(line))
  if (first === undefined) return lines
  const child = indentOf(first)

  // Each key directly under dublin_core, with the lines that follow it until the next such key.
  const entries: Array<{ key: string; value: string; lines: string[] }> = []
  for (const line of block) {
    if (!blankOrComment(line)) {
      const indent = indentOf(line)
      if (indent < child) return null
      const own = line.slice(child)
      if (indent === child && !own.startsWith('-')) {
        const m = own.match(/^([A-Za-z_][\w-]*):(?: +(.*))?$/)
        if (!m) return null
        entries.push({ key: m[1], value: (m[2] ?? '').replace(/ +#.*$/, ''), lines: [line] })
        continue
      }
    }
    if (!entries.length) {
      if (blankOrComment(line)) continue
      return null
    }
    entries[entries.length - 1].lines.push(line)
  }

  const out = lines.slice(0, start + 1).concat(block.slice(0, block.indexOf(entries[0].lines[0])))
  for (const entry of entries) {
    const body = entry.lines.slice(1)
    const content = body.filter((line) => !blankOrComment(line))
    if (RELEASE_KEYS.has(entry.key)) {
      // Only a one-line scalar: dropping the first line of anything longer would keep the rest.
      if (entry.value === '' || NOT_PLAIN.test(entry.value) || content.length) return null
      out.push(...body)
    } else if (entry.key === 'relation') {
      if (entry.value !== '') {
        if (entry.value.includes('?v=')) return null
        out.push(...entry.lines)
        continue
      }
      out.push(entry.lines[0])
      for (const line of body) {
        if (blankOrComment(line)) out.push(line)
        else {
          const item = relationItem(line)
          if (item === null) return null
          out.push(item)
        }
      }
    } else out.push(...entry.lines)
  }
  return out.concat(lines.slice(end))
}

/**
 * The manifest as a fingerprint reads it: CRLF turned to LF, trailing spaces and tabs dropped, the `version:`,
 * `modified:` and `issued:` lines directly under the top-level `dublin_core:` dropped, and `?v=…` taken off the items of
 * `dublin_core.relation`. A manifest in any other shape is returned as it is: a rebuild too many, never a missed change.
 */
export function normalizeManifest(text: string): string {
  const lines = text
    .replace(/\r\n/g, '\n')
    .split('\n')
    .map((line) => line.replace(/[ \t]+$/, ''))
  return normalizedLines(lines)?.join('\n') ?? text
}

/** The sha256 (hex) of the normalized manifest's UTF-8. */
export async function manifestFingerprint(text: string): Promise<string> {
  return sha256Hex(new TextEncoder().encode(normalizeManifest(text)))
}

export type FingerprintInputs = {
  /** `[resource key, repository path, git blob sha]`. */
  files: Array<[string, string, string]>
  /** `[resource key, manifestFingerprint]`. */
  manifests: Array<[string, string]>
  /** `[resource key, release stamp]`, for parts whose rows carry the release in their keys. */
  stamps: Array<[string, string]>
}

function compareTuples(a: readonly string[], b: readonly string[]): number {
  for (let i = 0; i < Math.min(a.length, b.length); i++) {
    if (a[i] !== b[i]) return a[i] < b[i] ? -1 : 1
  }
  return a.length - b.length
}

function uniqueSorted<T extends readonly string[]>(rows: readonly T[]): T[] {
  const byText = new Map<string, T>()
  for (const row of rows) byText.set(JSON.stringify(row), [...row] as unknown as T)
  return [...byText.values()].sort(compareTuples)
}

/** Inputs given in any order, with duplicates, become one sorted list each. */
export function canonicalInputs(inputs: FingerprintInputs): FingerprintInputs {
  return { files: uniqueSorted(inputs.files), manifests: uniqueSorted(inputs.manifests), stamps: uniqueSorted(inputs.stamps) }
}

/**
 * sha256 (hex) of the stable JSON of `{ v, code, id, files, manifests, stamps }`. `code` is the parts compat key (the
 * code's versions), `id` the slot id or unit id, so two parts with the same files still differ.
 */
export async function fingerprintOf(o: { code: string; id: string; inputs: FingerprintInputs }): Promise<string> {
  const inputs = canonicalInputs(o.inputs)
  return sha256Hex(new TextEncoder().encode(stableJson({ v: FINGERPRINT_VERSION, code: o.code, id: o.id, ...inputs })))
}
