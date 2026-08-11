import { describe, expect, test } from 'bun:test'
import { Glob } from 'bun'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

const ROOT = join(import.meta.dir, '..')

const LINKED_PANELS_IMPORT_RE =
  /import\s*(?:type\s*)?(?:\{[^}]*\}|\*\s+as\s+\w+|\w+)\s*from\s*['"]linked-panels['"]/
const USE_CURRENT_STATE_RE =
  /import\s*\{[^}]*\buseCurrentState\b[^}]*\}\s*from\s*['"]linked-panels['"]/
const USE_RESOURCE_API_RE =
  /import\s*\{[^}]*\buseResourceAPI\b[^}]*\}\s*from\s*['"]linked-panels['"]/
const USE_EVENTS_RE =
  /import\s*\{[^}]*\buseEvents\b[^}]*\}\s*from\s*['"]linked-panels['"]/

/** Production paths that must use `@bt-synergy/resource-panels` for messaging. */
const SHELL_SCAN_GLOBS = [
  'components/read/**/*.{ts,tsx}',
  'components/studio/**/*.{ts,tsx}',
  'features/read/**/*.{ts,tsx}',
  'features/studio/**/*.{ts,tsx}',
  'plugins/**/*.{ts,tsx}',
] as const

/** Direct `linked-panels` imports allowed only in DEV harness (not production). */
function isDirectLinkedPanelsAllowlisted(rel: string): boolean {
  return rel.startsWith('components/test/')
}

/**
 * Production shell surfaces that must import container APIs from
 * `@bt-synergy/resource-panels` (single public messaging surface).
 */
const SHELL_CONTAINER_IMPORT_FILES = [
  'components/read/SimplifiedReadView.tsx',
  'components/read/ReadLinkedPanel.tsx',
  'components/studio/LinkedPanelsStudio.tsx',
  'components/studio/StudioLinkedPanel.tsx',
  'features/studio/createStudioPluginRegistry.ts',
  'features/studio/useStudioPanelConfig.ts',
  'features/read/useReadLinkedPanelsConfig.tsx',
  'plugins/messageTypePlugins.ts',
  'plugins/types.ts',
] as const

const RESOURCE_PANELS_IMPORT_RE =
  /from\s+['"]@bt-synergy\/resource-panels['"]/
/**
 * Retired shell-only adapter — must not reappear as a competing façade.
 */
const RETIRED_SHELL_ADAPTER_IMPORT_RE =
  /from\s+['"][^'"]*(?:features\/messaging\/shellLinkedPanels|(?:\.\.\/)+messaging\/shellLinkedPanels|\.\/shellLinkedPanels)['"]/
const FEATURES_MESSAGING_CONTAINER_RE =
  /from\s+['"][^'"]*(?:features\/messaging|(?:\.\.\/)+messaging)['"]/

describe('messagingGuards', () => {
  test('production resources/** do not import plugins/types or linked-panels STATE/messaging hooks', async () => {
    const glob = new Glob('components/resources/**/*.{ts,tsx}')
    const offenders: string[] = []
    for await (const path of glob.scan(ROOT)) {
      const rel = path.replace(/\\/g, '/')
      if (rel.includes('.test.') || rel.includes('__tests__')) continue
      // Legacy backups / scratch files are not production viewers
      if (rel.includes('/_') || rel.endsWith('.backup') || rel.endsWith('.old.tsx')) continue
      const src = readFileSync(join(ROOT, path), 'utf8')
      if (src.includes('plugins/types')) {
        offenders.push(`${rel} imports plugins/types`)
      }
      if (USE_EVENTS_RE.test(src)) {
        offenders.push(`${rel} imports useEvents from linked-panels`)
      }
      if (USE_CURRENT_STATE_RE.test(src)) {
        offenders.push(`${rel} imports useCurrentState from linked-panels`)
      }
      if (USE_RESOURCE_API_RE.test(src)) {
        offenders.push(`${rel} imports useResourceAPI from linked-panels`)
      }
      if (LINKED_PANELS_IMPORT_RE.test(src)) {
        offenders.push(`${rel} imports from linked-panels (use @bt-synergy/resource-panels)`)
      }
    }
    expect(offenders).toEqual([])
  })

  test('single messaging surface: shells + viewers use resource-panels; no linked-panels / shell adapter', async () => {
    expect(existsSync(join(ROOT, 'features/messaging/shellLinkedPanels.ts'))).toBe(false)

    const messagingIndex = readFileSync(join(ROOT, 'features/messaging/index.ts'), 'utf8')
    expect(messagingIndex).toContain('isScriptureTokensOwner')
    expect(messagingIndex).not.toContain('LinkedPanelsContainer')
    expect(messagingIndex).not.toContain('LinkedPanel')
    expect(messagingIndex).not.toMatch(RESOURCE_PANELS_IMPORT_RE)
    expect(messagingIndex).not.toMatch(LINKED_PANELS_IMPORT_RE)

    const offenders: string[] = []
    for (const pattern of SHELL_SCAN_GLOBS) {
      const glob = new Glob(pattern)
      for await (const path of glob.scan(ROOT)) {
        const rel = path.replace(/\\/g, '/')
        if (rel.includes('.test.') || rel.includes('__tests__')) continue
        const src = readFileSync(join(ROOT, path), 'utf8')
        if (LINKED_PANELS_IMPORT_RE.test(src)) {
          offenders.push(
            `${rel} imports linked-panels directly (use @bt-synergy/resource-panels)`
          )
        }
        if (RETIRED_SHELL_ADAPTER_IMPORT_RE.test(src)) {
          offenders.push(`${rel} imports retired shellLinkedPanels adapter`)
        }
        if (FEATURES_MESSAGING_CONTAINER_RE.test(src) && /LinkedPanel|createPlugin|createDefaultPluginRegistry|LinkedPanelsConfig|BaseMessageContent/.test(src)) {
          // Container/STATE must not come from features/messaging (ownership helpers only)
          const containerImport = src.match(
            /import\s+(?:type\s+)?\{[^}]*\b(?:LinkedPanel|LinkedPanelsContainer|createPlugin|createDefaultPluginRegistry|LinkedPanelsConfig|BaseMessageContent)\b[^}]*\}\s*from\s+['"][^'"]*(?:features\/messaging|(?:\.\.\/)+messaging)['"]/
          )
          if (containerImport) {
            offenders.push(
              `${rel} imports container/STATE APIs from features/messaging (use @bt-synergy/resource-panels)`
            )
          }
        }
      }
    }

    // Whole src tree: no silent linked-panels outside DEV harness
    const allGlob = new Glob('**/*.{ts,tsx}')
    for await (const path of allGlob.scan(ROOT)) {
      const rel = path.replace(/\\/g, '/')
      if (rel.includes('.test.') || rel.includes('__tests__')) continue
      if (rel.includes('/_') || rel.endsWith('.backup') || rel.endsWith('.old.tsx')) continue
      if (isDirectLinkedPanelsAllowlisted(rel)) continue
      const src = readFileSync(join(ROOT, path), 'utf8')
      if (LINKED_PANELS_IMPORT_RE.test(src)) {
        offenders.push(`${rel} imports linked-panels directly (quarantine: components/test only)`)
      }
      if (RETIRED_SHELL_ADAPTER_IMPORT_RE.test(src)) {
        offenders.push(`${rel} imports retired shellLinkedPanels adapter`)
      }
    }

    for (const rel of SHELL_CONTAINER_IMPORT_FILES) {
      const src = readFileSync(join(ROOT, rel), 'utf8')
      expect(src, rel).not.toMatch(/from\s+['"]linked-panels['"]/)
      expect(src, rel).not.toMatch(RETIRED_SHELL_ADAPTER_IMPORT_RE)
      expect(src, rel).not.toMatch(FEATURES_MESSAGING_CONTAINER_RE)
      expect(src, rel).toMatch(RESOURCE_PANELS_IMPORT_RE)
    }

    expect(offenders).toEqual([])
  })

  test('Studio DnD uses atomic addResource({ panelId }) — no add-then-assign dual-write', () => {
    // Peel: atomic add lives in studioDnDHelpers; hook must delegate (not dual-write).
    const hook = readFileSync(join(ROOT, 'features/studio/useStudioDnD.ts'), 'utf8')
    const helpers = readFileSync(join(ROOT, 'features/studio/studioDnDHelpers.ts'), 'utf8')
    expect(hook).toContain('addResourceKeysToPanel')
    expect(hook).not.toMatch(/assignResourceToPanel\s*\(/)
    expect(hook).not.toMatch(/addResource\([^,]+,\s*true\s*\)/)
    expect(helpers).toMatch(/addResource\([^)]*\{[\s\S]*panelId[\s\S]*\}/)
    expect(helpers).not.toMatch(/assignResourceToPanel\s*\(/)
  })

  test('ScriptureViewer uses resource-panels signal handlers', () => {
    const index = readFileSync(
      join(ROOT, 'components/resources/ScriptureViewer/index.tsx'),
      'utf8'
    )
    expect(index).toContain('useSignalHandler')
    expect(index).not.toContain("from 'linked-panels'")
    expect(
      existsSync(join(ROOT, 'components/resources/ScriptureViewer/hooks/useEvents.ts'))
    ).toBe(false)
  })

  test('ScriptureViewer production path does not wire useContentRequests', () => {
    const index = readFileSync(
      join(ROOT, 'components/resources/ScriptureViewer/index.tsx'),
      'utf8'
    )
    expect(index).not.toMatch(/\buseContentRequests\b/)
    expect(index).toContain('useTokenBroadcast')
    const hooksIndex = readFileSync(
      join(ROOT, 'components/resources/ScriptureViewer/hooks/index.ts'),
      'utf8'
    )
    // Export may remain for rollback, but production index must not import it
    expect(index).not.toMatch(/from\s+['"]\.\/hooks['"][\s\S]*useContentRequests/)
    expect(hooksIndex).toContain('useContentRequests')
    const quarantined = readFileSync(
      join(ROOT, 'components/resources/ScriptureViewer/hooks/useContentRequests.ts'),
      'utf8'
    )
    expect(quarantined).toContain('QUARANTINED')
  })

  test('OBS quotes and scripture tokens use ownership-safe STATE keys', () => {
    const tn = readFileSync(
      join(ROOT, 'components/resources/TranslationNotesViewer/hooks/useTranslationNotesSignals.ts'),
      'utf8'
    )
    const twl = readFileSync(
      join(ROOT, 'components/resources/WordsLinksViewer/hooks/useWordsLinksSignals.ts'),
      'utf8'
    )
    const obs = readFileSync(
      join(ROOT, 'components/resources/ObsViewer/hooks/useObsFrameQuotes.ts'),
      'utf8'
    )
    const tokens = readFileSync(
      join(ROOT, 'components/resources/ScriptureViewer/hooks/useTokenBroadcast.ts'),
      'utf8'
    )
    expect(tn).toContain('OBS_FRAME_QUOTES_TN')
    expect(tn).not.toContain("RESOURCE_STATE_KEYS.OBS_FRAME_QUOTES,")
    expect(twl).toContain('OBS_FRAME_QUOTES_TWL')
    expect(obs).toContain('OBS_FRAME_QUOTES_TN')
    expect(obs).toContain('OBS_FRAME_QUOTES_TWL')
    expect(obs).toContain('mergeObsFrameQuotesStates')
    expect(tokens).toContain('isScriptureTokensOwner')
    expect(tokens).toContain('SCRIPTURE_TOKENS')
  })

  test('SCRIPTURE_TOKENS bootstrap denies when lastActive and anchor are null', () => {
    const ownership = readFileSync(
      join(ROOT, 'features/messaging/scriptureTokensOwnership.ts'),
      'utf8'
    )
    // Multi-owner bootstrap (allow-all when both null) is forbidden
    expect(ownership).not.toContain('return true')
    expect(ownership).toContain('return false')
    expect(ownership).toMatch(/lastActiveScriptureResourceId/)
    expect(ownership).toMatch(/anchorResourceId/)
  })

  test('TN/TWL/CombinedHelps leave via clearResourceState — no empty tokenGroups sendToAll', () => {
    const files = [
      'components/resources/TranslationNotesViewer/hooks/useTranslationNotesSignals.ts',
      'components/resources/WordsLinksViewer/hooks/useWordsLinksSignals.ts',
      'components/resources/CombinedHelpsViewer/useCombinedHelpsTokenGroupsBroadcast.ts',
    ]
    for (const rel of files) {
      const src = readFileSync(join(ROOT, rel), 'utf8')
      expect(src, rel).not.toMatch(/tokenGroups:\s*\[\s*\]/)
      expect(src, rel).toMatch(/clearResourceState|clearOnUnmount/)
    }
  })

  test('Studio panel config uses helps-filtered panel keys (Read-equivalent hide)', () => {
    const studio = readFileSync(join(ROOT, 'components/studio/LinkedPanelsStudio.tsx'), 'utf8')
    expect(studio).toContain('useStudioPanelConfig')
    expect(studio).toContain('panel2Resources.resourceKeys')
    // Must not wire raw workspace panel-2 keys into panel config
    expect(studio).not.toMatch(
      /useStudioPanelConfig\(\s*\{[^}]*panel2ResourceKeys,\s*$/m
    )
  })

  test('Studio keeps LinkedPanelsContainer mounted across wizard (store singleton)', () => {
    const studio = readFileSync(join(ROOT, 'components/studio/LinkedPanelsStudio.tsx'), 'utf8')
    // Container must wrap both wizard and panels — not only the non-wizard branch
    expect(studio).toMatch(
      /<LinkedPanelsContainer[\s\S]*\{showWizard \?[\s\S]*ResourceWizardPanel[\s\S]*<\/LinkedPanelsContainer>/
    )
    // Entry modal (may use panel viewers) must stay under the container
    const containerIdx = studio.indexOf('<LinkedPanelsContainer')
    const modalIdx = studio.indexOf('<EntryResourceModal')
    const closeIdx = studio.lastIndexOf('</LinkedPanelsContainer>')
    expect(containerIdx).toBeGreaterThanOrEqual(0)
    expect(modalIdx).toBeGreaterThan(containerIdx)
    expect(modalIdx).toBeLessThan(closeIdx)
  })

  test('resources STATE uses resource-panels hooks (not linked-panels dual-stack)', () => {
    const files = [
      'components/resources/WordsLinksViewer/hooks/useScriptureTokens.ts',
      'components/resources/ScriptureViewer/hooks/useTokenBroadcast.ts',
      'components/resources/ScriptureViewer/hooks/useUnderlinedTokens.ts',
      'components/resources/ObsViewer/hooks/useObsFrameQuotes.ts',
      'components/resources/CombinedHelpsViewer/useCombinedHelpsTokenGroupsBroadcast.ts',
      'components/resources/CombinedHelpsViewer/useCombinedHelpsObsQuotesBroadcast.ts',
      'components/resources/TranslationNotesViewer/hooks/useTranslationNotesSignals.ts',
      'components/resources/WordsLinksViewer/hooks/useWordsLinksSignals.ts',
    ]
    for (const rel of files) {
      const src = readFileSync(join(ROOT, rel), 'utf8')
      expect(src, rel).not.toMatch(/from\s+['"]linked-panels['"]/)
      const usesState =
        src.includes('useResourceState') || src.includes('useResourceStateSender')
      expect(usesState, `${rel} should use useResourceState(Sender)`).toBe(true)
      expect(src, rel).toContain('RESOURCE_STATE_KEYS')
      expect(src, rel).toMatch(RESOURCE_PANELS_IMPORT_RE)
    }
  })
})
