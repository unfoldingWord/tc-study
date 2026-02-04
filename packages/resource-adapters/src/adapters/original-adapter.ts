/**
 * Door43 Original Language Adapter
 * 
 * Fetches and parses original language (Greek/Hebrew) scripture
 * This is essentially the same as ScriptureAdapter
 */

import type { Door43Resource } from '@bt-synergy/door43-api'
import { ScriptureAdapter } from './scripture-adapter'
import type { HttpClient } from '../types'

export class OriginalAdapter extends ScriptureAdapter {
  constructor(httpClient: HttpClient) {
    super(httpClient)
  }
  
  getSupportedTypes(): string[] {
    return [
      'Greek New Testament',
      'Hebrew Old Testament',
      'original-language',
    ]
  }
}
