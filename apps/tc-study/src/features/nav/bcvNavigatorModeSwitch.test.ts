import { describe, expect, test } from 'bun:test'
import { navigatorCommittedScope, resolveScripturePickerGrain } from './bcvNavigatorModeSwitch'

describe('navigatorCommittedScope', () => {
  test('language pick staying on Bible is not a mode switch', () => {
    expect(
      navigatorCommittedScope({ previousScope: 'scripture', pickerScope: 'scripture' })
    ).toBeNull()
  })

  test('explicit Stories apply reports obs; explicit Bible apply reports scripture', () => {
    expect(navigatorCommittedScope({ previousScope: 'scripture', pickerScope: 'obs' })).toBe(
      'obs'
    )
    expect(navigatorCommittedScope({ previousScope: 'obs', pickerScope: 'scripture' })).toBe(
      'scripture'
    )
  })
})

describe('resolveScripturePickerGrain', () => {
  test('explicit picker mode wins over navigation mode', () => {
    expect(resolveScripturePickerGrain('verse', 'chapter')).toBe('verse')
    expect(resolveScripturePickerGrain('section', 'verse')).toBe('section')
  })

  test('without a picker mode, follow navigation mode and default to verse', () => {
    expect(resolveScripturePickerGrain(undefined, 'section')).toBe('section')
    expect(resolveScripturePickerGrain(undefined, 'chapter')).toBe('chapter')
    expect(resolveScripturePickerGrain(undefined, 'passage-set')).toBe('verse')
  })
})
