import { useEffect, useMemo, useState } from 'react'
import { registerSW } from 'virtual:pwa-register'
import {
  createPwaReloadHandler,
  type UpdateServiceWorker,
  PwaUpdateNoticeBanner,
} from './PwaUpdateNoticeBanner'

const SW_UPDATE_CHECK_MS = 60 * 60 * 1000

export function PwaUpdateNotice() {
  const [needRefresh, setNeedRefresh] = useState(false)
  const [updateServiceWorker, setUpdateServiceWorker] = useState<UpdateServiceWorker | null>(
    null
  )

  useEffect(() => {
    let updateIntervalId: ReturnType<typeof setInterval> | undefined

    const update = registerSW({
      immediate: true,
      onNeedRefresh() {
        setNeedRefresh(true)
      },
      onOfflineReady() {
        // No UX surface needed for offline-ready; shell stays quiet unless an update waits.
      },
      onRegisteredSW(_swScriptUrl, registration) {
        if (!registration) return
        updateIntervalId = setInterval(() => {
          void registration.update()
        }, SW_UPDATE_CHECK_MS)
      },
    })
    setUpdateServiceWorker(() => update)

    return () => {
      if (updateIntervalId) clearInterval(updateIntervalId)
    }
  }, [])

  const onReload = useMemo(
    () => createPwaReloadHandler(updateServiceWorker),
    [updateServiceWorker]
  )

  return <PwaUpdateNoticeBanner needRefresh={needRefresh} onReload={onReload} />
}
