/**
 * Global Signal Bridge
 * 
 * Bridges global CustomEvents (from modals/non-panel components) 
 * to the linked-panels messaging system.
 * 
 * This allows components outside the panel system (like entry modals)
 * to broadcast signals that panels can receive.
 */

import { useEffect } from 'react'
import { useResourceAPI } from 'linked-panels'
import type { VerseNavigationSignal } from '../../signals/studioSignals'

export function GlobalSignalBridge() {
  // Use resourceAPI without a specific resourceId to broadcast globally
  const api = useResourceAPI<VerseNavigationSignal>('__global__')
  
  useEffect(() => {
    const handleStudioSignal = (event: Event) => {
      const customEvent = event as CustomEvent
      const signal = customEvent.detail
      
      if (!signal || !signal.type) {
        return
      }
      
      console.log('[GlobalSignalBridge] Received global signal:', signal.type, signal)
      
      // Forward verse-navigation signals to all panels
      if (signal.type === 'verse-navigation') {
        api.messaging.sendToAll({
          type: 'verse-navigation',
          verse: signal.verse
        })
        console.log('[GlobalSignalBridge] Forwarded verse-navigation to all panels')
      }
      
      // Add other signal types as needed
    }
    
    window.addEventListener('studio-signal', handleStudioSignal)
    
    return () => {
      window.removeEventListener('studio-signal', handleStudioSignal)
    }
  }, [api])
  
  // This component renders nothing
  return null
}
