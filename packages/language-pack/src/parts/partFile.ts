/**
 * A part file (spec §3): `parts/<sha256>.part.gz`, gzip of JSONL rows `{"layer","key","value"}`. The same rows always
 * give the same bytes, so an unchanged part keeps its name and is never uploaded or downloaded again.
 */

import { gzip, ungzip } from 'pako'
import type { PackLayer } from '../types'

export type PartRow = { layer: PackLayer; key: string; value: unknown }

/** Dates set when a row is written or read; the importing app sets `timestamp`/`expiresAt` again (`restartLifetime`). */
export const VOLATILE_FIELDS: readonly string[] = ['timestamp', 'expiresAt', 'processingDate', 'downloadCompletedAt', 'cachedAt', 'catalogedAt']

const VOLATILE = new Set(VOLATILE_FIELDS)

/** Receipts never travel in parts: the list says when a resource is complete. `index` is optional (`OPTIONAL_LAYERS`). */
export const PART_LAYERS: readonly PackLayer[] = ['sot', 'prepared', 'quote', 'align', 'text', 'index']

/** What JSON.stringify would write for the value: `toJSON` first (a Date becomes its ISO text). */
export function toJsonValue(value: unknown): unknown {
  const toJSON = value && typeof value === 'object' ? (value as { toJSON?: unknown }).toJSON : undefined
  return typeof toJSON === 'function' ? toJSON.call(value) : value
}

export function stripVolatile(input: unknown): unknown {
  const value = toJsonValue(input)
  if (Array.isArray(value)) return value.map(stripVolatile)
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (!VOLATILE.has(k)) out[k] = stripVolatile(v)
    }
    return out
  }
  return value
}

/** JSON with object keys sorted at every depth (code-unit order, not locale). */
export function stableJson(input: unknown): string {
  const value = toJsonValue(input)
  if (Array.isArray(value)) return `[${value.map((v) => (v === undefined ? 'null' : stableJson(v))).join(',')}]`
  if (value && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${stableJson(v)}`).join(',')}}`
  }
  return JSON.stringify(value) ?? 'null'
}

function layerRank(layer: PackLayer): number {
  const rank = PART_LAYERS.indexOf(layer)
  if (rank < 0) throw new Error(`A part does not carry ${layer} rows`)
  return rank
}

/**
 * pako, pinned, rather than node:zlib: zlib's deflate output differs between runtimes (Bun and Node give different
 * bytes for the same input), and the bytes name the part. The header is fixed too: no name, mtime 0, OS 255
 * ("unknown"), so Windows and Linux builds agree.
 */
const GZIP_OPTIONS = { level: 9, header: { time: 0, os: 255 } } as const

export async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const digest = new Uint8Array(await globalThis.crypto.subtle.digest('SHA-256', bytes as Uint8Array<ArrayBuffer>))
  return Array.from(digest, (b) => b.toString(16).padStart(2, '0')).join('')
}

export async function writePart(rows: Iterable<PartRow>): Promise<{ bytes: Uint8Array; sha256: string; rows: number }> {
  const list = [...rows].map((r) => ({ rank: layerRank(r.layer), layer: r.layer, key: r.key, value: stripVolatile(r.value) }))
  list.sort((a, b) => a.rank - b.rank || (a.key < b.key ? -1 : a.key > b.key ? 1 : 0))
  for (let i = 1; i < list.length; i++) {
    // Two values under one key would make the bytes depend on which came first.
    if (list[i].rank === list[i - 1].rank && list[i].key === list[i - 1].key) throw new Error(`Row ${list[i].layer} ${list[i].key} given twice`)
  }
  const text = list.map((r) => `{"layer":${JSON.stringify(r.layer)},"key":${JSON.stringify(r.key)},"value":${stableJson(r.value)}}\n`).join('')
  const bytes = gzip(new TextEncoder().encode(text), GZIP_OPTIONS)
  return { bytes, sha256: await sha256Hex(bytes), rows: list.length }
}

export async function readPart(bytes: Uint8Array): Promise<PartRow[]> {
  const text = new TextDecoder().decode(ungzip(bytes))
  return text
    .split('\n')
    .filter((line) => line.length > 0)
    .map((line) => JSON.parse(line) as PartRow)
}

export function partPath(sha256: string): string {
  return `parts/${sha256}.part.gz`
}
