import { describe, expect, test } from 'bun:test'
import { subjectsForLanguageList } from '@bt-synergy/resource-types'
import { resolveLanguageListKind } from '../features/read/languageListKind'
import * as plugins from './index'
import { RESOURCE_TYPE_PLUGIN_EXPORTS } from './pluginRegistry'

const registered = RESOURCE_TYPE_PLUGIN_EXPORTS.map((name) => plugins[name])

describe('registered plugin language-list subjects', () => {
  test('scripture mode includes Bible/Aligned Bible and not OBS', () => {
    const subjects = subjectsForLanguageList(registered, 'scripture')
    expect(subjects).toContain('Bible')
    expect(subjects).toContain('Aligned Bible')
    expect(subjects).not.toContain('Open Bible Stories')
    expect(subjects).not.toContain('Greek New Testament')
    expect(subjects).not.toContain('Hebrew Old Testament')
  })

  test('obs mode includes Open Bible Stories', () => {
    expect(subjectsForLanguageList(registered, 'obs')).toEqual(['Open Bible Stories'])
  })

  test('helps include TN / TWL / TQ (registered names), not OBS-TN', () => {
    const subjects = subjectsForLanguageList(registered, 'helps')
    expect(subjects).toContain('TSV Translation Notes')
    expect(subjects).toContain('TSV Translation Words Links')
    expect(subjects).toContain('TSV Translation Questions')
    expect(subjects).not.toContain('TSV OBS Translation Notes')
    expect(subjects).not.toContain('Combined Helps')
  })

  test('global is the union of content subjects', () => {
    expect(subjectsForLanguageList(registered, 'global')).toEqual([
      'Bible',
      'Aligned Bible',
      'Open Bible Stories',
    ])
  })

  test('obs-helps include OBS TN/TWL/TQ', () => {
    const subjects = subjectsForLanguageList(registered, 'obs-helps')
    expect(subjects).toContain('TSV OBS Translation Notes')
    expect(subjects).toContain('TSV OBS Translation Words Links')
    expect(subjects).toContain('TSV OBS Translation Questions')
    expect(subjects).not.toContain('TSV Translation Notes')
  })

  test('OBS-nav text picker fetches Open Bible Stories only', () => {
    const kind = resolveLanguageListKind({ listMode: 'text', navigationScope: 'obs' })
    expect(kind).toBe('obs')
    expect(subjectsForLanguageList(registered, kind)).toEqual(['Open Bible Stories'])
  })

  test('scripture-nav helps picker fetches bible helps + TW/TA, not OBS-TN', () => {
    const kind = resolveLanguageListKind({
      listMode: 'helps',
      navigationScope: 'scripture',
    })
    expect(kind).toBe('helps')
    const subjects = subjectsForLanguageList(registered, kind)
    expect(subjects).toContain('TSV Translation Notes')
    expect(subjects).toContain('TSV Translation Words Links')
    expect(subjects).toContain('TSV Translation Questions')
    expect(subjects).toContain('Translation Words')
    expect(subjects).toContain('Translation Academy')
    expect(subjects).not.toContain('TSV OBS Translation Notes')
  })

  test('all-helps is scripture helps ∪ OBS helps ∪ shared TW/TA', () => {
    const helps = subjectsForLanguageList(registered, 'helps')
    const obsHelps = subjectsForLanguageList(registered, 'obs-helps')
    const subjects = subjectsForLanguageList(registered, 'all-helps')
    expect(subjects).toEqual([...new Set([...helps, ...obsHelps])])
    expect(subjects).toContain('TSV Translation Notes')
    expect(subjects).toContain('TSV Translation Words Links')
    expect(subjects).toContain('TSV Translation Questions')
    expect(subjects).toContain('TSV OBS Translation Notes')
    expect(subjects).toContain('TSV OBS Translation Words Links')
    expect(subjects).toContain('TSV OBS Translation Questions')
    expect(subjects).toContain('Translation Words')
    expect(subjects).toContain('Translation Academy')
    expect(subjects).not.toContain('Bible')
    expect(subjects).not.toContain('Open Bible Stories')
  })
})
