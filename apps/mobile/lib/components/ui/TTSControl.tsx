/**
 * TTS Control Component - React Native Version
 * 
 * Text-to-Speech control component with play/pause, speed control, and voice selection.
 * Preserves all original features in React Native format.
 */

import React, { useCallback, useEffect, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useTTS } from '../../hooks/useTTS';
import { Icon } from './Icon';

// Global state to track which control is currently active
let activeControlId: string | null = null;
const activeControlListeners: Set<(activeId: string | null) => void> = new Set();

const setActiveControl = (controlId: string | null) => {
  activeControlId = controlId;
  activeControlListeners.forEach((listener) => {
    listener(controlId);
  });
};

const subscribeToActiveControl = (listener: (activeId: string | null) => void) => {
  activeControlListeners.add(listener);
  return () => {
    activeControlListeners.delete(listener);
  };
};

interface TTSControlProps {
  /** Text content to be spoken */
  text: string;
  /** Additional CSS classes */
  className?: string;
  /** Compact mode (icon only) */
  compact?: boolean;
  /** Disabled state */
  disabled?: boolean;
  /** Tooltip text */
  title?: string;
  /** Callback when TTS state changes */
  onStateChange?: (isPlaying: boolean) => void;
  /** Callback for each word boundary during TTS playback */
  onWordBoundary?: (wordBoundary: any) => void;
  /** Unique identifier for this TTS control */
  controlId?: string;
  /** Callback when speed changes */
  onSpeedChange?: (speed: number) => void;
  /** Callback when voice changes */
  onVoiceChange?: (voiceId: string) => void;
}

export function TTSControl({
  text,
  className = '',
  compact = true,
  disabled = false,
  title,
  onStateChange,
  onWordBoundary,
  controlId,
  onSpeedChange,
  onVoiceChange
}: TTSControlProps) {
  const {
    isPlaying,
    isPaused,
    currentSpeed,
    currentVoice,
    availableVoices,
    play,
    pause,
    resume,
    stop,
    setSpeed,
    setVoice,
    isAvailable,
    isPauseResumeSupported
  } = useTTS();


  const [showSpeedModal, setShowSpeedModal] = useState(false);
  const [showVoiceModal, setShowVoiceModal] = useState(false);
  const [localSpeed, setLocalSpeed] = useState(currentSpeed);
  const [isThisControlActive, setIsThisControlActive] = useState(false);

  // Subscribe to global active control changes
  useEffect(() => {
    const unsubscribe = subscribeToActiveControl((activeId) => {
      const isActive = activeId === controlId;
      setIsThisControlActive(isActive);
    });

    // Set initial state
    setIsThisControlActive(activeControlId === controlId);

    return () => {
      unsubscribe();
    };
  }, [controlId]);

  // Update local speed when TTS speed changes
  useEffect(() => {
    setLocalSpeed(currentSpeed);
  }, [currentSpeed]);

  // Handle play/pause
  const handlePlayPause = useCallback(() => {
    if (!text || disabled) return;

    if (isPlaying && !isPaused && isThisControlActive && isPauseResumeSupported) {
      // This control is playing and pause is supported, so pause it
      pause();
      onStateChange?.(false);
    } else if (isPaused && isThisControlActive && isPauseResumeSupported) {
      // This control is paused and resume is supported, so resume it
      resume();
      onStateChange?.(true);
    } else if (isPlaying && isThisControlActive && !isPauseResumeSupported) {
      // This control is playing but pause is not supported, so stop it
      stop();
      setActiveControl(null);
      onStateChange?.(false);
    } else {
      // Stop any currently playing audio and start this control
      if (isPlaying) {
        // Stop current audio first
        stop();
      }
      // Set this control as active and start playing
      setActiveControl(controlId || null);
      play(text);
      onStateChange?.(true);
    }
  }, [text, disabled, isPlaying, isPaused, isThisControlActive, isPauseResumeSupported, play, pause, resume, stop, onStateChange, controlId]);

  // Handle stop
  const handleStop = useCallback(() => {
    stop();
    setActiveControl(null);
    onStateChange?.(false);
  }, [stop, onStateChange]);

  // Reset active control when TTS stops globally
  useEffect(() => {
    if (!isPlaying && !isPaused && activeControlId === controlId) {
      setActiveControl(null);
    }
  }, [isPlaying, isPaused, controlId]);


  // Handle speed change
  const handleSpeedChange = useCallback((speed: number) => {
    setSpeed(speed);
    setLocalSpeed(speed);
    onSpeedChange?.(speed);
    setShowSpeedModal(false);
  }, [setSpeed, onSpeedChange]);

  // Handle voice change
  const handleVoiceChange = useCallback((voice: string) => {
    setVoice(voice);
    onVoiceChange?.(voice);
    setShowVoiceModal(false);
  }, [setVoice, onVoiceChange]);

  // Speed options
  const speedOptions = [
    { value: 0.5, label: '0.5x' },
    { value: 0.75, label: '0.75x' },
    { value: 1, label: '1x' },
    { value: 1.25, label: '1.25x' },
    { value: 1.5, label: '1.5x' },
    { value: 2, label: '2x' }
  ];

  // Show controls based on compact mode
  const showSpeedControl = !compact;
  const showVoiceControl = !compact;

  // Get current voice name
  const getCurrentVoiceName = () => {
    if (!currentVoice) return 'Default';
    const voice = availableVoices.find(v => v.voiceURI === currentVoice);
    return voice?.name || 'Unknown';
  };

  // Don't render if TTS is not available
  if (!isAvailable) {
    return null;
  }

  const buttonIcon = isThisControlActive && isPlaying && !isPaused && isPauseResumeSupported ? 'pause' : 'play';
  const showStopButton = (isPlaying || isPaused) && isThisControlActive;

  if (compact) {
    return (
      <View style={styles.compactContainer}>
        <Pressable
          style={[styles.compactButton, disabled && styles.disabled]}
          onPress={handlePlayPause}
          disabled={disabled}
        >
          <Icon
            name={buttonIcon}
            size={16}
            color={disabled ? '#9ca3af' : '#374151'}
          />
        </Pressable>
        
        {/* Show stop button when this control is playing or paused */}
        {showStopButton && (
          <Pressable
            style={[styles.compactButton, disabled && styles.disabled]}
            onPress={handleStop}
            disabled={disabled}
          >
            <Icon
              name="stop"
              size={16}
              color={disabled ? '#9ca3af' : '#374151'}
            />
          </Pressable>
        )}
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Main Controls */}
      <View style={styles.mainControls}>
        <Pressable
          style={[styles.controlButton, disabled && styles.disabled]}
          onPress={handlePlayPause}
          disabled={disabled}
        >
          <Icon
            name={isPlaying && !isPaused ? 'pause' : 'play'}
            size={20}
            color={disabled ? '#9ca3af' : '#374151'}
          />
        </Pressable>

        <Pressable
          style={[styles.controlButton, disabled && styles.disabled]}
          onPress={handleStop}
          disabled={disabled}
        >
          <Icon
            name="stop"
            size={20}
            color={disabled ? '#9ca3af' : '#374151'}
          />
        </Pressable>

        {/* Speed Control */}
        {showSpeedControl && (
          <Pressable
            style={[styles.controlButton, disabled && styles.disabled]}
            onPress={() => setShowSpeedModal(true)}
            disabled={disabled}
          >
            <Text style={[styles.speedText, disabled && styles.disabledText]}>
              {localSpeed}x
            </Text>
          </Pressable>
        )}

        {/* Voice Control */}
        {showVoiceControl && (
          <Pressable
            style={[styles.controlButton, disabled && styles.disabled]}
            onPress={() => setShowVoiceModal(true)}
            disabled={disabled}
          >
            <Text style={[styles.voiceText, disabled && styles.disabledText]}>
              {getCurrentVoiceName()}
            </Text>
          </Pressable>
        )}
      </View>

      {/* Speed Selection Modal */}
      <Modal
        visible={showSpeedModal}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setShowSpeedModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Select Speed</Text>
              <Pressable
                onPress={() => setShowSpeedModal(false)}
                style={styles.closeButton}
              >
                <Text style={styles.closeButtonText}>✕</Text>
              </Pressable>
            </View>

            <ScrollView style={styles.speedList}>
              {speedOptions.map((option) => (
                <Pressable
                  key={option.value}
                  style={[
                    styles.speedOption,
                    localSpeed === option.value && styles.speedOptionSelected
                  ]}
                  onPress={() => handleSpeedChange(option.value)}
                >
                  <Text style={[
                    styles.speedOptionText,
                    localSpeed === option.value && styles.speedOptionTextSelected
                  ]}>
                    {option.label}
                  </Text>
                </Pressable>
              ))}
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Voice Selection Modal */}
      <Modal
        visible={showVoiceModal}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setShowVoiceModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Select Voice</Text>
              <Pressable
                onPress={() => setShowVoiceModal(false)}
                style={styles.closeButton}
              >
                <Text style={styles.closeButtonText}>✕</Text>
              </Pressable>
            </View>

            <ScrollView style={styles.voiceList}>
              {availableVoices.map((voice) => (
                <Pressable
                  key={voice.voiceURI}
                  style={[
                    styles.voiceOption,
                    currentVoice === voice.voiceURI && styles.voiceOptionSelected
                  ]}
                  onPress={() => handleVoiceChange(voice.voiceURI)}
                >
                  <Text style={[
                    styles.voiceOptionText,
                    currentVoice === voice.voiceURI && styles.voiceOptionTextSelected
                  ]}>
                    {voice.name}
                  </Text>
                  <Text style={styles.voiceOptionLanguage}>
                    {voice.lang}
                  </Text>
                </Pressable>
              ))}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  compactContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  mainControls: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  controlButton: {
    padding: 8,
    borderRadius: 6,
    backgroundColor: '#f3f4f6',
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 40,
    minHeight: 40,
  },
  disabled: {
    opacity: 0.5,
  },
  speedText: {
    fontSize: 14,
    fontWeight: '500',
    color: '#374151',
  },
  disabledText: {
    color: '#9ca3af',
  },
  voiceText: {
    fontSize: 14,
    fontWeight: '500',
    color: '#374151',
    maxWidth: 100,
  },
  compactButton: {
    padding: 6,
    borderRadius: 4,
    backgroundColor: '#f3f4f6',
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 32,
    minHeight: 32,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContent: {
    backgroundColor: '#ffffff',
    borderRadius: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.25,
    shadowRadius: 20,
    elevation: 10,
    maxWidth: '90%',
    width: '100%',
    maxHeight: '80%',
    overflow: 'hidden',
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#111827',
  },
  closeButton: {
    padding: 8,
    borderRadius: 6,
  },
  closeButtonText: {
    fontSize: 18,
    color: '#6b7280',
    fontWeight: 'bold',
  },
  speedList: {
    maxHeight: 300,
  },
  speedOption: {
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#f3f4f6',
  },
  speedOptionSelected: {
    backgroundColor: '#dbeafe',
  },
  speedOptionText: {
    fontSize: 16,
    color: '#374151',
  },
  speedOptionTextSelected: {
    color: '#1e40af',
    fontWeight: '600',
  },
  voiceList: {
    maxHeight: 300,
  },
  voiceOption: {
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#f3f4f6',
  },
  voiceOptionSelected: {
    backgroundColor: '#dbeafe',
  },
  voiceOptionText: {
    fontSize: 16,
    color: '#374151',
    marginBottom: 4,
  },
  voiceOptionTextSelected: {
    color: '#1e40af',
    fontWeight: '600',
  },
  voiceOptionLanguage: {
    fontSize: 14,
    color: '#6b7280',
  },
});
