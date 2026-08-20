import { describe, expect, test } from 'bun:test'
import { subjectsForCompositionAvailability } from '@bt-synergy/resource-types'
import { availabilitySubjectSetsFromRegistry } from './compositionAvailabilitySubjects'
import { combinedHelpsPanelEntry, obsCombinedHelpsPanelEntry } from '../../resourceTypes/combinedHelps'
import { obsQuestionsPanelEntry, questionsPanelEntry } from '../../resourceTypes/panelEntries'
import { obsTranslationNotesResourceType } from '../../resourceTypes/obsTranslationNotes'
import { obsTranslationQuestionsResourceType } from '../../resourceTypes/obsTranslationQuestions'
import { obsTranslationWordsLinksResourceType } from '../../resourceTypes/obsTranslationWordsLinks'
import { translationNotesResourceType } from '../../resourceTypes/translationNotes'
import { translationQuestionsResourceType } from '../../resourceTypes/translationQuestions'
import { translationWordsLinksResourceType } from '../../resourceTypes/translationWordsLinks'
import { scriptureResourceType } from '../../resourceTypes/scripture'
import { obsResourceType } from '../../resourceTypes/obs'

const types = [
  scriptureResourceType,
  obsResourceType,
  translationNotesResourceType,
  translationWordsLinksResourceType,
  translationQuestionsResourceType,
  obsTranslationNotesResourceType,
  obsTranslationWordsLinksResourceType,
  obsTranslationQuestionsResourceType,
]

const compositions = [combinedHelpsPanelEntry, obsCombinedHelpsPanelEntry]
const helpsEntries = [
  ...compositions,
  questionsPanelEntry,
  obsQuestionsPanelEntry,
]

describe('subjectsForCompositionAvailability', () => {
  test('helps-mode entries light CombinedHelps consumes and TQ', () => {
    const subjects = subjectsForCompositionAvailability(helpsEntries, types, 'scripture')
    expect(subjects).toEqual([
      'TSV Translation Notes',
      'TSV Translation Words Links',
      'TSV Translation Questions',
    ])
  })

  test('composition-only callers still omit TQ', () => {
    const subjects = subjectsForCompositionAvailability(compositions, types, 'scripture')
    expect(subjects).toEqual(['TSV Translation Notes', 'TSV Translation Words Links'])
    expect(subjects).not.toContain('TSV Translation Questions')
  })

  test('OBS helps-mode entries light OBS CombinedHelps + OBS questions', () => {
    const subjects = subjectsForCompositionAvailability(helpsEntries, types, 'obs')
    expect(subjects).toEqual([
      'TSV OBS Translation Notes',
      'OBS Translation Notes',
      'TSV OBS Translation Words Links',
      'OBS Translation Words Links',
      'TSV OBS Translation Questions',
      'OBS Translation Questions',
    ])
  })
})

describe('availabilitySubjectSetsFromRegistry', () => {
  test('empty composition subjects fall back to companion language-list subjects', () => {
    const sets = availabilitySubjectSetsFromRegistry(
      {
        subjectsForLanguageList: (kind) => {
          if (kind === 'scripture') return ['Bible']
          if (kind === 'obs') return ['Open Bible Stories']
          if (kind === 'helps') return ['TSV Translation Notes']
          if (kind === 'obs-helps') return ['TSV OBS Translation Notes']
          return []
        },
      },
      {
        subjectsForCompositionAvailability: () => [],
      }
    )
    expect(sets.bibleHelps).toEqual(['TSV Translation Notes'])
    expect(sets.obsHelps).toEqual(['TSV OBS Translation Notes'])
  })
})
