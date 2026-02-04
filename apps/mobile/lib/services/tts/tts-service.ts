/**
 * TTS Service
 * 
 * Main service for managing Text-to-Speech functionality
 * Handles adapter selection and provides unified API
 */

import { TTSAdapter, TTSConfig, TTSOptions, TTSPlaybackState, TTSService } from '../../types/tts';
import { BrowserTTSAdapter } from './browser-tts-adapter';
import { ExpoSpeechAdapter } from './expo-speech-adapter';

export class TTSServiceImpl implements TTSService {
  private adapter: TTSAdapter | null = null;
  private config: TTSConfig;
  private availableAdapters: Map<string, () => TTSAdapter> = new Map();
  private currentLanguage: string | null = null;
  private currentAudioId: string | null = null;

  constructor(config: TTSConfig = {}) {
    this.config = config;
    this.registerDefaultAdapters();
  }

  private generateAudioId(): string {
    return `tts_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  private registerDefaultAdapters(): void {
    // Register browser adapter
    this.availableAdapters.set('browser', () => new BrowserTTSAdapter());
    
    // Register Expo Speech adapter for React Native
    this.availableAdapters.set('expo-speech', () => new ExpoSpeechAdapter());
    
    // TODO: Register remote adapter when implemented
    // this.availableAdapters.set('remote', () => new RemoteTTSAdapter(this.config.remoteConfig));
  }

  get currentAdapter(): TTSAdapter | null {
    return this.adapter;
  }

  async initialize(preferredAdapter?: string): Promise<boolean> {
    

    // Determine which adapter to try
    // Default to expo-speech on React Native, browser on web
    const defaultAdapter = typeof window !== 'undefined' && window.document ? 'browser' : 'expo-speech';
    const adapterName = preferredAdapter || this.config.preferredPlatform || defaultAdapter;
    
    // Try preferred adapter first
    if (await this.tryInitializeAdapter(adapterName)) {
      return true;
    }

    // Fallback to other available adapters
    for (const [name, factory] of this.availableAdapters) {
      if (name !== adapterName && await this.tryInitializeAdapter(name)) {
        return true;
      }
    }

    console.warn('🔊 TTS: No suitable adapter found');
    return false;
  }

  private async tryInitializeAdapter(adapterName: string): Promise<boolean> {
    const factory = this.availableAdapters.get(adapterName);
    if (!factory) {
      console.warn(`🔊 TTS: Adapter '${adapterName}' not found`);
      return false;
    }

    try {
      
      const adapter = factory();
      
      // Check if adapter was created successfully
      if (!adapter) {
        console.error(`🔊 TTS: Failed to create '${adapterName}' adapter instance`);
        return false;
      }

      // Check if adapter has required methods
      if (typeof adapter.isAvailable !== 'function') {
        console.error(`🔊 TTS: Adapter '${adapterName}' missing isAvailable method`);
        return false;
      }

      const isAvailable = await adapter.isAvailable();
      
      if (isAvailable) {
        // Clean up previous adapter
        if (this.adapter) {
          await this.adapter.dispose();
        }
        
        this.adapter = adapter;
        
        return true;
      } else {
        
        await adapter.dispose();
        return false;
      }
    } catch (error) {
      console.error(`🔊 TTS: Failed to initialize '${adapterName}' adapter:`, error);
      return false;
    }
  }

  async isAvailable(): Promise<boolean> {
    if (!this.adapter) {
      return await this.initialize();
    }
    return await this.adapter.isAvailable();
  }

  setCurrentLanguage(languageCode: string): void {
    this.currentLanguage = languageCode;
  }

  async isCurrentLanguageSupported(): Promise<boolean> {
    if (!this.adapter || !this.currentLanguage) {
      return false;
    }

    return await this.adapter.isLanguageSupported(this.currentLanguage);
  }

  async isPauseResumeSupported(): Promise<boolean> {
    if (!this.adapter) {
      return false;
    }

    return await this.adapter.isPauseResumeSupported();
  }

  async getSupportedLanguages(): Promise<string[]> {
    if (!this.adapter) {
      return [];
    }

    try {
      const voices = await this.adapter.getAllVoices();
      const languages = new Set(voices.map(voice => voice.language));
      return Array.from(languages).sort();
    } catch (error) {
      console.error('🔊 TTS: Failed to get supported languages:', error);
      return [];
    }
  }

  async speak(text: string, options: TTSOptions = {}): Promise<void> {
    if (!this.adapter) {
      throw new Error('TTS service not initialized');
    }

    // Generate unique audio ID for this session
    this.currentAudioId = this.generateAudioId();

    // Merge with default options
    const mergedOptions: TTSOptions = {
      ...this.config.defaultOptions,
      ...options
    };

    // Use current language if not specified
    if (!mergedOptions.language && this.currentLanguage) {
      mergedOptions.language = this.currentLanguage;
    }


    return await this.adapter.speak(text, mergedOptions);
  }

  async pause(): Promise<void> {
    if (!this.adapter) return;
    return await this.adapter.pause();
  }

  async resume(): Promise<void> {
    if (!this.adapter) return;
    return await this.adapter.resume();
  }

  async stop(): Promise<void> {
    if (!this.adapter) return;
    await this.adapter.stop();
    this.currentAudioId = null;
  }

  getPlaybackState(): TTSPlaybackState {
    if (!this.adapter) {
      return {
        isPlaying: false,
        isPaused: false,
        isLoading: false,
        audioId: null
      };
    }
    const state = this.adapter.getPlaybackState();
    return {
      ...state,
      audioId: this.currentAudioId
    };
  }

  onStateChange(callback: (state: TTSPlaybackState) => void): () => void {
    if (!this.adapter) {
      return () => {}; // No-op unsubscribe
    }
    return this.adapter.onStateChange((state) => {
      const stateWithAudioId = {
        ...state,
        audioId: this.currentAudioId
      };
      callback(stateWithAudioId);
    });
  }

  /**
   * Extract readable text from scripture content
   * Removes verse numbers and formatting for better TTS experience
   */
  extractReadableText(scriptureContent: string): string {
    if (!scriptureContent) return '';

    // Remove verse numbers (e.g., "1 ", "12 ", etc. at start of segments)
    let text = scriptureContent.replace(/^\d+\s+/gm, '');
    
    // Remove extra whitespace and normalize
    text = text.replace(/\s+/g, ' ').trim();
    
    // Add natural pauses at sentence boundaries
    text = text.replace(/([.!?])\s+/g, '$1 ');
    
    return text;
  }

  /**
   * Get optimal TTS options for scripture reading
   */
  getScriptureReadingOptions(): TTSOptions {
    return {
      rate: 0.9, // Slightly slower for better comprehension
      pitch: 1.0,
      volume: 1.0,
      maxLength: 5000, // Allow longer text for scripture passages
      ...this.config.defaultOptions
    };
  }

  async dispose(): Promise<void> {
    if (this.adapter) {
      await this.adapter.dispose();
      this.adapter = null;
    }
  }
}

// Global TTS service instance
let ttsServiceInstance: TTSServiceImpl | null = null;

export function getTTSService(config?: TTSConfig): TTSServiceImpl {
  if (!ttsServiceInstance) {
    ttsServiceInstance = new TTSServiceImpl(config);
  }
  return ttsServiceInstance;
}

export function resetTTSService(): void {
  if (ttsServiceInstance) {
    ttsServiceInstance.dispose();
    ttsServiceInstance = null;
  }
}
