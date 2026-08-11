/**
 * Signal Definitions
 *
 * - studioSignals: facade (EVENT + STATE aliases + registry)
 * - studioStateSignals: STATE → `@bt-synergy/resource-panels`
 * - studioEventSignals: EVENT contracts
 * - testSignals: testing/dev (import `./testSignals` for TokenClickSignal overlap)
 */

export * from './studioSignals'

// Test-only signals (imports should use `./testSignals` for `TokenClickSignal` — name overlaps studio)
export type {
  LinkClickSignal,
  NavigationRequestSignal,
  TestSignal,
} from './testSignals'
