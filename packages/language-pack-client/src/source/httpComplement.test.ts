import { describe, expect, test } from 'bun:test'
import { ClientError } from '../errors'
import { httpSource } from './http'

const ID = 'ab'.repeat(32)
const BYTES = new Uint8Array([1, 2, 3, 4, 5])

describe('httpSource.complement (GET /v3/packs/complement/<id>)', () => {
  test('asks that path and returns the bytes', async () => {
    const asked: string[] = []
    const source = httpSource({
      base: 'https://packs.test/',
      fetch: (async (input: RequestInfo | URL) => {
        asked.push(String(input))
        return new Response(BYTES)
      }) as typeof fetch,
    })
    expect(await source.complement!(ID)).toEqual(BYTES)
    expect(asked).toEqual([`https://packs.test/v3/packs/complement/${ID}`])
  })

  test('404 (no such complement) and 400 (a Worker without the route) are E_NETWORK with their status', async () => {
    for (const status of [404, 400]) {
      const source = httpSource({ base: 'https://packs.test', fetch: (async () => new Response('{}', { status })) as typeof fetch })
      const e = await source.complement!(ID).then(
        () => undefined,
        (x) => x as ClientError,
      )
      expect(e).toBeInstanceOf(ClientError)
      expect(e!.code).toBe('E_NETWORK')
      expect(e!.status).toBe(status)
    }
  })
})
