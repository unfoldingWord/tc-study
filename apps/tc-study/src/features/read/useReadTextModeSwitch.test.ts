import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const src = readFileSync(join(import.meta.dir, 'useReadTextModeSwitch.ts'), 'utf8')

describe('useReadTextModeSwitch (issue #25 BCV vs Switch)', () => {
  test('Switch button resets to a default ref; BCV commit only reloads catalog', () => {
    expect(src).toContain('applyTextModeScopeSwitch')
    const switchFn = src.slice(src.indexOf('const handleSwitchTextMode'))
    const switchBody = switchFn.slice(0, switchFn.indexOf('const handleNavigatorScopeCommitted'))
    expect(switchBody).toContain('applyTextModeScopeSwitch')
    expect(switchBody).toContain('navigationScope: scope')
    const navFn = src.slice(src.indexOf('const handleNavigatorScopeCommitted'))
    expect(navFn).toContain('navigationScope: scope')
    expect(navFn).not.toContain('applyTextModeScopeSwitch')
  })

  test('neither explicit path resets helps language or calls the helps picker handler', () => {
    expect(src).not.toContain('handleHelpsLanguageSelected')
    expect(src).not.toContain('writePersistedHelpsLanguage')
    expect(src).not.toContain('HELPS_LANGUAGE_STORAGE_KEY')
    expect(src).not.toContain('tc-study:helps-language')
  })
})
