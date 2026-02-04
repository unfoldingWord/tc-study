# TTS (Text-to-Speech) Implementation

## Overview

The TTS system has been implemented with an extensible architecture that supports multiple platforms:

### Architecture Components

1. **TTS Types** (`src/types/tts.ts`)
   - Interfaces for adapters, services, voices, and playback state
   - Platform-agnostic type definitions

2. **Browser TTS Adapter** (`src/services/tts/browser-tts-adapter.ts`)
   - Uses Web Speech API (SpeechSynthesis)
   - Supports voice selection and language detection
   - Handles playback state and progress tracking

3. **TTS Service** (`src/services/tts/tts-service.ts`)
   - Manages adapter selection and initialization
   - Provides unified API for all platforms
   - Includes scripture-specific text processing

4. **useTTS Hook** (`src/hooks/useTTS.ts`)
   - React hook for easy component integration
   - Handles initialization and state management
   - Integrates with workspace language settings

5. **TTSControl Component** (`src/components/ui/TTSControl.tsx`)
   - Mobile-first compact UI component
   - Play/pause/stop controls with minimal space usage
   - Progress indicator and error handling

### Integration

The TTS system has been integrated into the Scripture Viewer:

- **Compact play button** in the header (mobile-first design)
- **Automatic text extraction** from current verse/chapter
- **Language support detection** based on workspace settings
- **Optimized for scripture reading** with appropriate speech rate

### Usage

```typescript
// Using the hook directly
const { isAvailable, speak, playbackState } = useTTS();

// Using the component
<TTSControl 
  text="Scripture text to read"
  compact={true}
  title="Read scripture aloud"
/>
```

### Language Support

The system automatically:
- Detects workspace language
- Checks if TTS voices are available for that language
- Only shows TTS controls when language is supported
- Uses appropriate voice selection

### Future Extensions

The architecture supports adding:
- **Mobile TTS Adapter** for React Native
- **Remote TTS Adapter** for server-based synthesis
- **Custom voice configurations**
- **Speed and pitch controls**

### Browser Compatibility

- Chrome/Edge: Full support with high-quality voices
- Firefox: Basic support with system voices
- Safari: Good support with system voices
- Mobile browsers: Limited but functional support
