import { describe, expect, test } from 'bun:test'
import { navigatorCommittedScope } from './bcvNavigatorModeSwitch'

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
