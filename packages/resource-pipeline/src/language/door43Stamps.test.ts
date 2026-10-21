import { describe, expect, test } from 'bun:test'
import { resourceContentStamp } from '@bt-synergy/resource-catalog'
import { literalTextOf, stampsOfRows, stampsWithLexicons } from './door43Stamps'

const row = (owner: string, language: string, resourceId: string, subject: string, tag: string) => ({
  resourceKey: `${owner}/${language}/${resourceId}`,
  owner,
  language,
  resourceId,
  subject,
  release: { tag_name: tag, published_at: '2026-01-02T03:04:05Z' },
})

const rows = [
  row('es-419_gl', 'es-419', 'glt', 'Aligned Bible', 'v42'),
  row('es-419_gl', 'es-419', 'obs', 'Open Bible Stories', 'v7'),
  row('unfoldingWord', 'hbo', 'uhb', 'Hebrew Old Testament', 'v2.1.31'),
  row('unfoldingWord', 'el-x-koine', 'ugnt', 'Greek New Testament', 'v0.34'),
  row('unfoldingWord', 'en', 'ult', 'Aligned Bible', 'v88'),
] as never[]

describe('stampsOfRows', () => {
  test('without OBS: the language Bible and the two originals, each with its resource stamp', () => {
    const stamps = stampsOfRows(rows, { language: 'es-419', obs: false })
    expect(Object.keys(stamps).sort()).toEqual(
      ['es-419_gl/es-419/glt', 'unfoldingWord/el-x-koine/ugnt', 'unfoldingWord/hbo/uhb'].sort()
    )
    expect(stamps['es-419_gl/es-419/glt']).toBe(resourceContentStamp(rows[0] as never))
    expect(stamps['es-419_gl/es-419/glt']).toBe('v42#2026-01-02T03_04_05Z')
  })

  test('with OBS: its rows count too, other languages never', () => {
    const stamps = stampsOfRows(rows, { language: 'es-419', obs: true })
    expect(Object.keys(stamps)).toContain('es-419_gl/es-419/obs')
    expect(Object.keys(stamps)).not.toContain('unfoldingWord/en/ult')
  })
})

describe('the lexicons in the stamps', () => {
  const withSimple = [row('es-419_gl', 'es-419', 'gst', 'Aligned Bible', 'v3'), ...rows] as never[]

  test("the literal text is the language's aligned Bible whose id ends in lt, not its simple one", () => {
    expect(literalTextOf(withSimple, 'es-419')?.owner).toBe('es-419_gl')
    expect(literalTextOf(withSimple, 'en')?.owner).toBe('unfoldingWord')
    expect(literalTextOf(withSimple, 'fr')).toBeUndefined()
  })

  test("the lexicons of the literal text's owner, at the ref, join the stamps", async () => {
    const asked: string[] = []
    const fetchFn = async (url: string) => {
      asked.push(url)
      if (url.endsWith('/repos/es-419_gl/es-419_uhl')) return Response.json({})
      if (url.includes('/repos/es-419_gl/es-419_uhl/commits?sha=v3&')) return Response.json([{ sha: 'abcdef0123456789', created: '2026-10-19T10:00:00Z' }])
      return new Response('not found', { status: 404 })
    }
    const stamps = await stampsWithLexicons(rows, { language: 'es-419', obs: false, lexiconsRef: 'v3', fetch: fetchFn })
    expect(stamps['es-419_gl/es-419/uhl']).toBe('abcdef0123#2026-10-19T10_00_00Z')
    expect(stamps['es-419_gl/es-419/glt']).toBe('v42#2026-01-02T03_04_05Z')
    expect(Object.keys(stamps)).not.toContain('es-419_gl/es-419/ugl')
  })

  test('no literal text, or no ref: nothing is asked of Door43', async () => {
    const fetchFn = async (): Promise<Response> => {
      throw new Error('no request expected')
    }
    expect(await stampsWithLexicons(rows, { language: 'fr', obs: false, lexiconsRef: 'v3', fetch: fetchFn })).toEqual(
      stampsOfRows(rows, { language: 'fr', obs: false })
    )
    expect(await stampsWithLexicons(rows, { language: 'es-419', obs: false, fetch: fetchFn })).toEqual(
      stampsOfRows(rows, { language: 'es-419', obs: false })
    )
  })
})
