import { isNetworkFailure } from '@bt-synergy/resource-pipeline/download/networkFailure'

/**
 * A helps load error as the list shows it: helps that could not be fetched with no network are not on this device
 * (a language pack did not bring that book), not an error.
 */
export type HelpsLoadErrorView = { kind: 'not-on-device' } | { kind: 'error'; message: string }

export function helpsLoadErrorView(message: string): HelpsLoadErrorView {
  return isNetworkFailure(new Error(message)) ? { kind: 'not-on-device' } : { kind: 'error', message }
}
