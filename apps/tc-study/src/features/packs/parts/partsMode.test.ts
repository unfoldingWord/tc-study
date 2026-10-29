import { describe, expect, test } from 'bun:test'
import { keysLeftToDoor43, modeAfter, partsModeHoldsOriginals } from './partsMode'
import { PACKS_SERVER, PARTS_COMPAT } from './readParts'

const GLT = 'es-419_gl/es-419/glt'
const TN = 'es-419_gl/es-419/tn'
const ULT = 'unfoldingWord/en/ult'
const UGNT = 'unfoldingWord/el-x-koine/ugnt'
const UHB = 'unfoldingWord/hbo/uhb'

describe('keysLeftToDoor43', () => {
  test('no language comes as parts: every key goes to Door43, as before', () => {
    expect(keysLeftToDoor43([GLT, TN, UGNT], {})).toEqual([GLT, TN, UGNT])
    expect(keysLeftToDoor43([GLT, UGNT], { 'es-419': 'door43' })).toEqual([GLT, UGNT])
  })

  test('a language served as parts (or still being checked) is not downloaded whole, nor the originals', () => {
    expect(keysLeftToDoor43([GLT, TN, UGNT, UHB], { 'es-419': 'parts' })).toEqual([])
    expect(keysLeftToDoor43([GLT, TN, UGNT], { 'es-419': 'checking' })).toEqual([])
  })

  test('another language still goes to Door43; instance ids are read by their base key', () => {
    expect(keysLeftToDoor43([GLT, `${ULT}#2`, UGNT], { 'es-419': 'parts', en: 'door43' })).toEqual([`${ULT}#2`])
  })
})

describe('modeAfter', () => {
  test('applied or up to date: parts', () => {
    expect(modeAfter(undefined, { kind: 'applied', units: [], parts: 1, bytes: 1 })).toBe('parts')
    expect(modeAfter('checking', { kind: 'up-to-date' })).toBe('parts')
  })

  test('the server does not serve it: Door43, as before', () => {
    expect(modeAfter('checking', { kind: 'no-language' })).toBe('door43')
    expect(modeAfter('checking', { kind: 'preparing', retryAfter: 600 })).toBe('door43')
    expect(modeAfter(undefined, { kind: 'update-app' })).toBe('door43')
  })

  test('a language already served as parts stays so through a passing failure (a wait, no network)', () => {
    expect(modeAfter('parts', { kind: 'unavailable', retryAfter: 300 })).toBe('parts')
    expect(modeAfter('parts', { kind: 'failed', why: 'x' })).toBe('parts')
    expect(modeAfter('parts', { kind: 'no-language' })).toBe('door43')
  })
})

describe('partsModeHoldsOriginals', () => {
  test('only while some language is checking or served as parts', () => {
    expect(partsModeHoldsOriginals({})).toBe(false)
    expect(partsModeHoldsOriginals({ en: 'door43' })).toBe(false)
    expect(partsModeHoldsOriginals({ en: 'door43', 'es-419': 'checking' })).toBe(true)
  })
})

describe('the compat key Read asks the server for', () => {
  test('is the production folder of the parts of today (f2.0, u2.3.0, …)', () => {
    expect(PARTS_COMPAT).toBe('f2.0-u2.3.0-p6000230-q9-a12-t1')
    expect(PACKS_SERVER).toBe('https://tc-helps.mcp.servant.bible/v2/packs/')
  })
})
