import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const emptyStateSrc = readFileSync(
  join(import.meta.dir, '../../components/resources/CombinedHelpsViewer/CombinedHelpsEmptyState.tsx'),
  'utf8'
)
const listSrc = readFileSync(
  join(import.meta.dir, '../../components/resources/CombinedHelpsViewer/CombinedHelpsList.tsx'),
  'utf8'
)
const panelSrc = readFileSync(join(import.meta.dir, '../../components/read/ReadLinkedPanel.tsx'), 'utf8')
const viewerSrc = readFileSync(
  join(import.meta.dir, '../../components/resources/CombinedHelpsViewer/index.tsx'),
  'utf8'
)

describe('helps empty copy wiring (issue #24)', () => {
  test('Use English helps is an onClick, never a useEffect auto-switch', () => {
    expect(emptyStateSrc).toContain('selectHelpsLanguage')
    expect(emptyStateSrc).toContain('onClick')
    expect(emptyStateSrc).not.toContain('useEffect(')
    expect(emptyStateSrc).toContain('openHelpsPicker')
  })

  test('ReadLinkedPanel provides helps-language actions to CombinedHelps', () => {
    expect(panelSrc).toContain('HelpsLanguageActionsProvider')
    expect(panelSrc).toContain('selectHelpsLanguage: onLanguageSelected')
    expect(panelSrc).toContain('selectedLanguageCode: languageCode')
    expect(panelSrc).toContain('isCatalogLoading: catalogLoading')
    expect(panelSrc).toContain('openHelpsPicker:')
    expect(panelSrc).toContain('setPickerOpen(true)')
  })

  test('English + Exodus still renders note cards when groups exist (no false empty)', () => {
    expect(listSrc).toContain('mergedGroups.map')
    expect(listSrc).toContain('TranslationNoteCard')
    expect(listSrc).toContain('CombinedHelpsEmptyState')
    expect(listSrc).toContain('explainedHelpsEmptyKind')
    expect(listSrc).not.toContain('No entries for this passage.')
    expect(viewerSrc).toContain('helpsLanguageCode={helpsLanguageCodeForCopy}')
    expect(viewerSrc).toContain('formatHelpsPassageLabel')
    expect(viewerSrc).toContain('helpsLanguageName={helpsLanguageName}')
    expect(viewerSrc).toContain('listedLanguageByCode')
    expect(viewerSrc).toContain('resolveHelpsLanguageCodeForCopy')
    expect(viewerSrc).not.toContain('primaryLangCode(l.code) === wantLang')
    expect(viewerSrc).not.toContain('languageListDisplayName(')
    expect(listSrc).toContain('languageName: helpsLanguageName')
  })
})
