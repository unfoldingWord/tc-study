/**
 * Browser TTS Adapter
 * 
 * Implements TTS using the Web Speech API (SpeechSynthesis)
 * Available in modern browsers with good language support
 */

import { TTSAdapter, TTSOptions, TTSPlaybackState, TTSVoice } from '../../types/tts';

export class BrowserTTSAdapter implements TTSAdapter {
  readonly name = 'browser';
  
  private synthesis: SpeechSynthesis | null = null;
  private currentUtterance: SpeechSynthesisUtterance | null = null;
  private playbackState: TTSPlaybackState = {
    isPlaying: false,
    isPaused: false,
    isLoading: false
  };
  private stateChangeCallbacks: ((state: TTSPlaybackState) => void)[] = [];
  private voicesCache: SpeechSynthesisVoice[] | null = null;

  constructor() {
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      this.synthesis = window.speechSynthesis;
      this.setupEventListeners();
    }
  }
  isPauseResumeSupported(): Promise<boolean> {
    throw new Error('Method not implemented.');
  }

  private setupEventListeners(): void {
    if (!this.synthesis) return;

    // Listen for voices changed event (voices load asynchronously)
    this.synthesis.addEventListener('voiceschanged', () => {
      this.voicesCache = null; // Clear cache to reload voices
    });
  }

  private updatePlaybackState(updates: Partial<TTSPlaybackState>): void {
    this.playbackState = { ...this.playbackState, ...updates };
    this.stateChangeCallbacks.forEach(callback => callback(this.playbackState));
  }

  private setupUtteranceEvents(utterance: SpeechSynthesisUtterance, text: string, options: TTSOptions = {}): void {
    utterance.onstart = () => {
      
      this.updatePlaybackState({
        isPlaying: true,
        isPaused: false,
        isLoading: false,
        currentText: text,
        error: undefined
      });
    };

    utterance.onend = () => {
      
      this.updatePlaybackState({
        isPlaying: false,
        isPaused: false,
        isLoading: false,
        currentText: undefined,
        progress: 1,
        currentWord: undefined
      });
      // Clear word boundary callback when finished
      if (options.onWordBoundary) {
        options.onWordBoundary({ word: '', charIndex: 0, charLength: 0, progress: 1.0, elapsedTime: 0 });
      }
    };

    utterance.onerror = (event) => {
      console.error('🔊 TTS: Speech error:', event.error, event);
      this.updatePlaybackState({
        isPlaying: false,
        isPaused: false,
        isLoading: false,
        error: `Speech synthesis error: ${event.error}`
      });
    };

    utterance.onpause = () => {
      
      this.updatePlaybackState({
        isPlaying: false,
        isPaused: true,
        currentWord: undefined
      });
      // Clear word boundary callback when paused
      if (options.onWordBoundary) {
        options.onWordBoundary({ word: '', charIndex: 0, charLength: 0, progress: 0, elapsedTime: 0 });
      }
    };

    utterance.onresume = () => {
      
      this.updatePlaybackState({
        isPlaying: true,
        isPaused: false
      });
    };

    // Track word-level progress with detailed information
    const startTime = Date.now();
    let wordBoundaryFallbackTimer: NodeJS.Timeout | null = null;
    let boundaryEventFired = false;
    
    utterance.onboundary = (event) => {
      if (event.name === 'word' && text.length > 0) {
        boundaryEventFired = true;
        const progress = Math.min(event.charIndex / text.length, 1);
        const elapsedTime = (Date.now() - startTime) / 1000; // Convert to seconds
        
        // Extract the current word being spoken
        const wordStart = event.charIndex;
        const remainingText = text.substring(wordStart);
        const wordMatch = remainingText.match(/^\S+/); // Match first word (non-whitespace)
        const currentWord = wordMatch ? wordMatch[0] : '';
        
        const wordBoundary = {
          word: currentWord,
          charIndex: wordStart,
          charLength: currentWord.length,
          progress,
          elapsedTime
        };
        
        
        
        this.updatePlaybackState({ 
          progress,
          currentWord: wordBoundary
        });
        
        // Call custom word boundary callback if provided
        if (options.onWordBoundary) {
          options.onWordBoundary(wordBoundary);
        }
      }
    };
    
    // Mobile fallback: Simulate word boundaries using timing
    // This is needed because Android Chrome often doesn't fire onboundary events
    const setupMobileFallback = () => {
      // Wait a bit to see if native boundary events work
      setTimeout(() => {
        if (!boundaryEventFired && this.playbackState.isPlaying && options.onWordBoundary) {
          
          
          // Estimate speech rate (average 150-200 words per minute)
          const words = text.split(/\s+/).filter(word => word.length > 0);
          const estimatedWPM = 180; // words per minute
          const msPerWord = (60 * 1000) / estimatedWPM;
          
          let currentWordIndex = 0;
          let currentCharIndex = 0;
          
          const simulateWordBoundary = () => {
            if (!this.playbackState.isPlaying || currentWordIndex >= words.length) {
              return;
            }
            
            const currentWord = words[currentWordIndex];
            const progress = Math.min(currentCharIndex / text.length, 1);
            const elapsedTime = (Date.now() - startTime) / 1000;
            
            const wordBoundary = {
              word: currentWord,
              charIndex: currentCharIndex,
              charLength: currentWord.length,
              progress,
              elapsedTime
            };
            
            
            
            this.updatePlaybackState({ 
              progress,
              currentWord: wordBoundary
            });
            
            if (options.onWordBoundary) {
              options.onWordBoundary(wordBoundary);
            }
            
            // Move to next word
            currentWordIndex++;
            currentCharIndex += currentWord.length + 1; // +1 for space
            
            // Schedule next word
            if (currentWordIndex < words.length && this.playbackState.isPlaying) {
              wordBoundaryFallbackTimer = setTimeout(simulateWordBoundary, msPerWord);
            }
          };
          
          // Start the fallback
          simulateWordBoundary();
        }
      }, 500); // Wait 500ms to see if native events work
    };
    
    // Set up mobile fallback
    setupMobileFallback();
    
    // Clean up fallback timer when speech ends
    const originalOnEnd = utterance.onend;
    utterance.onend = (event) => {
      if (wordBoundaryFallbackTimer) {
        clearTimeout(wordBoundaryFallbackTimer);
        wordBoundaryFallbackTimer = null;
      }
      if (originalOnEnd) {
        originalOnEnd.call(utterance, event);
      }
    };
  }

  async isAvailable(): Promise<boolean> {
    return this.synthesis !== null;
  }

  async isLanguageSupported(languageCode: string): Promise<boolean> {
    if (!this.synthesis) return false;

    const voices = await this.getAllVoices();
    
    // Debug: Log available voices and the language we're checking
    
    
    
    // Get fallback languages to try in order of preference
    const languagesToTry = this.getLanguageFallbacks(languageCode);
    
    
    // Try each language in order of preference
    for (const lang of languagesToTry) {
      const isSupported = voices.some(voice => 
        voice.language.toLowerCase().startsWith(lang.toLowerCase()) ||
        voice.language.toLowerCase().replace('-', '_').startsWith(lang.toLowerCase().replace('-', '_'))
      );
      
      if (isSupported) {
        
        return true;
      }
    }
    
    
    return false;
  }

  private getLanguageFallbacks(languageCode: string): string[] {
    // Define fallback languages in order of preference
    const fallbackMap: Record<string, string[]> = {
      'es-419': ['es-MX', 'es-ES', 'es-AR', 'es-CO', 'es'], // Latin American Spanish fallbacks
      'en-US': ['en-US', 'en-GB', 'en'],                    // US English fallbacks
      'pt-BR': ['pt-BR', 'pt-PT', 'pt'],                    // Brazilian Portuguese fallbacks
      // Add more fallback chains as needed
    };
    
    // If we have specific fallbacks, use them
    if (fallbackMap[languageCode]) {
      return fallbackMap[languageCode];
    }
    
    // Otherwise, try the original code and its base language
    const baseLanguage = languageCode.split('-')[0];
    return languageCode === baseLanguage ? [languageCode] : [languageCode, baseLanguage];
  }

  private mapLanguageCode(languageCode: string): string {
    // Map common language codes to browser-supported ones (legacy method, now using fallbacks)
    const languageMap: Record<string, string> = {
      'es-419': 'es-MX', // Latin American Spanish -> Mexican Spanish
      'en-US': 'en',     // US English -> Generic English
      'pt-BR': 'pt',     // Brazilian Portuguese -> Generic Portuguese
      // Add more mappings as needed
    };
    
    return languageMap[languageCode] || languageCode;
  }

  async getVoicesForLanguage(languageCode: string): Promise<TTSVoice[]> {
    const allVoices = await this.getAllVoices();
    const languagesToTry = this.getLanguageFallbacks(languageCode);
    
    // Try each language in order of preference and return voices for the first match
    for (const lang of languagesToTry) {
      const matchingVoices = allVoices.filter(voice => 
        voice.language.toLowerCase().startsWith(lang.toLowerCase()) ||
        voice.language.toLowerCase().replace('-', '_').startsWith(lang.toLowerCase().replace('-', '_'))
      );
      
      if (matchingVoices.length > 0) {
        return matchingVoices;
      }
    }
    
    return [];
  }

  async getAllVoices(): Promise<TTSVoice[]> {
    if (!this.synthesis) return [];

    // Use cached voices if available
    if (this.voicesCache) {
      return this.mapSynthesisVoices(this.voicesCache);
    }

    // Get voices (may be empty initially, voices load asynchronously)
    let voices = this.synthesis.getVoices();
    
    // If no voices yet, wait for them to load
    if (voices.length === 0) {
      await new Promise<void>((resolve) => {
        const checkVoices = () => {
          voices = this.synthesis!.getVoices();
          if (voices.length > 0) {
            resolve();
          } else {
            setTimeout(checkVoices, 100);
          }
        };
        
        // Also listen for the voiceschanged event
        const onVoicesChanged = () => {
          voices = this.synthesis!.getVoices();
          if (voices.length > 0) {
            this.synthesis!.removeEventListener('voiceschanged', onVoicesChanged);
            resolve();
          }
        };
        
        this.synthesis!.addEventListener('voiceschanged', onVoicesChanged);
        checkVoices();
        
        // Timeout after 2 seconds
        setTimeout(() => {
          this.synthesis!.removeEventListener('voiceschanged', onVoicesChanged);
          resolve();
        }, 2000);
      });
    }

    this.voicesCache = voices;
    return this.mapSynthesisVoices(voices);
  }

  private mapSynthesisVoices(voices: SpeechSynthesisVoice[]): TTSVoice[] {
    return voices.map((voice, index) => ({
      id: `${voice.name}-${voice.lang}-${index}`,
      name: voice.name,
      language: voice.lang,
      isDefault: voice.default,
      quality: voice.localService ? 'high' : 'medium',
      platformData: voice
    }));
  }

  async speak(text: string, options: TTSOptions = {}): Promise<void> {
    if (!this.synthesis) {
      throw new Error('Speech synthesis not available');
    }

    // Stop any current speech
    await this.stop();

    // Chrome workaround: "Prime" the synthesis with a silent utterance
    if (!this.synthesis.speaking && !this.synthesis.pending) {
      const testUtterance = new SpeechSynthesisUtterance('');
      testUtterance.volume = 0;
      this.synthesis.speak(testUtterance);
    }

    this.updatePlaybackState({
      isLoading: true,
      error: undefined
    });

    try {
      // Some browsers have issues with very long text, but we can handle more than 500 chars
      // Most browsers can handle 2000-4000 characters reliably
      const maxLength = options.maxLength ?? 3000;
      const textToSpeak = text.length > maxLength ? text.substring(0, maxLength) + '...' : text;
      
      
      
      const utterance = new SpeechSynthesisUtterance(textToSpeak);
      
      // Apply options
      utterance.rate = options.rate ?? 1;
      utterance.pitch = options.pitch ?? 1;
      utterance.volume = options.volume ?? 1;
      
      if (options.language) {
        utterance.lang = options.language;
      }
      
      if (options.voiceId) {
        const voices = await this.getAllVoices();
        const selectedVoice = voices.find(v => v.id === options.voiceId);
        if (selectedVoice?.platformData) {
          utterance.voice = selectedVoice.platformData;
        }
      }


      this.setupUtteranceEvents(utterance, text, options);
      this.currentUtterance = utterance;
      
      // Ensure voices are loaded before speaking
      const voices = await this.getAllVoices();
      
      
      if (voices.length === 0) {
        throw new Error('No voices available for speech synthesis');
      }
      
      // If no voice was explicitly set, find the best voice for the current language
      if (!utterance.voice) {
        let selectedVoice = null;
        
        // First, try to find a voice for the utterance language
        if (utterance.lang) {
          const languagesToTry = this.getLanguageFallbacks(utterance.lang);
          
          
          for (const lang of languagesToTry) {
            selectedVoice = voices.find(v => 
              v.language.toLowerCase().startsWith(lang.toLowerCase()) ||
              v.language.toLowerCase().replace('-', '_').startsWith(lang.toLowerCase().replace('-', '_'))
            );
            if (selectedVoice) {
              
              break;
            }
          }
        }
        
        // If still no voice found, try current service language
        if (!selectedVoice && this.currentLanguage) {
          const languagesToTry = this.getLanguageFallbacks(this.currentLanguage);
          
          
          for (const lang of languagesToTry) {
            selectedVoice = voices.find(v => 
              v.language.toLowerCase().startsWith(lang.toLowerCase()) ||
              v.language.toLowerCase().replace('-', '_').startsWith(lang.toLowerCase().replace('-', '_'))
            );
            if (selectedVoice) {
              
              break;
            }
          }
        }
        
        // Last resort: use first available voice
        if (!selectedVoice) {
          selectedVoice = voices[0];
          
        }
        
        if (selectedVoice?.platformData) {
          utterance.voice = selectedVoice.platformData;
          
        }
      }
      
      
      
      // Chrome workaround: Sometimes synthesis needs to be "primed"
      if (this.synthesis.paused) {
        this.synthesis.resume();
      }
      
      
      this.synthesis.speak(utterance);
      
      // Chrome workaround: Force start if it doesn't start automatically
      setTimeout(() => {
        if (this.synthesis.paused) {
          
          this.synthesis.resume();
        }
      }, 100);
      
      // Add a timeout to reset loading state if speech doesn't start
      setTimeout(() => {
        if (this.playbackState.isLoading && !this.playbackState.isPlaying) {
          console.warn('🔊 TTS: Speech did not start within 3 seconds, resetting state');
          this.updatePlaybackState({
            isLoading: false,
            error: 'Speech did not start - try again'
          });
        }
      }, 3000);
      
    } catch (error) {
      console.error('🔊 TTS: Failed to speak:', error);
      this.updatePlaybackState({
        isLoading: false,
        error: error instanceof Error ? error.message : 'Failed to start speech'
      });
      throw error;
    }
  }

  async pause(): Promise<void> {
    if (!this.synthesis) return;
    
    if (this.synthesis.speaking && !this.synthesis.paused) {
      this.synthesis.pause();
    }
  }

  async resume(): Promise<void> {
    if (!this.synthesis) return;
    
    if (this.synthesis.paused) {
      this.synthesis.resume();
    }
  }

  async stop(): Promise<void> {
    if (!this.synthesis) return;
    
    if (this.synthesis.speaking || this.synthesis.pending) {
      this.synthesis.cancel();
      this.currentUtterance = null;
      this.updatePlaybackState({
        isPlaying: false,
        isPaused: false,
        isLoading: false,
        currentText: undefined,
        progress: 0,
        currentWord: undefined
      });
    }
  }

  getPlaybackState(): TTSPlaybackState {
    return { ...this.playbackState };
  }

  onStateChange(callback: (state: TTSPlaybackState) => void): () => void {
    this.stateChangeCallbacks.push(callback);
    
    // Return unsubscribe function
    return () => {
      const index = this.stateChangeCallbacks.indexOf(callback);
      if (index > -1) {
        this.stateChangeCallbacks.splice(index, 1);
      }
    };
  }

  async dispose(): Promise<void> {
    await this.stop();
    this.stateChangeCallbacks = [];
    this.voicesCache = null;
  }
}
