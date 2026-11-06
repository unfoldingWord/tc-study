/**
 * Which languages come as parts from the packs server. While a language is `checking` or served as `parts`, the
 * background Door43 download leaves its resources alone (it would download every book whole and prepare it again),
 * and the originals too: the parts bring the Greek and Hebrew of each book asked for. A language the server does not
 * serve is `door43`, and downloads as before.
 */

import { create } from 'zustand'
import type { SyncResult } from './languageParts'

export type PartsMode = 'checking' | 'parts' | 'door43'
export type PartsModes = Readonly<Record<string, PartsMode>>

const ORIGINAL_LANGUAGES = new Set(['el-x-koine', 'hbo'])

const languageOfKey = (key: string) => key.replace(/#\d+$/, '').split('/')[1] ?? ''

export const partsModeHoldsOriginals = (modes: PartsModes): boolean => Object.values(modes).some((m) => m !== 'door43')

/** The keys the background Door43 download may still queue. */
export function keysLeftToDoor43(keys: readonly string[], modes: PartsModes): string[] {
  const holdsOriginals = partsModeHoldsOriginals(modes)
  return keys.filter((key) => {
    const language = languageOfKey(key)
    if (ORIGINAL_LANGUAGES.has(language)) return !holdsOriginals
    const mode = modes[language]
    return mode === undefined || mode === 'door43'
  })
}

/** A language's mode after a sync. Served as parts, it stays so through a passing failure (a wait, no network). */
export function modeAfter(before: PartsMode | undefined, result: SyncResult): PartsMode {
  if (result.kind === 'applied' || result.kind === 'up-to-date') return 'parts'
  if (result.kind === 'no-language' || result.kind === 'update-app') return 'door43'
  return before === 'parts' ? 'parts' : 'door43'
}

/** What a language is downloading as parts now: the unit (`book tit`, `shared`) and its parts done of total. */
export type PartsProgress = { unit: string; done: number; total: number }

export const usePartsModeStore = create<{
  modes: PartsModes
  progress: Readonly<Record<string, PartsProgress>>
  setMode: (language: string, mode: PartsMode) => void
  setProgress: (language: string, progress: PartsProgress | null) => void
}>((set) => ({
  modes: {},
  progress: {},
  setMode: (language, mode) => set((s) => (s.modes[language] === mode ? s : { modes: { ...s.modes, [language]: mode } })),
  setProgress: (language, progress) =>
    set((s) => {
      if (!progress) {
        if (!(language in s.progress)) return s
        const { [language]: _gone, ...rest } = s.progress
        return { progress: rest }
      }
      return { progress: { ...s.progress, [language]: progress } }
    }),
}))
