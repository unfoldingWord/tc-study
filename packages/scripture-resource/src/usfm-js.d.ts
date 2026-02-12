/**
 * Type declarations for usfm-js (used when compiling usfm-processor from source)
 */
declare module 'usfm-js' {
  export function toJSON(usfm: string, options?: unknown): unknown
  export function toUSFM(json: unknown, options?: unknown): string
}
