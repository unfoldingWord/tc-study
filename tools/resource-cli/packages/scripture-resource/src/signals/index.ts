/**
 * Scripture Custom Signals
 * 
 * Define custom signals specific to this resource type.
 * For standard signals, import from @bt-synergy/resource-signals
 */

import type { BaseSignal } from '@bt-synergy/resource-panels'

// Example custom signal
export interface ScriptureNavigationSignal extends BaseSignal {
  type: 'scripture-navigation'
  // Add signal-specific fields
  target: string
}

// Export all custom signal types
export type ScriptureSignals = ScriptureNavigationSignal
