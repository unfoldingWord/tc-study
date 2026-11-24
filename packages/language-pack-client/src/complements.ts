/**
 * Complements: files a catalog lists that are not segments (`catalog.md`, "Complements"). Their id is the sha256 of the file as downloaded.
 * No Node module here: the client runs in a browser, a WebView, a Worker and Bun.
 */
import { hex } from './state'
import type { VerifiedCatalog } from './verify'

export async function sha256Hex(bytes: Uint8Array): Promise<string> {
  return hex(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes as unknown as BufferSource)))
}

export type ListedComplement = { id: string; kind: string; size: number }

/** The complements the catalogs list, by id (the first listing of an id wins); `kinds` keeps only those kinds. */
export function listedComplements(cats: VerifiedCatalog[], kinds?: string[]): Map<string, ListedComplement> {
  const out = new Map<string, ListedComplement>()
  for (const c of cats) {
    for (const x of c.catalog.complements ?? []) {
      if (kinds !== undefined && !kinds.includes(x.kind)) continue
      const id = hex(x.id)
      if (!out.has(id)) out.set(id, { id, kind: x.kind, size: x.size })
    }
  }
  return out
}

/** True when `bytes` is the complement `id` listed with `size`. */
export async function complementOk(bytes: Uint8Array, id: string, size?: number): Promise<boolean> {
  if (size !== undefined && bytes.length !== size) return false
  return (await sha256Hex(bytes)) === id
}
