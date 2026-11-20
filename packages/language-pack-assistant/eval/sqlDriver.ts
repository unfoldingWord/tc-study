/** bun:sqlite as the client's SqlDriver, so the evaluation searches the way an app on a device does (R30). Eval only: Bun. */
import { Database } from 'bun:sqlite'
import type { SqlDriver } from '@bt-synergy/language-pack-client'

export function bunDriver(file: string): SqlDriver {
  const db = new Database(file, { create: true })
  return {
    async exec(sql) {
      db.exec(sql)
    },
    async run(sql, params) {
      db.query(sql).run(...(params as never[]))
    },
    async all<T>(sql: string, params: unknown[]) {
      return db.query(sql).all(...(params as never[])) as T[]
    },
    async transaction<T>(fn: () => Promise<T>) {
      db.exec('BEGIN')
      try {
        const r = await fn()
        db.exec('COMMIT')
        return r
      } catch (e) {
        db.exec('ROLLBACK')
        throw e
      }
    },
  }
}
