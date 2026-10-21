import { describe, expect, test } from 'bun:test'
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { addMacula } from './companions'

describe('addMacula', () => {
  test('the catalog rows carry the version and the date it is given, not one cut from the other', async () => {
    const folder = mkdtempSync(join(tmpdir(), 'macula-'))
    for (const part of ['trees', 'referents']) {
      mkdirSync(join(folder, part))
      writeFileSync(join(folder, part, 'TIT.json'), '{}')
      writeFileSync(join(folder, part, 'RUT.json'), '{}')
    }
    const rows = new Map<string, { version?: string; release?: { tag_name: string; published_at: string } }>()
    const catalog = { set: async (key: string, value: never) => void rows.set(key, value) }
    const cache = { putRawMany: async () => {}, set: async () => {} }

    await addMacula(cache as never, catalog as never, folder, { version: 'f1e2d3c4b5', publishedAt: '2026-10-01T14:00:00.000Z' })

    for (const key of ['Biblica/hbo/macula', 'Biblica/el-x-koine/macula']) {
      expect(rows.get(key)?.version).toBe('f1e2d3c4b5')
      expect(rows.get(key)?.release).toEqual({ tag_name: 'f1e2d3c4b5', published_at: '2026-10-01T14:00:00.000Z' })
    }
  })
})
