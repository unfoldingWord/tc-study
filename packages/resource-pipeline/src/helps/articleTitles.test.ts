import { describe, expect, test } from 'bun:test'
import {
  parseTAReference,
  resolveTaTitle,
  resolveTwTitle,
  taResourceKeyFor,
  twResourceKeyFor,
  twTitleEntry,
} from './articleTitles'
import { buildTocTitleIndex } from './tocTitleIndex'

describe('títulos de artículos de TA y TW', () => {
  test('una nota lleva al artículo de TA de su mismo dueño e idioma', () => {
    expect(parseTAReference('rc://*/ta/man/translate/figs-metaphor')).toBe('translate/figs-metaphor')
    expect(parseTAReference('figs-metaphor')).toBeNull()
    expect(taResourceKeyFor('es-419_gl/es-419/tn')).toBe('es-419_gl/es-419/ta')
    expect(taResourceKeyFor('tn')).toBeNull()
  })

  test('un título de TA solo se guarda cuando el índice lo tiene', () => {
    const index = buildTocTitleIndex([{ identifier: 'translate/figs-metaphor', title: 'Metáfora' }])
    expect(resolveTaTitle(index, 'translate/figs-metaphor')).toEqual({ value: 'Metáfora', confident: true })
    expect(resolveTaTitle(index, 'translate/figs-simile')).toEqual({ value: 'figs-simile', confident: false })
    expect(resolveTaTitle(null, 'translate/figs-metaphor')).toEqual({ value: 'figs-metaphor', confident: false })
  })

  test('un enlace de palabras lleva al artículo de TW, con la misma clave que guarda la app', () => {
    expect(twResourceKeyFor('es-419_gl/es-419/twl')).toBe('es-419_gl/es-419/tw')
    expect(twResourceKeyFor('unfoldingWord/en_twl')).toBe('unfoldingWord/en_tw')
    expect(twTitleEntry('rc://*/tw/dict/bible/kt/god')).toEqual({
      category: 'kt',
      term: 'god',
      entryId: 'kt/god',
      articleId: 'bible/kt/god',
    })
    expect(twTitleEntry(undefined)).toBeNull()
  })

  test('un título de TW se busca por bible/categoría/término y si no por categoría/término', () => {
    const entry = twTitleEntry('rc://*/tw/dict/bible/kt/god')!
    expect(resolveTwTitle(buildTocTitleIndex([{ identifier: 'bible/kt/god', title: 'Dios' }]), entry)).toEqual({ value: 'Dios', confident: true })
    expect(resolveTwTitle(buildTocTitleIndex([{ path: 'kt/god.md', title: 'Dios' }]), entry)).toEqual({ value: 'Dios', confident: true })
    expect(resolveTwTitle(null, entry)).toEqual({ value: 'god', confident: false })
  })
})
