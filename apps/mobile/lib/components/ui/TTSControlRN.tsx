/**
 * TTS Control Component - React Native Version
 * 
 * Text-to-Speech control component with play/pause, speed control, and voice selection.
 * Preserves all original features in React Native format.
 */

import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, Pressable, ScrollView, Modal } from 'react-native';
import { useTTS } from '../../hooks/useTTS';
import { Icon } from './Icon';

interface TTSControlProps {
  text?: string;
  className?: string;
  onPlay?: () => void;
  onPause?: () => void;
  onStop?: () => void;
  onSpeedChange?: (speed: number) => void;
  onVoiceChange?: (voice: string) => void;
  disabled?: boolean;
  showSpeedControl?: boolean;
  showVoiceControl?: boolean;
  compact?: boolean;
}

export function TTSControl({
  text,
  className,
  onPlay,
  onPause,
  onStop,
  onSpeedChange,
  onVoiceChange,
  disabled = false,
  showSpeedControl = true,
  showVoiceControl = true,
  compact = false
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
    isSupported
  } = useTTS();

  const [showSpeedModal, setShowSpeedModal] = useState(false);
  const [showVoiceModal, setShowVoiceModal] = useState(false);
  const [localSpeed, setLocalSpeed] = useState(currentSpeed);

  // Update local speed when TTS speed changes
  useEffect(() => {
    setLocalSpeed(currentSpeed);
  }, [currentSpeed]);

  // Handle play/pause
  const handlePlayPause = useCallback(() => {
    if (!text || disabled) return;

    if (isPlaying && !isPaused) {
      pause();
      onPause?.();
    } else if (isPaused) {
      resume();
      onPlay?.();
    } else {
      play(text);
      onPlay?.();
    }
  }, [text, disabled, isPlaying, isPaused, play, pause, resume, onPlay, onPause]);

  // Handle stop
  const handleStop = useCallback(() => {
    stop();
    onStop?.();
  }, [stop, onStop]);

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

  // Get current voice name
  const getCurrentVoiceName = () => {
    if (!currentVoice) return 'Default';
    const voice = availableVoices.find(v => v.voiceURI === currentVoice);
    return voice?.name || 'Unknown';
  };

  // Don't render if TTS is not supported
  if (!isSupported) {
    return null;
  }

  if (compact) {
    return (
      <View style={[styles.compactContainer, className && { className }]}>
        <Pressable
          style={[styles.compactButton, disabled && styles.disabled]}
          onPress={handlePlayPause}
          disabled={disabled}
        >
          <Icon
            name={isPlaying && !isPaused ? 'pause' : 'play'}
            size={16}
            color={disabled ? '#9ca3af' : '#374151'}
          />
        </Pressable>
      </View>
    );
  }

  return (
    <View style={[styles.container, className && { className }]}>
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
