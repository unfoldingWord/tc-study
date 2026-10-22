/**
 * A part file (spec §3): `parts/<sha256>.part.gz`, gzip of JSONL rows `{"layer","key","value"}`. The same rows always
 * give the same bytes, so an unchanged part keeps its name and is never uploaded or downloaded again.
 */

import type { PackLayer } from '../types'

export type PartRow = { layer: PackLayer; key: string; value: unknown }

/** Dates set when a row is written or read; the importing app sets `timestamp`/`expiresAt` again (`restartLifetime`). */
export const VOLATILE_FIELDS: readonly string[] = ['timestamp', 'expiresAt', 'processingDate', 'downloadCompletedAt', 'cachedAt', 'catalogedAt']

const VOLATILE = new Set(VOLATILE_FIELDS)

/** Receipts never travel in parts: the list says when a resource is complete. */
const LAYER_ORDER: readonly PackLayer[] = ['sot', 'prepared', 'quote', 'align', 'text']

export function stripVolatile(value: unknown): unknown {
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
function stableJson(value: unknown): string {
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
  const rank = LAYER_ORDER.indexOf(layer)
  if (rank < 0) throw new Error(`A part does not carry ${layer} rows`)
  return rank
}

// Loaded on use, so that importing the package in a browser does not pull in a Node builtin.
const zlib = () => import('node:zlib')

/** gzip header byte 9 (OS): zlib writes the build's own (3 on Unix, 10 on Windows); 255 is "unknown" everywhere. */
const GZIP_OS_BYTE = 9

export async function writePart(rows: Iterable<PartRow>): Promise<{ bytes: Uint8Array; sha256: string; rows: number }> {
  const list = [...rows].map((r) => ({ rank: layerRank(r.layer), layer: r.layer, key: r.key, value: stripVolatile(r.value) }))
  list.sort((a, b) => a.rank - b.rank || (a.key < b.key ? -1 : a.key > b.key ? 1 : 0))
  for (let i = 1; i < list.length; i++) {
    // Two values under one key would make the bytes depend on which came first.
    if (list[i].rank === list[i - 1].rank && list[i].key === list[i - 1].key) throw new Error(`Row ${list[i].layer} ${list[i].key} given twice`)
  }
  const text = list.map((r) => `{"layer":${JSON.stringify(r.layer)},"key":${JSON.stringify(r.key)},"value":${stableJson(r.value)}}\n`).join('')
  const { gzipSync } = await zlib()
  const bytes = new Uint8Array(gzipSync(Buffer.from(text, 'utf8'), { level: 9 }))
  bytes[GZIP_OS_BYTE] = 255
  const { createHash } = await import('node:crypto')
  return { bytes, sha256: createHash('sha256').update(bytes).digest('hex'), rows: list.length }
}

export async function readPart(bytes: Uint8Array): Promise<PartRow[]> {
  const { gunzipSync } = await zlib()
  const text = gunzipSync(bytes).toString('utf8')
  return text
    .split('\n')
    .filter((line) => line.length > 0)
    .map((line) => JSON.parse(line) as PartRow)
}

export function partPath(sha256: string): string {
  return `parts/${sha256}.part.gz`
}
