import { useEffect, useState } from 'react'
import { NARROW_VIEWPORT_MQ } from './readPanelLayout'

/** Mobile-first: assume narrow until the matchMedia listener says otherwise. */
export function useIsNarrowViewport(): boolean {
  const [narrow, setNarrow] = useState(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return true
    return window.matchMedia(NARROW_VIEWPORT_MQ).matches
  })

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return
    const mq = window.matchMedia(NARROW_VIEWPORT_MQ)
    const onChange = () => setNarrow(mq.matches)
    onChange()
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [])

  return narrow
}
