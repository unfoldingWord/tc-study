import { ScriptureMetadata } from '../../types/context';
import { Door43ScriptureAdapter } from './Door43ScriptureAdapter';

/**
 * Adapter for unfoldingWord Simplified Text (UST) resources
 * Falls back to Gateway Language Simplified Text (GST) if UST is not available
 */
export class Door43USTAdapter extends Door43ScriptureAdapter {
  constructor() {
    super({
      resourceIds: ['ust', 'gst'],
      includeAlignments: false,
      includeSections: true,
      usfmVersion: '3.0',
      timeout: 30000,
      retryAttempts: 3,
      retryDelay: 1000,
      validateContent: true
    });
    
    
  }

  override async getResourceMetadata(server: string, owner: string, language: string): Promise<ScriptureMetadata> {
    
    return super.getResourceMetadata(server, owner, language);
  }
}
