/** Installed state; Task 4 narrows it. */
export type InstalledState = { v: 1; [k: string]: unknown }

export interface BlobStore {
  has(id: string): Promise<boolean>
  get(id: string): Promise<Uint8Array | undefined>
  /** Throws ClientError('E_ARG') when id is not 64 lowercase hex. Never checks content. */
  put(id: string, bytes: Uint8Array): Promise<void>
  delete(id: string): Promise<void>
  ids(): Promise<string[]>
  getState(): Promise<InstalledState | undefined>
  /** Atomic: a crash leaves the old or the new state. */
  setState(state: InstalledState): Promise<void>
}

const ID_RE = /^[0-9a-f]{64}$/
export function isStoreId(id: string): boolean {
  return typeof id === 'string' && ID_RE.test(id)
}
