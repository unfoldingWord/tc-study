import { describe, expect, test } from 'bun:test'
import {
  catalogLanguageListSubjects,
  panelModesForType,
  subjectsForLanguageList,
  type LanguageListTypeFields,
} from './subjectsForLanguageList'

function type(partial: LanguageListTypeFields): LanguageListTypeFields {
  return partial
}

const SCRIPTURE = type({
  contentRole: 'primary',
  scope: 'scripture',
  subjects: ['Bible', 'Aligned Bible', 'Greek New Testament', 'Hebrew Old Testament'],
  languageListSubjects: ['Bible', 'Aligned Bible'],
})

const OBS = type({
  contentRole: 'primary',
  scope: 'obs',
  subjects: ['Open Bible Stories'],
})

const NOTES = type({
  contentRole: 'companion',
  companionFor: ['scripture'],
  subjects: ['TSV Translation Notes'],
})

const TWL = type({
  contentRole: 'companion',
  companionFor: ['scripture'],
  subjects: ['TSV Translation Words Links'],
})

const TQ = type({
  contentRole: 'companion',
  companionFor: ['scripture'],
  subjects: ['TSV Translation Questions'],
})

const TA = type({
  contentRole: 'shared',
  subjects: ['Translation Academy'],
})

const TW = type({
  contentRole: 'shared',
  subjects: ['Translation Words'],
})

const COMBINED = type({
  contentRole: 'companion',
  companionFor: ['scripture'],
  subjects: ['Combined Helps'],
  includeInLanguageLists: false,
})

const OBS_NOTES = type({
  contentRole: 'companion',
  companionFor: ['obs'],
  subjects: ['TSV OBS Translation Notes', 'OBS Translation Notes'],
})

const OBS_TWL = type({
  contentRole: 'companion',
  companionFor: ['obs'],
  subjects: ['TSV OBS Translation Words Links', 'OBS Translation Words Links'],
})

const OBS_TQ = type({
  contentRole: 'companion',
  companionFor: ['obs'],
  subjects: ['TSV OBS Translation Questions', 'OBS Translation Questions'],
})

const OBS_COMBINED = type({
  contentRole: 'companion',
  companionFor: ['obs'],
  subjects: ['OBS Combined Helps'],
  includeInLanguageLists: false,
})

const ALL = [
  SCRIPTURE,
  OBS,
  NOTES,
  TWL,
  TQ,
  TA,
  TW,
  COMBINED,
  OBS_NOTES,
  OBS_TWL,
  OBS_TQ,
  OBS_COMBINED,
]

describe('panelModesForType', () => {
  test('derives scripture / obs / helps from contentRole + scope', () => {
    expect(panelModesForType(SCRIPTURE)).toEqual(['scripture'])
    expect(panelModesForType(OBS)).toEqual(['obs'])
    expect(panelModesForType(NOTES)).toEqual(['helps'])
    expect(panelModesForType(TA)).toEqual(['helps'])
  })

  test('honors explicit panelModes override', () => {
    expect(panelModesForType({ subjects: ['X'], panelModes: ['obs', 'helps'] })).toEqual([
      'obs',
      'helps',
    ])
  })
})

describe('catalogLanguageListSubjects', () => {
  test('prefers languageListSubjects and skips synthetic types', () => {
    expect(catalogLanguageListSubjects(SCRIPTURE)).toEqual(['Bible', 'Aligned Bible'])
    expect(catalogLanguageListSubjects(COMBINED)).toEqual([])
    expect(catalogLanguageListSubjects(OBS)).toEqual(['Open Bible Stories'])
  })
})

describe('subjectsForLanguageList', () => {
  test('scripture content includes Bible/Aligned Bible, not OBS or originals', () => {
    const subjects = subjectsForLanguageList(ALL, 'scripture')
    expect(subjects).toEqual(['Bible', 'Aligned Bible'])
    expect(subjects).not.toContain('Open Bible Stories')
    expect(subjects).not.toContain('Greek New Testament')
  })

  test('obs content includes Open Bible Stories only', () => {
    expect(subjectsForLanguageList(ALL, 'obs')).toEqual(['Open Bible Stories'])
  })

  test('global is the union of content subjects', () => {
    expect(subjectsForLanguageList(ALL, 'global')).toEqual([
      'Bible',
      'Aligned Bible',
      'Open Bible Stories',
    ])
  })

  test('helps includes TN / TWL / TQ (and shared TA/TW), not OBS helps or Combined Helps', () => {
    const subjects = subjectsForLanguageList(ALL, 'helps')
    expect(subjects).toContain('TSV Translation Notes')
    expect(subjects).toContain('TSV Translation Words Links')
    expect(subjects).toContain('TSV Translation Questions')
    expect(subjects).toContain('Translation Academy')
    expect(subjects).toContain('Translation Words')
    expect(subjects).not.toContain('Open Bible Stories')
    expect(subjects).not.toContain('TSV OBS Translation Notes')
    expect(subjects).not.toContain('Combined Helps')
  })

  test('obs-helps includes OBS TN/TWL/TQ, not Bible content or Combined Helps', () => {
    const subjects = subjectsForLanguageList(ALL, 'obs-helps')
    expect(subjects).toContain('TSV OBS Translation Notes')
    expect(subjects).toContain('OBS Translation Notes')
    expect(subjects).toContain('TSV OBS Translation Words Links')
    expect(subjects).toContain('TSV OBS Translation Questions')
    expect(subjects).toContain('Translation Academy')
    expect(subjects).not.toContain('TSV Translation Notes')
    expect(subjects).not.toContain('Bible')
    expect(subjects).not.toContain('OBS Combined Helps')
  })

  test('a new primary plugin expands global and its mode list', () => {
    const extra = type({
      contentRole: 'primary',
      scope: 'scripture',
      subjects: ['Study Bible'],
    })
    expect(subjectsForLanguageList([...ALL, extra], 'scripture')).toContain('Study Bible')
    expect(subjectsForLanguageList([...ALL, extra], 'global')).toContain('Study Bible')
    expect(subjectsForLanguageList([...ALL, extra], 'obs')).not.toContain('Study Bible')
  })
})
