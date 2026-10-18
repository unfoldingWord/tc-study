/**
 * The pipeline has to run where there is no screen: a browser worker, Node, a server. This loads every module with
 * no `window` or `document` and fails if one of them needs them just to be imported.
 */
import { describe, expect, test } from 'bun:test'

describe('resource-pipeline sin pantalla', () => {
  test('no hay window ni document en este entorno', () => {
    expect(typeof (globalThis as { window?: unknown }).window).toBe('undefined')
    expect(typeof (globalThis as { document?: unknown }).document).toBe('undefined')
  })

  test('todos sus módulos se cargan sin window ni document', async () => {
    const pipeline = await import('./index')
    expect(typeof pipeline.preparedUnitKey).toBe('function')
    expect(typeof pipeline.helpsTextKey).toBe('function')
    expect(typeof pipeline.buildQuoteTokens).toBe('function')
    expect(typeof pipeline.markdownToHastSync).toBe('function')
    expect(typeof pipeline.findAlignedTokens).toBe('function')
    expect(typeof pipeline.helpsQuoteKey).toBe('function')
    expect(typeof pipeline.helpsAlignKey).toBe('function')
    expect(typeof pipeline.prepareBookWithPreparer).toBe('function')
    expect(typeof pipeline.scripturePreparer.prepareFull).toBe('function')
    expect(typeof pipeline.markRelationCovered).toBe('function')
  })

  test('al cargarse registra los nueve preparadores de tc-study', async () => {
    const p = await import('./index')
    expect(p.ensurePreparersRegistered().length).toBe(9)
    expect(p.resolveOriginalLanguageKey('EZR')?.resourceKey).toBe('unfoldingWord/hbo/uhb')
    expect(p.resolveOriginalLanguageKey('TIT')?.resourceKey).toBe('unfoldingWord/el-x-koine/ugnt')
  })

  test('las versiones son las que los paquetes de idioma llevan en su manifiesto', async () => {
    const p = await import('./index')
    expect(p.HELPS_QUOTE_VERSION).toBe(5)
    expect(p.HELPS_ALIGN_VERSION).toBe(8)
    expect(p.SCRIPTURE_PREPARE_VERSION).toBe(5000230)
    expect(p.WARM_COVERAGE_KEY).toBe('warm-coverage:v1')
  })

  test('las claves salen igual que en tc-study', async () => {
    const { preparedUnitKey, preparedNavKey, helpsTextKey } = await import('./index')
    expect(preparedUnitKey('notes', 'es-419_gl/es-419/tn', 'TIT', 1, 'full')).toBe('prepared:notes:es-419_gl/es-419/tn:tit:1:full')
    expect(preparedNavKey('scripture', 'es-419_gl/es-419/glt', 'EZR')).toBe('prepared:scripture:es-419_gl/es-419/glt:ezr:nav')
    expect(helpsTextKey('ta-title', 'es-419_gl/es-419/ta', 'v1', 'translate/figs-metaphor')).toBe('helps-text:ta-title:es-419_gl/es-419/ta@v1:translate/figs-metaphor')
  })
})
