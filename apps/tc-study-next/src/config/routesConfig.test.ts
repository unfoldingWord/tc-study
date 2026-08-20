import { describe, expect, test } from 'bun:test'
import { ROUTE_REDIRECTS } from './routesConfig'

describe('ROUTE_REDIRECTS', () => {
  test('passage-sets redirects to data until package is wired', () => {
    const redirect = ROUTE_REDIRECTS.find((r) => r.from === '/passage-sets')
    expect(redirect?.to).toBe('/data')
  })
})
