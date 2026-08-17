import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

describe('Read URL sync wiring (internal vs external)', () => {
  test('internal pick does not call hydrate / handleLanguageSelected / both-pane catalog clear', () => {
    const hydrate = readFileSync(join(import.meta.dir, 'useReadUrlLanguageHydrate.ts'), 'utf8')
    expect(hydrate).toContain('shouldHydrateReadLanguages')
    expect(hydrate).toContain("getReadNavigationSource()")
    expect(hydrate).toContain('hydrateLanguagesFromUrl')
    expect(hydrate).toContain('handleLanguageSelected')

    const panel = readFileSync(join(import.meta.dir, 'useReadPanelLanguageHandlers.ts'), 'utf8')
    const pick = panel.slice(panel.indexOf('const handlePanelLanguageSelected'))
    const body = pick.slice(0, pick.indexOf('const handlePanelModeSwitch'))
    expect(body).toContain("panel.mode === 'scripture'")
    expect(body).toContain('replaceReadLanguageUrlFromUi')
    expect(body).toContain('catalogLoadForSinglePanel')
    expect(body).not.toContain('hydrateLanguagesFromUrl')
    expect(body).not.toContain('hydrateLanguagesFromHint')
    expect(body).not.toContain('handleLanguageSelected')
    expect(body).not.toContain('coldStartCatalogLoads')

    const helps = panel.slice(panel.indexOf('const handleHelpsLanguageSelected'))
    expect(helps).not.toContain('replaceReadLanguageUrlFromUi')
  })

  test('in-app URL write is replaceState, not React Router navigate', () => {
    const sync = readFileSync(join(import.meta.dir, 'useReadUrlSync.ts'), 'utf8')
    expect(sync).toContain('replaceReadUrlFromUi(action.replace)')
    expect(sync).toContain('subscribeReadPopstate')
    expect(sync).not.toContain('useNavigate')
    expect(sync).not.toContain('navigate(action.replace')

    const push = readFileSync(join(import.meta.dir, 'pushReadLanguageUrl.ts'), 'utf8')
    expect(push).toContain('replaceReadUrlFromUi')
    expect(push).not.toContain('NavigateFunction')
    expect(push).not.toContain('navigate(')

    const boot = readFileSync(join(import.meta.dir, 'useReadLanguageBootstrap.ts'), 'utf8')
    expect(boot).not.toContain('useNavigate')
    expect(boot).not.toContain('pushReadLanguageUrl(navigate')
    expect(boot).toContain('replaceReadLanguageUrlFromUi')
    expect(boot).toContain('useReadUrlLanguageHydrate')
    expect(boot).not.toContain('key={')
  })

  test('Read parses the path itself and App uses a single read/* route', () => {
    const page = readFileSync(join(import.meta.dir, '../../pages/Read.tsx'), 'utf8')
    expect(page).toContain('parseReadUrl')
    expect(page).not.toContain('useParams')
    expect(page).not.toContain('key={')

    const app = readFileSync(join(import.meta.dir, '../../App.tsx'), 'utf8')
    expect(app).toContain('path="read/*"')
    expect(app).not.toContain('read/:languageCode')
  })
})
