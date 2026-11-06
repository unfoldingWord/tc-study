import { describe, expect, test } from 'bun:test'
import { mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { storeContract } from '../store/contract'
import { fsStore } from './fsStore'

const tmp = () => mkdtemp(join(tmpdir(), 'lpc-'))

storeContract(async () => fsStore(await tmp()))

describe('fsStore', () => {
  test('state and segments survive a new store over the same dir', async () => {
    const dir = await tmp()
    const id = 'ab' + 'd'.repeat(62)
    const a = fsStore(dir)
    await a.setState({ v: 1, k: 1 })
    await a.put(id, new Uint8Array([9]))
    const b = fsStore(dir)
    expect(await b.getState()).toEqual({ v: 1, k: 1 })
    expect(Array.from((await b.get(id))!)).toEqual([9])
  })
  test('a leftover state.json.tmp does not replace a good state.json', async () => {
    const dir = await tmp()
    const a = fsStore(dir)
    await a.setState({ v: 1, k: 'good' })
    await writeFile(join(dir, 'state.json.tmp'), '{"v":1,"k":"bad"')
    expect(await fsStore(dir).getState()).toEqual({ v: 1, k: 'good' })
  })
})
