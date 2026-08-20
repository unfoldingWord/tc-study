import { describe, expect, test } from 'bun:test'
import { subjectsForHelpsCatalogLoad, subjectsForLanguageList } from '@bt-synergy/resource-types'
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

  test('helps include TN / TWL / TQ (registered names), not OBS-TN or TW/TA', () => {
    const subjects = subjectsForLanguageList(registered, 'helps')
    expect(subjects).toContain('TSV Translation Notes')
    expect(subjects).toContain('TSV Translation Words Links')
    expect(subjects).toContain('TSV Translation Questions')
    expect(subjects).not.toContain('TSV OBS Translation Notes')
    expect(subjects).not.toContain('Translation Words')
    expect(subjects).not.toContain('Translation Academy')
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
    expect(subjects).not.toContain('Translation Words')
    expect(subjects).not.toContain('Translation Academy')
  })

  test('OBS-nav text picker still fetches Bible + Aligned Bible + OBS', () => {
    const kind = resolveLanguageListKind({ listMode: 'text', navigationScope: 'obs' })
    expect(kind).toBe('global')
    expect(subjectsForLanguageList(registered, kind)).toEqual([
      'Bible',
      'Aligned Bible',
      'Open Bible Stories',
    ])
  })

  test('helps picker fetches companion TN/TWL/TQ + OBS equivalents, not TW/TA', () => {
    const kind = resolveLanguageListKind({
      listMode: 'helps',
      navigationScope: 'scripture',
    })
    expect(kind).toBe('all-helps')
    const subjects = subjectsForLanguageList(registered, kind)
    expect(subjects).toContain('TSV Translation Notes')
    expect(subjects).toContain('TSV Translation Words Links')
    expect(subjects).toContain('TSV Translation Questions')
    expect(subjects).toContain('TSV OBS Translation Notes')
    expect(subjects).toContain('TSV OBS Translation Words Links')
    expect(subjects).toContain('TSV OBS Translation Questions')
    expect(subjects).not.toContain('Translation Words')
    expect(subjects).not.toContain('Translation Academy')
  })

  test('helps catalog load includes companions + shared for each scope', () => {
    const scripture = subjectsForHelpsCatalogLoad(registered, 'scripture')
    expect(scripture).toContain('TSV Translation Notes')
    expect(scripture).toContain('TSV Translation Questions')
    expect(scripture).toContain('Translation Words')
    expect(scripture).toContain('Translation Academy')
    expect(scripture).not.toContain('Combined Helps')

    const obs = subjectsForHelpsCatalogLoad(registered, 'obs')
    expect(obs).toContain('TSV OBS Translation Notes')
    expect(obs).toContain('TSV OBS Translation Questions')
    expect(obs).toContain('Translation Words')
    expect(obs).toContain('Translation Academy')
    expect(obs).not.toContain('OBS Combined Helps')
  })

  test('all-helps is companion scripture helps ∪ OBS helps (not shared TW/TA)', () => {
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
    expect(subjects).not.toContain('Translation Words')
    expect(subjects).not.toContain('Translation Academy')
    expect(subjects).not.toContain('Bible')
    expect(subjects).not.toContain('Open Bible Stories')
  })
})
