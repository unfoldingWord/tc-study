export const SW_UPDATE_CHECK_MS = 60 * 60 * 1000

export type PwaRegisterOptionHandlers = {
  setNeedRefresh: (value: boolean) => void
  setUpdateIntervalId: (id: ReturnType<typeof setInterval> | undefined) => void
}

/** Options passed to vite-plugin-pwa `registerSW` — extracted for unit tests. */
export function buildPwaRegisterOptions(handlers: PwaRegisterOptionHandlers) {
  return {
    immediate: true as const,
    onNeedRefresh() {
      handlers.setNeedRefresh(true)
    },
    onOfflineReady() {
      // No UX surface needed for offline-ready; shell stays quiet unless an update waits.
    },
    onRegisteredSW(_swScriptUrl: string, registration: ServiceWorkerRegistration | undefined) {
      if (!registration) return
      handlers.setUpdateIntervalId(
        setInterval(() => {
          void registration.update()
        }, SW_UPDATE_CHECK_MS)
      )
    },
  }
}
