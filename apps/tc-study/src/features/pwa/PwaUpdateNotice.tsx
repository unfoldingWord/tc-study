import { useEffect, useMemo, useState } from 'react'
import { registerSW } from 'virtual:pwa-register'
import {
  createPwaReloadHandler,
  type UpdateServiceWorker,
  PwaUpdateNoticeBanner,
} from './PwaUpdateNoticeBanner'

export function PwaUpdateNotice() {
  const [needRefresh, setNeedRefresh] = useState(false)
  const [updateServiceWorker, setUpdateServiceWorker] = useState<UpdateServiceWorker | null>(
    null
  )

  useEffect(() => {
    const update = registerSW({
      immediate: true,
      onNeedRefresh() {
        setNeedRefresh(true)
      },
      onOfflineReady() {
        // No UX surface needed for offline-ready; shell stays quiet unless an update waits.
      },
    })
    setUpdateServiceWorker(() => update)
  }, [])

  const onReload = useMemo(
    () => createPwaReloadHandler(updateServiceWorker),
    [updateServiceWorker]
  )

  return <PwaUpdateNoticeBanner needRefresh={needRefresh} onReload={onReload} />
}
