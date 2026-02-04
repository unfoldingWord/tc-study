/**
 * Text-to-Speech (TTS) Types and Interfaces
 * 
 * Provides extensible TTS architecture supporting multiple platforms:
 * - Browser (Web Speech API)
 * - Mobile (React Native TTS)
 * - Remote Server (Custom API)
 */

export interface TTSVoice {
  /** Unique identifier for the voice */
  id: string;
  /** Human-readable name of the voice */
  name: string;
  /** Language code (e.g., 'en-US', 'es-ES') */
  language: string;
  /** Whether this is the default voice for the language */
  isDefault?: boolean;
  /** Voice quality indicator */
  quality?: 'low' | 'medium' | 'high';
  /** Platform-specific voice data */
  platformData?: any;
}

export interface TTSOptions {
  /** Speech rate (0.1 to 10, default 1) */
  rate?: number;
  /** Speech pitch (0 to 2, default 1) */
  pitch?: number;
  /** Speech volume (0 to 1, default 1) */
  volume?: number;
  /** Preferred voice ID */
  voiceId?: string;
  /** Language code override */
  language?: string;
  /** Maximum text length (default 3000 characters) */
  maxLength?: number;
  /** Callback fired for each word boundary */
  onWordBoundary?: (word: TTSWordBoundary) => void;
}

export interface TTSWordBoundary {
  /** The word being spoken */
  word: string;
  /** Character index where the word starts in the full text */
  charIndex: number;
  /** Character length of the word */
  charLength: number;
  /** Progress through the text (0 to 1) */
  progress: number;
  /** Elapsed time since speech started (in seconds) */
  elapsedTime: number;
}

export interface TTSPlaybackState {
  /** Whether TTS is currently playing */
  isPlaying: boolean;
  /** Whether TTS is paused */
  isPaused: boolean;
  /** Whether TTS is loading/preparing */
  isLoading: boolean;
  /** Current text being spoken */
  currentText?: string;
  /** Unique ID for the current audio session */
  audioId?: string;
  /** Playback progress (0 to 1) */
  progress?: number;
  /** Current word being spoken */
  currentWord?: TTSWordBoundary;
  /** Error message if playback failed */
  error?: string;
}

export interface TTSAdapter {
  /** Adapter name for identification */
  readonly name: string;
  
  /** Check if TTS is available on this platform */
  isAvailable(): Promise<boolean>;
  
  /** Check if a specific language is supported */
  isLanguageSupported(languageCode: string): Promise<boolean>;
  
  /** Check if pause/resume functionality is supported */
  isPauseResumeSupported(): Promise<boolean>;
  
  /** Get available voices for a language */
  getVoicesForLanguage(languageCode: string): Promise<TTSVoice[]>;
  
  /** Get all available voices */
  getAllVoices(): Promise<TTSVoice[]>;
  
  /** Speak the given text */
  speak(text: string, options?: TTSOptions): Promise<void>;
  
  /** Pause current speech */
  pause(): Promise<void>;
  
  /** Resume paused speech */
  resume(): Promise<void>;
  
  /** Stop current speech */
  stop(): Promise<void>;
  
  /** Get current playback state */
  getPlaybackState(): TTSPlaybackState;
  
  /** Subscribe to playback state changes */
  onStateChange(callback: (state: TTSPlaybackState) => void): () => void;
  
  /** Clean up resources */
  dispose(): Promise<void>;
}

export interface TTSService {
  /** Current adapter being used */
  readonly currentAdapter: TTSAdapter | null;
  
  /** Initialize TTS service with preferred adapter */
  initialize(preferredAdapter?: string): Promise<boolean>;
  
  /** Check if TTS is available */
  isAvailable(): Promise<boolean>;
  
  /** Check if current workspace language is supported */
  isCurrentLanguageSupported(): Promise<boolean>;
  
  /** Check if pause/resume functionality is supported */
  isPauseResumeSupported(): Promise<boolean>;
  
  /** Get supported languages */
  getSupportedLanguages(): Promise<string[]>;
  
  /** Speak text with current settings */
  speak(text: string, options?: TTSOptions): Promise<void>;
  
  /** Pause current speech */
  pause(): Promise<void>;
  
  /** Resume paused speech */
  resume(): Promise<void>;
  
  /** Stop current speech */
  stop(): Promise<void>;
  
  /** Get current playback state */
  getPlaybackState(): TTSPlaybackState;
  
  /** Subscribe to playback state changes */
  onStateChange(callback: (state: TTSPlaybackState) => void): () => void;
}

export type TTSPlatform = 'browser' | 'mobile' | 'remote';

export interface TTSConfig {
  /** Preferred platform adapter */
  preferredPlatform?: TTSPlatform;
  /** Default TTS options */
  defaultOptions?: TTSOptions;
  /** Remote server configuration (if using remote adapter) */
  remoteConfig?: {
    baseUrl: string;
    apiKey?: string;
    timeout?: number;
  };
}
