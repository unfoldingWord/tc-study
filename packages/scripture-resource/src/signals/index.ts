/**
 * Scripture-specific signals
 * 
 * While most signals are defined in the app's studioSignals,
 * resource-specific packages can define custom signals here
 * if they have unique communication needs.
 * 
 * For scripture, we mostly use standard signals from the app,
 * but this file is here for future custom signals if needed.
 */

import type { BaseSignal } from '@bt-synergy/resource-panels'

// Example: Scripture-specific signal (if needed in future)
// export interface ScriptureParallelViewSignal extends BaseSignal {
//   type: 'scripture-parallel-view'
//   alignment: {
//     sourceVerse: string
//     targetVerse: string
//     alignmentData: any
//   }
// }

// For now, we use standard signals from the app
// See: apps/tc-study/src/signals/studioSignals.ts
