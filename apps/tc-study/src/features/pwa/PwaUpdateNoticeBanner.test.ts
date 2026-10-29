import { describe, expect, mock, test } from 'bun:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import {
  createPwaReloadHandler,
  PWA_UPDATE_NOTICE_TEXT,
  PwaUpdateNoticeBanner,
} from './PwaUpdateNoticeBanner'

describe('PwaUpdateNoticeBanner', () => {
  test('renders nothing when no update is waiting', () => {
    const html = renderToStaticMarkup(
      createElement(PwaUpdateNoticeBanner, {
        needRefresh: false,
        onReload: () => undefined,
      })
    )
    expect(html).toBe('')
  })

  test('renders notice when update is waiting', () => {
    const html = renderToStaticMarkup(
      createElement(PwaUpdateNoticeBanner, {
        needRefresh: true,
        onReload: () => undefined,
      })
    )
    expect(html).toContain(PWA_UPDATE_NOTICE_TEXT)
    expect(html).toContain('aria-label="Reload with new version"')
    expect(html).toContain('title="Reload with new version"')
  })

  test('reload handler only calls updater when pressed', async () => {
    const updateServiceWorker = mock(async (_reloadPage?: boolean) => undefined)
    const onReload = createPwaReloadHandler(updateServiceWorker)

    expect(updateServiceWorker).toHaveBeenCalledTimes(0)
    await onReload()
    expect(updateServiceWorker).toHaveBeenCalledTimes(1)
    expect(updateServiceWorker).toHaveBeenCalledWith(true)
  })
})
