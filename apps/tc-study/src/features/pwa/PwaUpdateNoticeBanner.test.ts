import { describe, expect, mock, test } from 'bun:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import {
  createPwaReloadHandler,
  getPwaUpdateReloadButtonProps,
  PWA_UPDATE_NOTICE_LABEL,
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

  test('renders icon-only notice with live region when update is waiting', () => {
    const html = renderToStaticMarkup(
      createElement(PwaUpdateNoticeBanner, {
        needRefresh: true,
        onReload: () => undefined,
      })
    )
    expect(html).not.toContain('<span>')
    expect(html).toContain(`aria-label="${PWA_UPDATE_NOTICE_LABEL}"`)
    expect(html).toContain(`title="${PWA_UPDATE_NOTICE_LABEL}"`)
    expect(html).toContain('role="status"')
    expect(html).toContain('aria-live="polite"')
  })

  test('reload handler only calls updater when pressed', async () => {
    const updateServiceWorker = mock(async (_reloadPage?: boolean) => undefined)
    const onReload = createPwaReloadHandler(updateServiceWorker)

    expect(updateServiceWorker).toHaveBeenCalledTimes(0)
    await onReload()
    expect(updateServiceWorker).toHaveBeenCalledTimes(1)
    expect(updateServiceWorker).toHaveBeenCalledWith(true)
  })

  test('reload button props invoke onReload only when clicked', async () => {
    const onReload = mock(async () => undefined)
    const props = getPwaUpdateReloadButtonProps(onReload)

    expect(onReload).toHaveBeenCalledTimes(0)
    await props.onClick()
    expect(onReload).toHaveBeenCalledTimes(1)
  })
})
