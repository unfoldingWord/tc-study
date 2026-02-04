/**
 * Expo Speech TTS Adapter
 * 
 * React Native TTS adapter using Expo Speech
 */

import { getAvailableVoicesAsync, isSpeakingAsync, pause, resume, speak, stop } from 'expo-speech';
import { TTSAdapter, TTSOptions, TTSPlaybackState, TTSVoice } from '../../types/tts';

export class ExpoSpeechAdapter implements TTSAdapter {
  readonly name = 'expo-speech';
  private isInitialized = false;
  private currentState: TTSPlaybackState = {
    isPlaying: false,
    isPaused: false,
    isLoading: false
  };
  private stateChangeCallbacks: Set<(state: TTSPlaybackState) => void> = new Set();

  async isAvailable(): Promise<boolean> {
    try {
      // expo-speech doesn't have isAvailableAsync, so we test by trying to get voices
      await getAvailableVoicesAsync();
      return true;
    } catch (error) {
      console.error('❌ TTS: Failed to check Expo Speech availability:', error);
      return false;
    }
  }

  async isLanguageSupported(languageCode: string): Promise<boolean> {
    // Expo Speech supports most common languages
    // This is a simplified check - in practice, you might want to test with actual speech
    const supportedLanguages = [
      'en', 'es', 'fr', 'de', 'it', 'pt', 'ru', 'ja', 'ko', 'zh', 'ar', 'hi'
    ];
    return supportedLanguages.includes(languageCode.split('-')[0]);
  }

  async isPauseResumeSupported(): Promise<boolean> {
    try {
      // Try to call pause with no active speech - this will tell us if the method exists
      await pause();
      return true;
    } catch (error) {
      // If pause throws an error about not being available, return false
      if (error instanceof Error && error.message.includes('not available')) {
        return false;
      }
      // For other errors (like "no speech to pause"), assume pause is supported
      return true;
    }
  }

  async getVoicesForLanguage(languageCode: string): Promise<TTSVoice[]> {
    // Expo Speech doesn't provide voice selection API
    // Return a default voice for the language
    return [{
      id: `default-${languageCode}`,
      name: `Default ${languageCode} Voice`,
      language: languageCode,
      isDefault: true,
      quality: 'medium'
    }];
  }

  async getAllVoices(): Promise<TTSVoice[]> {
    try {
      const voices = await getAvailableVoicesAsync();
      return voices.map(voice => ({
        id: voice.identifier || voice.name,
        name: voice.name,
        language: voice.language,
        isDefault: false, // expo-speech Voice type doesn't have isDefault
        quality: voice.quality === 'Enhanced' ? 'high' : 'medium'
      }));
    } catch (error) {
      console.error('❌ TTS: Failed to get available voices:', error);
      // Return default voices for common languages as fallback
      const commonLanguages = ['en', 'es', 'fr', 'de', 'it', 'pt'];
      return commonLanguages.map(lang => ({
        id: `default-${lang}`,
        name: `Default ${lang} Voice`,
        language: lang,
        isDefault: true,
        quality: 'medium'
      }));
    }
  }

  async speak(text: string, options: TTSOptions = {}): Promise<void> {
    try {
      // Ensure text is a string (common issue with expo-speech)
      const textToSpeak = String(text);
      if (!textToSpeak.trim()) {
        console.warn('🔊 TTS: Empty text provided, skipping speech');
        return;
      }


      // Set loading state
      this.currentState = { ...this.currentState, isLoading: true };
      this.stateChangeCallbacks.forEach(callback => callback(this.currentState));

      // Configure speech options
      const speechOptions = {
        language: options.language || 'en',
        pitch: Math.max(0.1, Math.min(2.0, options.pitch || 1.0)), // Clamp pitch
        rate: Math.max(0.1, Math.min(2.0, options.rate || 0.5)), // Clamp rate
        volume: Math.max(0.0, Math.min(1.0, options.volume || 1.0)), // Clamp volume
        onStart: () => {
          this.currentState = {
            isPlaying: true,
            isPaused: false,
            isLoading: false,
            currentText: textToSpeak
          };
          this.stateChangeCallbacks.forEach(callback => callback(this.currentState));
        },
        onDone: () => {
          this.currentState = {
            isPlaying: false,
            isPaused: false,
            isLoading: false
          };
          this.stateChangeCallbacks.forEach(callback => callback(this.currentState));
        },
        onError: (error: any) => {
          this.currentState = {
            isPlaying: false,
            isPaused: false,
            isLoading: false,
            error: error.message || 'Speech error occurred'
          };
          this.stateChangeCallbacks.forEach(callback => callback(this.currentState));
          console.error('❌ TTS: Speech error:', error);
        },
        onStopped: () => {
          this.currentState = {
            isPlaying: false,
            isPaused: false,
            isLoading: false
          };
          this.stateChangeCallbacks.forEach(callback => callback(this.currentState));
        },
      };

      // Start speaking
      speak(textToSpeak, speechOptions);
      
      // Poll for actual speaking state since callbacks might not be reliable
      const checkSpeakingState = async () => {
        try {
          const isSpeaking = await isSpeakingAsync();

          if (isSpeaking && this.currentState.isLoading) {
            this.currentState = {
              isPlaying: true,
              isPaused: false,
              isLoading: false,
              currentText: textToSpeak
            };
            this.stateChangeCallbacks.forEach(callback => callback(this.currentState));
          } else if (!isSpeaking && this.currentState.isPlaying) {
            this.currentState = {
              isPlaying: false,
              isPaused: false,
              isLoading: false
            };
            this.stateChangeCallbacks.forEach(callback => callback(this.currentState));
          }
        } catch (error) {
          console.error('🔊 TTS: Error checking speaking state:', error);
        }
      };
      
      // Check immediately and then periodically
      setTimeout(checkSpeakingState, 100);
      setTimeout(checkSpeakingState, 500);
      setTimeout(checkSpeakingState, 1000);
      
    } catch (error) {
      console.error('❌ TTS: Failed to speak text:', error);
      this.currentState = {
        isPlaying: false,
        isPaused: false,
        isLoading: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
      this.stateChangeCallbacks.forEach(callback => callback(this.currentState));
      throw error;
    }
  }

  async stop(): Promise<void> {
    try {
      await stop();
      this.currentState = {
        isPlaying: false,
        isPaused: false,
        isLoading: false
      };
      this.stateChangeCallbacks.forEach(callback => callback(this.currentState));
      
    } catch (error) {
      console.error('❌ TTS: Failed to stop speech:', error);
    }
  }

  async pause(): Promise<void> {
    try {
      await pause();
      this.currentState = {
        isPlaying: false,
        isPaused: true,
        isLoading: false
      };
      this.stateChangeCallbacks.forEach(callback => callback(this.currentState));
    } catch {
      // On Android, pause/resume is not supported, so we'll stop instead
      console.warn('⚠️ TTS: Pause not supported on this platform, stopping instead');
      await this.stop();
    }
  }

  async resume(): Promise<void> {
    try {
      await resume();
      this.currentState = {
        isPlaying: true,
        isPaused: false,
        isLoading: false
      };
      this.stateChangeCallbacks.forEach(callback => callback(this.currentState));
    } catch {
      // On Android, pause/resume is not supported
      console.warn('⚠️ TTS: Resume not supported on this platform');
      // Since resume failed, we'll just update the state to reflect that we're not paused
      this.currentState = {
        isPlaying: false,
        isPaused: false,
        isLoading: false
      };
      this.stateChangeCallbacks.forEach(callback => callback(this.currentState));
    }
  }

  getPlaybackState(): TTSPlaybackState {
    return this.currentState;
  }

  onStateChange(callback: (state: TTSPlaybackState) => void): () => void {
    this.stateChangeCallbacks.add(callback);
    return () => {
      this.stateChangeCallbacks.delete(callback);
    };
  }

  async dispose(): Promise<void> {
    await this.stop();
    this.stateChangeCallbacks.clear();
  }
}
