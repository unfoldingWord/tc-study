import { describe, expect, test } from 'bun:test'
import { HELPS_CARD_FOOTER_BUTTON_TA, HELPS_CARD_FOOTER_BUTTON_TW } from './helpsCardStyles'

describe('helps card footer kind colors (CVD)', () => {
  test('TW uses accent blue, TA uses warning amber — not helps purple', () => {
    expect(HELPS_CARD_FOOTER_BUTTON_TW).toContain('text-accent-fg')
    expect(HELPS_CARD_FOOTER_BUTTON_TW).toContain('hover:text-accent')
    expect(HELPS_CARD_FOOTER_BUTTON_TA).toContain('text-warning-fg')
    expect(HELPS_CARD_FOOTER_BUTTON_TA).toContain('hover:text-warning')
    expect(HELPS_CARD_FOOTER_BUTTON_TA).not.toContain('helps')
  })
})
