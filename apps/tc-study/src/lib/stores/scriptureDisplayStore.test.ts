import { beforeEach, describe, expect, test } from 'bun:test'
import {
  useScriptureDisplayStore,
  type ScriptureLayoutMode,
} from './scriptureDisplayStore'

describe('scriptureDisplayStore', () => {
  beforeEach(() => {
    useScriptureDisplayStore.setState({ layoutMode: 'verse-block' })
  })

  test('toggleLayoutMode flips between verse-block and formatted', () => {
    expect(useScriptureDisplayStore.getState().layoutMode).toBe('verse-block')
    useScriptureDisplayStore.getState().toggleLayoutMode()
    expect(useScriptureDisplayStore.getState().layoutMode).toBe('formatted')
    useScriptureDisplayStore.getState().toggleLayoutMode()
    expect(useScriptureDisplayStore.getState().layoutMode).toBe('verse-block')
  })

  test('setLayoutMode updates store state', () => {
    const next: ScriptureLayoutMode = 'formatted'
    useScriptureDisplayStore.getState().setLayoutMode(next)
    expect(useScriptureDisplayStore.getState().layoutMode).toBe(next)
  })
})
