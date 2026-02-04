/**
 * Type declarations for usfm-js
 */

declare module 'usfm-js' {
  export function toJSON(usfm: string, options?: any): any
  export function toUSFM(json: any, options?: any): string
}



