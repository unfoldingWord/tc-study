import { describe, expect, test } from 'bun:test'
import {
  catalogKeysIncludeLanguage,
  downloadResetToken,
  shouldCancelDownloadsOnPaneSwitch,
  shouldLoadCatalogOnModeSwitch,
  shouldResetDownloadQueueOnModeSwitch,
} from './downloadIsolationPolicy'

const TEXT = ['u/bho/obs', 'unfoldingWord/el-x-koine/ugnt']
const HELPS = ['u/en/tn', 'u/en/twl', 'local/en/combined-helps']

describe('shouldCancelDownloadsOnPaneSwitch', () => {
  test('text switch does not cancel an in-flight helps-only queue', () => {
    expect(
      shouldCancelDownloadsOnPaneSwitch({
        queue: HELPS,
        switchedPane: 'text',
        textKeys: TEXT,
        helpsKeys: HELPS,
      })
    ).toBe(false)
  })

  test('helps switch does not cancel an in-flight text-only queue', () => {
    expect(
      shouldCancelDownloadsOnPaneSwitch({
        queue: TEXT,
        switchedPane: 'helps',
        textKeys: TEXT,
        helpsKeys: HELPS,
      })
    ).toBe(false)
  })

  test('text switch cancels when only text keys are in flight', () => {
    expect(
      shouldCancelDownloadsOnPaneSwitch({
        queue: TEXT,
        switchedPane: 'text',
        textKeys: TEXT,
        helpsKeys: HELPS,
      })
    ).toBe(true)
  })

  test('mixed initial dual-load queue is not cancelled on text switch', () => {
    expect(
      shouldCancelDownloadsOnPaneSwitch({
        queue: [...TEXT, ...HELPS],
        switchedPane: 'text',
        textKeys: TEXT,
        helpsKeys: HELPS,
      })
    ).toBe(false)
  })

  test('empty queue or unknown ownership does not cancel', () => {
    expect(
      shouldCancelDownloadsOnPaneSwitch({
        queue: [],
        switchedPane: 'text',
        textKeys: TEXT,
        helpsKeys: HELPS,
      })
    ).toBe(false)
    expect(
      shouldCancelDownloadsOnPaneSwitch({
        queue: HELPS,
        switchedPane: 'text',
        textKeys: [],
        helpsKeys: [],
      })
    ).toBe(false)
  })
})

describe('downloadResetToken', () => {
  test('changes when either pane language changes', () => {
    expect(downloadResetToken('bho', 'en')).not.toBe(downloadResetToken('es', 'en'))
    expect(downloadResetToken('bho', 'en')).not.toBe(downloadResetToken('bho', 'es'))
    expect(downloadResetToken('bho', 'en')).toBe(downloadResetToken('bho', 'en'))
  })

  test('mode flip does not change the language token or reset the queue', () => {
    expect(shouldResetDownloadQueueOnModeSwitch()).toBe(false)
    expect(downloadResetToken('en', 'en')).toBe(downloadResetToken('en', 'en'))
  })
})

describe('shouldLoadCatalogOnModeSwitch', () => {
  test('skips catalog when that language+mode is already loaded', () => {
    expect(
      shouldLoadCatalogOnModeSwitch({
        mode: 'helps',
        languageCode: 'en',
        textKeys: TEXT,
        helpsKeys: HELPS,
      })
    ).toBe(false)
    expect(
      shouldLoadCatalogOnModeSwitch({
        mode: 'scripture',
        languageCode: 'en',
        textKeys: ['unfoldingWord/en/ult'],
        helpsKeys: HELPS,
      })
    ).toBe(false)
  })

  test('loads catalog the first time that language needs helps or scripture', () => {
    expect(
      shouldLoadCatalogOnModeSwitch({
        mode: 'helps',
        languageCode: 'es',
        textKeys: TEXT,
        helpsKeys: HELPS,
      })
    ).toBe(true)
    expect(
      shouldLoadCatalogOnModeSwitch({
        mode: 'scripture',
        languageCode: 'fr',
        textKeys: TEXT,
        helpsKeys: HELPS,
      })
    ).toBe(true)
  })

  test('catalogKeysIncludeLanguage reads the Door43 lang segment', () => {
    expect(catalogKeysIncludeLanguage(['unfoldingWord/en/ult'], 'en')).toBe(true)
    expect(catalogKeysIncludeLanguage(['es-419_gl/es-419/glt'], 'es-419')).toBe(true)
    expect(catalogKeysIncludeLanguage(['unfoldingWord/en/ult'], 'es')).toBe(false)
    expect(catalogKeysIncludeLanguage(['__combined-helps__'], 'en')).toBe(false)
  })
})
