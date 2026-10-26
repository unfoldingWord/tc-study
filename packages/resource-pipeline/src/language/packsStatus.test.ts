import { describe, expect, test } from 'bun:test'
import { compatKeyOf, PACK_FORMAT_VERSION, PARTS_FORMAT_VERSION } from '@bt-synergy/language-pack'
import { PACK_VERSIONS } from './packVersions'
import { builderPath, isCompatKey, packsStatus, statusPath, writeBuilder, type PackStatus, type PartsBuilder } from './packsStatus'
import { memoryBucket } from './publishLanguage'

const compat = compatKeyOf(PACK_FORMAT_VERSION, PACK_VERSIONS)
const RUN = 'https://github.com/unfoldingWord/tc-study/actions/runs/1'

describe('packsStatus', () => {
  test('writes status/<compat>/<lang>.json with no-cache', async () => {
    const bucket = memoryBucket()
    const now = new Date('2026-10-21T12:00:00Z')
    await packsStatus({ bucket, compat, language: 'es-419', state: 'running', run: RUN, now })
    expect(bucket.puts).toEqual([{ key: `status/${compat}/es-419.json`, contentType: 'application/json', cacheControl: 'no-cache', bytes: expect.any(Number) }])
    expect(bucket.json<PackStatus>(statusPath(compat, 'es-419'))).toEqual({ state: 'running', at: '2026-10-21T12:00:00.000Z', failures: 0, run: RUN, started: '2026-10-21T12:00:00.000Z' })
  })

  test('a second failure in a row makes failures 2', async () => {
    const bucket = memoryBucket()
    await packsStatus({ bucket, compat, language: 'es-419', state: 'failed', run: RUN })
    await packsStatus({ bucket, compat, language: 'es-419', state: 'failed', run: RUN })
    expect(bucket.json<PackStatus>(statusPath(compat, 'es-419'))?.failures).toBe(2)
  })

  test('ok resets failures to 0', async () => {
    const bucket = memoryBucket({ [statusPath(compat, 'es-419')]: { state: 'failed', at: '2026-10-20T00:00:00.000Z', failures: 3, run: RUN } })
    await packsStatus({ bucket, compat, language: 'es-419', state: 'ok', run: RUN })
    expect(bucket.json<PackStatus>(statusPath(compat, 'es-419'))).toMatchObject({ state: 'ok', failures: 0 })
  })

  test('running keeps the previous count, so a retry after failures is not forgiven early', async () => {
    const bucket = memoryBucket({ [statusPath(compat, 'es-419')]: { state: 'failed', at: '2026-10-20T00:00:00.000Z', failures: 2, run: RUN } })
    await packsStatus({ bucket, compat, language: 'es-419', state: 'running', run: RUN })
    expect(bucket.json<PackStatus>(statusPath(compat, 'es-419'))).toMatchObject({ state: 'running', failures: 2 })
  })

  test('a stored file with a bad count is treated as no failures, not as NaN', async () => {
    const bucket = memoryBucket({ [statusPath(compat, 'es-419')]: { state: 'failed', failures: 'many' } })
    await packsStatus({ bucket, compat, language: 'es-419', state: 'failed', run: RUN })
    expect(bucket.json<PackStatus>(statusPath(compat, 'es-419'))?.failures).toBe(1)
  })

  test('refuses a language code that is not safe in a key', async () => {
    await expect(packsStatus({ bucket: memoryBucket(), compat, language: '../x', state: 'ok', run: RUN })).rejects.toThrow('Not a language code')
  })

  test('the compat key the code computes passes the same check the Worker applies', () => {
    expect(isCompatKey(compat)).toBe(true)
  })

  test('refuses a compat that is not a compat key, so a workflow input cannot pick another bucket path', async () => {
    for (const bad of ['../x', 'f1.0-u1-p1-q1-a1', 'f1.0-u1/../-p1-q1-a1-t1', '']) {
      await expect(packsStatus({ bucket: memoryBucket(), compat: bad, language: 'es-419', state: 'failed', run: RUN })).rejects.toThrow('Not a compat key')
    }
  })

  test('a drifted compat gets its own failed status, apart from the current one', async () => {
    const bucket = memoryBucket()
    const drifted = 'f1.0-u9-p9-q9-a9-t9'
    await packsStatus({ bucket, compat: drifted, language: 'es-419', state: 'failed', run: RUN })
    expect(bucket.json<PackStatus>(statusPath(drifted, 'es-419'))).toMatchObject({ state: 'failed', failures: 1 })
    expect(bucket.json<PackStatus>(statusPath(compat, 'es-419'))).toBeNull()
  })

  test('languages do not share a status', async () => {
    const bucket = memoryBucket()
    await packsStatus({ bucket, compat, language: 'es-419', state: 'failed', run: RUN })
    await packsStatus({ bucket, compat, language: 'pt-br', state: 'failed', run: RUN })
    expect(bucket.json<PackStatus>(statusPath(compat, 'pt-br'))?.failures).toBe(1)
  })

  test('an unparsable stored status counts as no previous one, so the language can still be built', async () => {
    const bucket = memoryBucket()
    const unparsable = { ...bucket, getJson: async () => JSON.parse('{"state": "failed",') }
    await packsStatus({ bucket: unparsable, compat, language: 'es-419', state: 'running', run: RUN })
    expect(bucket.json<PackStatus>(statusPath(compat, 'es-419'))).toMatchObject({ state: 'running', failures: 0 })
  })

  test('running sets started to now, replacing the start of an earlier run', async () => {
    const bucket = memoryBucket({ [statusPath(compat, 'es-419')]: { state: 'ok', at: '2026-10-20T03:00:00.000Z', failures: 0, run: RUN, started: '2026-10-20T01:00:00.000Z' } })
    await packsStatus({ bucket, compat, language: 'es-419', state: 'running', run: RUN, now: new Date('2026-10-21T12:00:00Z') })
    expect(bucket.json<PackStatus>(statusPath(compat, 'es-419'))?.started).toBe('2026-10-21T12:00:00.000Z')
  })

  test('ok and failed keep the started of the run they end, so a release published during the build is not taken as seen', async () => {
    for (const state of ['ok', 'failed'] as const) {
      const bucket = memoryBucket()
      await packsStatus({ bucket, compat, language: 'es-419', state: 'running', run: RUN, now: new Date('2026-10-21T12:00:00Z') })
      await packsStatus({ bucket, compat, language: 'es-419', state, run: RUN, now: new Date('2026-10-21T14:30:00Z') })
      expect(bucket.json<PackStatus>(statusPath(compat, 'es-419'))).toMatchObject({ state, at: '2026-10-21T14:30:00.000Z', started: '2026-10-21T12:00:00.000Z' })
    }
  })

  test('ok with no stored start writes no started', async () => {
    const bucket = memoryBucket({ [statusPath(compat, 'es-419')]: { state: 'running', at: '2026-10-21T12:00:00.000Z', failures: 0, run: 'dispatched' } })
    await packsStatus({ bucket, compat, language: 'es-419', state: 'ok', run: RUN })
    expect(bucket.json<PackStatus>(statusPath(compat, 'es-419'))).not.toHaveProperty('started')
  })

  test('an unparsable stored status gives ok no started to keep', async () => {
    const bucket = memoryBucket()
    const unparsable = { ...bucket, getJson: async () => JSON.parse('{"state": "running", "started": "2026-') }
    await packsStatus({ bucket: unparsable, compat, language: 'es-419', state: 'ok', run: RUN })
    expect(bucket.json<PackStatus>(statusPath(compat, 'es-419'))).not.toHaveProperty('started')
  })

  test('a stored started that is not a date is not kept', async () => {
    const bucket = memoryBucket({ [statusPath(compat, 'es-419')]: { state: 'running', at: '2026-10-21T12:00:00.000Z', failures: 0, run: RUN, started: 'yesterday' } })
    await packsStatus({ bucket, compat, language: 'es-419', state: 'failed', run: RUN })
    expect(bucket.json<PackStatus>(statusPath(compat, 'es-419'))).not.toHaveProperty('started')
  })

  test('a read that fails for another reason stops the run and writes nothing', async () => {
    const bucket = memoryBucket()
    const down = { ...bucket, getJson: async () => { throw new Error('GET status: 503') } }
    await expect(packsStatus({ bucket: down, compat, language: 'es-419', state: 'running', run: RUN })).rejects.toThrow('503')
    expect(bucket.puts).toHaveLength(0)
  })
})

describe('writeBuilder', () => {
  const parts = compatKeyOf(PARTS_FORMAT_VERSION, PACK_VERSIONS)
  const code = `${parts}+0123456789abcdef`
  const COMMIT = '0123456789abcdef0123456789abcdef01234567'

  test('writes status/builder.json, { compat, code, commit, at }, with no-cache', async () => {
    const bucket = memoryBucket()
    await writeBuilder({ bucket, compat: parts, code, commit: COMMIT, now: new Date('2026-10-26T12:00:00Z') })
    expect(builderPath).toBe('status/builder.json')
    expect(bucket.puts).toEqual([{ key: 'status/builder.json', contentType: 'application/json', cacheControl: 'no-cache', bytes: expect.any(Number) }])
    expect(bucket.json<PartsBuilder>(builderPath)).toEqual({ compat: parts, code, commit: COMMIT, at: '2026-10-26T12:00:00.000Z' })
  })

  test('the same code again keeps the moment it was first written, with the newer commit: the Worker dates the code change by it', async () => {
    const bucket = memoryBucket()
    await writeBuilder({ bucket, compat: parts, code, commit: COMMIT, now: new Date('2026-10-26T12:00:00Z') })
    const later = 'f'.repeat(40)
    await writeBuilder({ bucket, compat: parts, code, commit: later, now: new Date('2026-10-27T08:00:00Z') })
    expect(bucket.json<PartsBuilder>(builderPath)).toEqual({ compat: parts, code, commit: later, at: '2026-10-26T12:00:00.000Z' })
  })

  test('another code is dated now', async () => {
    const bucket = memoryBucket({ [builderPath]: { compat: parts, code, commit: COMMIT, at: '2026-10-26T12:00:00.000Z' } })
    const next = `${parts}+fedcba9876543210`
    await writeBuilder({ bucket, compat: parts, code: next, commit: COMMIT, now: new Date('2026-10-27T08:00:00Z') })
    expect(bucket.json<PartsBuilder>(builderPath)).toMatchObject({ code: next, at: '2026-10-27T08:00:00.000Z' })
  })

  test('a stored file that does not parse, or has no date, is replaced, dated now', async () => {
    const now = new Date('2026-10-27T08:00:00Z')
    const unparsable = { ...memoryBucket(), getJson: async () => JSON.parse('{"code": ') }
    const bucket = memoryBucket({ [builderPath]: { compat: parts, code, commit: COMMIT, at: 'yesterday' } })
    for (const b of [{ ...bucket, getJson: unparsable.getJson }, bucket]) {
      await writeBuilder({ bucket: b, compat: parts, code, commit: COMMIT, now })
      expect(bucket.json<PartsBuilder>(builderPath)?.at).toBe('2026-10-27T08:00:00.000Z')
    }
  })

  test('refuses a compat that is not a key, a code of another compat, and a commit that is not a whole sha', async () => {
    const bucket = memoryBucket()
    await expect(writeBuilder({ bucket, compat: '../x', code, commit: COMMIT })).rejects.toThrow('Not a compat key')
    await expect(writeBuilder({ bucket, compat: parts, code: 'f2.0-u0+0123456789abcdef', commit: COMMIT })).rejects.toThrow('Not a code of')
    await expect(writeBuilder({ bucket, compat: parts, code, commit: 'abc123' })).rejects.toThrow('Not a commit')
    expect(bucket.puts).toHaveLength(0)
  })
})
