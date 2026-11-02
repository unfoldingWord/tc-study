/**
 * Small checks on values that more than one module needs: a decoded CBOR value, or a JSON row of format 2.0 (which has
 * the same shapes plus `null` and fractions). Plain functions, with no Node module.
 */
import type { CborValue } from './cbor'

/** A decoded CBOR map: text keys, any CBOR value. */
export type CborMap = { [key: string]: CborValue }

/** A non-negative integer, as the decoder gives every CBOR unsigned integer (an integer from 0 to 2^53 - 1). */
export const isUint = (value: unknown): value is number => typeof value === 'number' && Number.isSafeInteger(value) && value >= 0

/** The bytes of a hex text (two digits per byte, either case). Throws `Error` for an odd length or a character that is not a hex digit. */
export function hexToBytes(text: string): Uint8Array {
  if (!/^(?:[0-9a-fA-F]{2})*$/.test(text)) throw new Error('not a hex text with two digits per byte')
  const out = new Uint8Array(text.length / 2)
  for (let i = 0; i < out.length; i++) out[i] = parseInt(text.slice(2 * i, 2 * i + 2), 16)
  return out
}

/** The sha256 of `data`, with Web Crypto (in a browser, a Worker and Node alike). */
export async function sha256Digest(data: Uint8Array): Promise<Uint8Array> {
  return new Uint8Array(await crypto.subtle.digest('SHA-256', data as Uint8Array<ArrayBuffer>))
}

/** Whether `object` has `key` as its own property. A key like "constructor" or "__proto__" is not found on the prototype. */
export const hasOwn = (object: object, key: string): boolean => Object.prototype.hasOwnProperty.call(object, key)

/**
 * Whether `value` is a map: not `null`, not an array, not a byte string. It checks the shape only; what the values are is
 * for the caller to check.
 */
export function isMap(value: unknown): value is CborMap {
  return typeof value === 'object' && value !== null && !(value instanceof Uint8Array) && !Array.isArray(value)
}
