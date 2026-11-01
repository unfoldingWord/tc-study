/**
 * Small checks on values that more than one module needs: a decoded CBOR value, or a JSON row of format 2.0 (which has
 * the same shapes plus `null` and fractions). Plain functions, with no Node module.
 */
import type { CborValue } from './cbor'

/** A decoded CBOR map: text keys, any CBOR value. */
export type CborMap = { [key: string]: CborValue }

/** Whether `object` has `key` as its own property. A key like "constructor" or "__proto__" is not found on the prototype. */
export const hasOwn = (object: object, key: string): boolean => Object.prototype.hasOwnProperty.call(object, key)

/**
 * Whether `value` is a map: not `null`, not an array, not a byte string. It checks the shape only; what the values are is
 * for the caller to check.
 */
export function isMap(value: unknown): value is CborMap {
  return typeof value === 'object' && value !== null && !(value instanceof Uint8Array) && !Array.isArray(value)
}
