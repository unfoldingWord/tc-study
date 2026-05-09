/**
 * Signal Definitions
 * 
 * All signal types for inter-resource communication.
 * Organized by context:
 * - studioSignals: General studio/production signals
 * - testSignals: Testing and development signals
 */

// Studio signals for production use
export * from './studioSignals'

// Test-only signals (imports should use `./testSignals` for `TokenClickSignal` — name overlaps studio)
export type {
  LinkClickSignal,
  NavigationRequestSignal,
  TestSignal,
} from './testSignals'
