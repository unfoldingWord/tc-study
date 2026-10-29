import { describe, expect, mock, test } from 'bun:test'
import { buildPwaRegisterOptions, SW_UPDATE_CHECK_MS } from './pwaRegisterOptions'

describe('buildPwaRegisterOptions', () => {
  test('onNeedRefresh marks an update as waiting', () => {
    const setNeedRefresh = mock((_: boolean) => undefined)
    const options = buildPwaRegisterOptions({
      setNeedRefresh,
      setUpdateIntervalId: () => undefined,
    })

    options.onNeedRefresh()

    expect(setNeedRefresh).toHaveBeenCalledTimes(1)
    expect(setNeedRefresh).toHaveBeenCalledWith(true)
  })

  test('onRegisteredSW schedules periodic registration.update', () => {
    const setUpdateIntervalId = mock((_: ReturnType<typeof setInterval> | undefined) => undefined)
    const update = mock(async () => undefined)
    const registration = { update } as unknown as ServiceWorkerRegistration

    const options = buildPwaRegisterOptions({
      setNeedRefresh: () => undefined,
      setUpdateIntervalId,
    })

    options.onRegisteredSW('/sw.js', registration)

    expect(setUpdateIntervalId).toHaveBeenCalledTimes(1)
    const intervalId = setUpdateIntervalId.mock.calls[0]?.[0]
    expect(intervalId).toBeDefined()
    clearInterval(intervalId!)
    expect(update).toHaveBeenCalledTimes(0)

    void registration.update()
    expect(update).toHaveBeenCalledTimes(1)
  })

  test('uses hourly update interval', () => {
    expect(SW_UPDATE_CHECK_MS).toBe(60 * 60 * 1000)
  })

  test('scheduled interval callback invokes registration.update', () => {
    let intervalCallback: (() => void) | undefined
    const originalSetInterval = globalThis.setInterval
    globalThis.setInterval = ((handler: TimerHandler) => {
      if (typeof handler === 'function') intervalCallback = handler as () => void
      return 0 as unknown as ReturnType<typeof setInterval>
    }) as typeof setInterval

    try {
      const update = mock(async () => undefined)
      const registration = { update } as unknown as ServiceWorkerRegistration
      const options = buildPwaRegisterOptions({
        setNeedRefresh: () => undefined,
        setUpdateIntervalId: () => undefined,
      })

      options.onRegisteredSW('/sw.js', registration)

      expect(intervalCallback).toBeDefined()
      intervalCallback!()
      expect(update).toHaveBeenCalledTimes(1)
    } finally {
      globalThis.setInterval = originalSetInterval
    }
  })
})
