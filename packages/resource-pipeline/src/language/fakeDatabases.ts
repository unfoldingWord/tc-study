/**
 * In Node the build's IndexedDB is fake-indexeddb, all in memory: a language's store is gigabytes until its databases
 * are deleted, and the next step (the MCP views) opens a store of its own.
 */

type Closable = { close(): Promise<void> }

/**
 * Closes the adapters and deletes their databases, waiting for each delete. A connection someone else still holds
 * would block the delete until it closes; the run says so and goes on rather than hang.
 */
export async function closeAndDelete(adapters: Closable[], names: string[], log?: (line: string) => void): Promise<void> {
  for (const adapter of adapters) await adapter.close()
  for (const name of names) {
    await new Promise<void>((resolve, reject) => {
      const request = indexedDB.deleteDatabase(name)
      request.onsuccess = () => resolve()
      request.onerror = () => reject(request.error ?? new Error(`Could not delete the database ${name}`))
      request.onblocked = () => {
        log?.(`la base ${name} sigue abierta en otra conexión: se borrará al cerrarse`)
        resolve()
      }
    })
  }
}
