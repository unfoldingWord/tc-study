import { afterEach, beforeEach, describe, expect, it } from 'bun:test'
import { packsFormat, packsServer, V3_ORIGIN_STAGING } from './packsFormat'

const g = globalThis as unknown as { location?: { search: string }; localStorage?: Storage }
const saved = { location: g.location, localStorage: g.localStorage }
const envBefore = process.env.VITE_TCS_PACKS

function fakeStorage(): Storage {
  const m = new Map<string, string>()
  return {
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => void m.set(k, String(v)),
    removeItem: (k: string) => void m.delete(k),
    clear: () => m.clear(),
    key: (i: number) => [...m.keys()][i] ?? null,
    get length() {
      return m.size
    },
  } as Storage
}

beforeEach(() => {
  g.localStorage = fakeStorage()
  g.location = { search: '' }
  delete process.env.VITE_TCS_PACKS
})
afterEach(() => {
  g.location = saved.location
  g.localStorage = saved.localStorage
  if (envBefore === undefined) delete process.env.VITE_TCS_PACKS
  else process.env.VITE_TCS_PACKS = envBefore
})

describe('packsFormat', () => {
  it('is 2 by default', () => {
    expect(packsServer()).toBe('production')
    expect(packsFormat()).toBe(2)
  })

  it('?packs=staging gives 3 and is remembered after the query is gone', () => {
    g.location = { search: '?packs=staging' }
    expect(packsFormat()).toBe(3)
    g.location = { search: '' }
    expect(packsFormat()).toBe(3)
    expect(g.localStorage!.getItem('tc-study:packs-server')).toBe('staging')
  })

  it('?packs=production goes back to 2', () => {
    g.location = { search: '?packs=staging' }
    expect(packsFormat()).toBe(3)
    g.location = { search: '?packs=production' }
    expect(packsFormat()).toBe(2)
    g.location = { search: '' }
    expect(packsFormat()).toBe(2)
  })

  it('ignores an unknown value', () => {
    g.location = { search: '?packs=other' }
    expect(packsFormat()).toBe(2)
  })

  it('VITE_TCS_PACKS=staging gives 3, and a saved choice wins over it', () => {
    process.env.VITE_TCS_PACKS = 'staging'
    expect(packsFormat()).toBe(3)
    g.localStorage!.setItem('tc-study:packs-server', 'production')
    expect(packsFormat()).toBe(2)
  })

  it('the staging origin is the preview worker', () => {
    expect(V3_ORIGIN_STAGING).toBe('https://translation-helps-mcp-v2-preview.unfoldingword.workers.dev')
  })
})
