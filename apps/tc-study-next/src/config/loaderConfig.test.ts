import { describe, expect, test } from 'bun:test'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { RESOURCE_TYPE_PLUGIN_EXPORTS } from '../resourceTypes/pluginRegistry'
import { RESOURCE_TYPE_IDS } from '../resourceTypes/resourceTypeIds'
import {
  getAllLoaderIds,
  getDownloadPriority,
  getMainPluginConfigs,
  getWorkerDownloadConfigs,
  LOADER_CONFIGS,
} from './loaderConfig'

const CANONICAL_IDS = new Set<string>(Object.values(RESOURCE_TYPE_IDS))

/** Export name → canonical id (mirrors plugin modules without importing viewers). */
const PLUGIN_EXPORT_TO_ID: Record<(typeof RESOURCE_TYPE_PLUGIN_EXPORTS)[number], string> = {
  scriptureResourceType: RESOURCE_TYPE_IDS.SCRIPTURE,
  obsResourceType: RESOURCE_TYPE_IDS.OBS,
  translationWordsLinksResourceType: RESOURCE_TYPE_IDS.TRANSLATION_WORDS_LINKS,
  translationNotesResourceType: RESOURCE_TYPE_IDS.TRANSLATION_NOTES,
  translationQuestionsResourceType: RESOURCE_TYPE_IDS.TRANSLATION_QUESTIONS,
  obsTranslationNotesResourceType: RESOURCE_TYPE_IDS.OBS_NOTES,
  obsTranslationWordsLinksResourceType: RESOURCE_TYPE_IDS.OBS_WORDS_LINKS,
  obsTranslationQuestionsResourceType: RESOURCE_TYPE_IDS.OBS_QUESTIONS,
  translationWordsResourceType: RESOURCE_TYPE_IDS.TRANSLATION_WORDS,
  translationAcademyResourceType: RESOURCE_TYPE_IDS.TRANSLATION_ACADEMY,
  combinedHelpsResourceType: RESOURCE_TYPE_IDS.COMBINED_HELPS,
  obsCombinedHelpsResourceType: RESOURCE_TYPE_IDS.OBS_COMBINED_HELPS,
}

const RESOURCE_TYPES_DIR = join(import.meta.dir, '../resourceTypes')

describe('loaderConfig SoT', () => {
  test('every loader id is a canonical RESOURCE_TYPE_IDS value', () => {
    for (const cfg of LOADER_CONFIGS) {
      expect(CANONICAL_IDS.has(cfg.id)).toBe(true)
      expect(cfg.factoryKey).toBeTruthy()
      expect(cfg.surfaces).toBeDefined()
      expect(typeof cfg.surfaces.mainPlugin).toBe('boolean')
      expect(typeof cfg.surfaces.workerDownload).toBe('boolean')
    }
  })

  test('notes and academy use canonical ids (not tn/ta)', () => {
    const ids = getAllLoaderIds()
    expect(ids).toContain('notes')
    expect(ids).toContain('academy')
    expect(ids).not.toContain('tn')
    expect(ids).not.toContain('ta')
  })

  test('every mainPlugin id is covered by RESOURCE_TYPE_PLUGIN_EXPORTS', () => {
    const pluginIds = new Set(Object.values(PLUGIN_EXPORT_TO_ID))
    for (const cfg of getMainPluginConfigs()) {
      expect(pluginIds.has(cfg.id)).toBe(true)
    }
    for (const name of RESOURCE_TYPE_PLUGIN_EXPORTS) {
      expect(PLUGIN_EXPORT_TO_ID[name]).toBeTruthy()
    }
  })

  test('every RESOURCE_TYPE_PLUGIN_EXPORTS id is a mainPlugin SoT entry', () => {
    const mainIds = new Set(getMainPluginConfigs().map((c) => c.id))
    for (const name of RESOURCE_TYPE_PLUGIN_EXPORTS) {
      expect(mainIds.has(PLUGIN_EXPORT_TO_ID[name])).toBe(true)
    }
  })

  test('every workerDownload id is in LOADER_CONFIGS with non-composite factoryKey', () => {
    const tableIds = new Set(LOADER_CONFIGS.map((c) => c.id))
    for (const cfg of getWorkerDownloadConfigs()) {
      expect(tableIds.has(cfg.id)).toBe(true)
      expect(cfg.surfaces.workerDownload).toBe(true)
      expect(cfg.factoryKey).not.toBe('combined-helps')
    }
  })

  test('combined-helps composites are mainPlugin only (no workerDownload)', () => {
    const combined = LOADER_CONFIGS.find((c) => c.id === RESOURCE_TYPE_IDS.COMBINED_HELPS)
    const obsCombined = LOADER_CONFIGS.find((c) => c.id === RESOURCE_TYPE_IDS.OBS_COMBINED_HELPS)
    expect(combined?.surfaces).toEqual({ mainPlugin: true, workerDownload: false })
    expect(obsCombined?.surfaces).toEqual({ mainPlugin: true, workerDownload: false })
    expect(getWorkerDownloadConfigs().map((c) => c.id)).not.toContain('combined-helps')
    expect(getWorkerDownloadConfigs().map((c) => c.id)).not.toContain('obs-combined-helps')
  })

  test('plugin modules use getDownloadPriority SoT (no hardcoded numeric priorities)', () => {
    const pluginFiles = readdirSync(RESOURCE_TYPES_DIR).filter(
      (f) =>
        f.endsWith('.ts') &&
        !f.endsWith('.test.ts') &&
        !['index.ts', 'resourceTypeIds.ts', 'pluginRegistry.ts', 'autoRegister.ts', 'withPanelCommunication.ts'].includes(
          f
        )
    )
    expect(pluginFiles.length).toBeGreaterThan(5)

    for (const file of pluginFiles) {
      const src = readFileSync(join(RESOURCE_TYPES_DIR, file), 'utf8')
      if (!src.includes('downloadPriority')) continue
      expect(src).toContain('getDownloadPriority')
      expect(src).not.toMatch(/downloadPriority:\s*\d+/)
    }
  })

  test('plugin priorities === table via getDownloadPriority for every SoT id', () => {
    for (const cfg of LOADER_CONFIGS) {
      expect(getDownloadPriority(cfg.id)).toBe(cfg.downloadPriority)
    }
  })

  test('chosen drift resolutions: obs-notes=11, obs-questions=26', () => {
    expect(getDownloadPriority(RESOURCE_TYPE_IDS.OBS_NOTES)).toBe(11)
    expect(getDownloadPriority(RESOURCE_TYPE_IDS.OBS_QUESTIONS)).toBe(26)
  })

  test('worker uses registerWorkerLoaders (no hardcoded registerLoader id literals)', () => {
    const workerSrc = readFileSync(
      join(import.meta.dir, '../workers/backgroundDownload.worker.ts'),
      'utf8'
    )
    expect(workerSrc).toContain('registerWorkerLoaders')
    expect(workerSrc).not.toMatch(/registerLoader\s*\(\s*['"`]/)
    for (const cfg of getWorkerDownloadConfigs()) {
      expect(workerSrc).not.toContain(`registerLoader('${cfg.id}'`)
      expect(workerSrc).not.toContain(`registerLoader("${cfg.id}"`)
    }
  })

  test('workerLoaderRegistry iterates getWorkerDownloadConfigs (not all LOADER_CONFIGS)', () => {
    const registrySrc = readFileSync(
      join(import.meta.dir, '../features/download/workerLoaderRegistry.ts'),
      'utf8'
    )
    expect(registrySrc).toContain('getWorkerDownloadConfigs')
    expect(registrySrc).toContain('loaderRegistry.registerLoader(cfg.id')
    expect(registrySrc).not.toMatch(/for\s*\(\s*const\s+cfg\s+of\s+LOADER_CONFIGS\s*\)/)

    const factoryKeys = new Set(getWorkerDownloadConfigs().map((c) => c.factoryKey))
    for (const key of factoryKeys) {
      const unquoted = `${key}:`
      const quoted = `'${key}':`
      expect(registrySrc.includes(unquoted) || registrySrc.includes(quoted)).toBe(true)
    }
  })

  test('AdminPanel and BackgroundDownloadManager read getDownloadPriority SoT', () => {
    const adminSrc = readFileSync(
      join(import.meta.dir, '../components/dev/AdminPanel.tsx'),
      'utf8'
    )
    const bgSrc = readFileSync(
      join(import.meta.dir, '../lib/services/BackgroundDownloadManager.ts'),
      'utf8'
    )
    expect(adminSrc).toContain('getDownloadPriority')
    expect(bgSrc).toContain('getDownloadPriority')
    expect(adminSrc).not.toContain('resourceType?.downloadPriority')
    expect(bgSrc).not.toContain('resourceType?.downloadPriority')
  })
})
