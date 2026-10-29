import { useEffect, useMemo, useState } from 'react'
import { registerSW } from 'virtual:pwa-register'
import {
  createPwaReloadHandler,
  type UpdateServiceWorker,
  PwaUpdateNoticeBanner,
} from './PwaUpdateNoticeBanner'
import { buildPwaRegisterOptions } from './pwaRegisterOptions'

export function PwaUpdateNotice() {
  const [needRefresh, setNeedRefresh] = useState(false)
  const [updateServiceWorker, setUpdateServiceWorker] = useState<UpdateServiceWorker | null>(
    null
  )

  useEffect(() => {
    let updateIntervalId: ReturnType<typeof setInterval> | undefined

    const update = registerSW(
      buildPwaRegisterOptions({
        setNeedRefresh,
        setUpdateIntervalId: (id) => {
          updateIntervalId = id
        },
      })
    )
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
