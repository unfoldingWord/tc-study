import { describe, expect, test } from 'bun:test'
import { mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { emptyState } from '../state'
import { storeContract } from '../store/contract'
import { fsStore } from './fsStore'

const tmp = () => mkdtemp(join(tmpdir(), 'lpc-'))

storeContract(async () => fsStore(await tmp()))

const st = (revision: number) => ({
  ...emptyState(),
  published: { x: { name: 'x', publisher: 'p', revision, id: 'a'.repeat(64), origin: 'published' as const } },
})

describe('fsStore', () => {
  test('state and segments survive a new store over the same dir', async () => {
    const dir = await tmp()
    const id = 'ab' + 'd'.repeat(62)
    const a = fsStore(dir)
    await a.setState(st(1))
    await a.put(id, new Uint8Array([9]))
    const b = fsStore(dir)
    expect(await b.getState()).toEqual(st(1))
    expect(Array.from((await b.get(id))!)).toEqual([9])
  })
  test('a leftover state.json.tmp does not replace a good state.json', async () => {
    const dir = await tmp()
    const a = fsStore(dir)
    await a.setState(st(2))
    await writeFile(join(dir, 'state.json.tmp'), '{"v":1,"k":"bad"')
    expect(await fsStore(dir).getState()).toEqual(st(2))
  })

  test('A8: an unreadable state.json fails with E_STORE naming the file and how to reset', async () => {
    const dir = await tmp()
    await writeFile(join(dir, 'state.json'), '{"v":1,')
    const e = await fsStore(dir).getState().catch((x) => x)
    expect(e.code).toBe('E_STORE')
    expect(e.message).toContain(join(dir, 'state.json'))
    expect(e.message).toMatch(/delet/i)
  })
})
