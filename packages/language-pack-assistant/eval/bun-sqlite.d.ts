/** The part of bun:sqlite the evaluation driver uses (the package does not load Bun's type package). */
declare module 'bun:sqlite' {
  export class Database {
    constructor(file: string, options?: { create?: boolean })
    exec(sql: string): void
    query(sql: string): { run(...params: unknown[]): unknown; all(...params: unknown[]): unknown[] }
  }
}
