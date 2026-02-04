/**
 * Type definitions for usfm-js
 */

declare module 'usfm-js' {
  export interface USFMParseResult {
    chapters: any;
    headers: any[];
    verses: Record<string, any>;
  }

  export function toJSON(usfm: string, options?: any): USFMParseResult;
  export function toUSFM(json: any, options?: any): string;
}


