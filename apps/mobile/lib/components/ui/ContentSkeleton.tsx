/**
 * Content Skeleton Loading Components
 * 
 * Reusable skeleton components for different content types:
 * - Notes/Questions content
 * - Modal/Article content
 * - List items
 * 
 * Uses React Native's built-in Animated API for compatibility.
 */

import React, { useEffect, useRef } from 'react';
import { Animated, StyleSheet, View } from 'react-native';

/**
 * Single animated skeleton bone
 */
const SkeletonBone: React.FC<{ width: number | string; height: number; style?: any }> = ({ 
  width, 
  height, 
  style 
}) => {
  const shimmerAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(shimmerAnim, {
          toValue: 1,
          duration: 1000,
          useNativeDriver: true,
        }),
        Animated.timing(shimmerAnim, {
          toValue: 0,
          duration: 1000,
          useNativeDriver: true,
        }),
      ])
    );
    animation.start();
    return () => animation.stop();
  }, [shimmerAnim]);

  const opacity = shimmerAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0.3, 0.7],
  });

  return (
    <Animated.View
      style={[
        styles.bone,
        { width, height, opacity },
        style,
      ]}
    />
  );
};

/**
 * Skeleton for Notes or Questions content
 * Shows multiple note cards with headers and content lines
 */
export const NotesContentSkeleton: React.FC<{ itemCount?: number }> = ({ 
  itemCount = 3 
}) => {
  const getRandomWidth = (min: number, max: number) => {
    return Math.floor(Math.random() * (max - min) + min);
  };

  return (
    <View style={styles.container}>
      {Array.from({ length: itemCount }).map((_, noteIndex) => {
        const lineCount = Math.floor(Math.random() * 2) + 2; // 2-3 lines
        
        return (
          <View key={`note-${noteIndex}`} style={styles.noteCard}>
            {/* Note header */}
            <SkeletonBone width={120} height={20} style={styles.noteHeader} />
            
            {/* Note content lines */}
            {Array.from({ length: lineCount }).map((_, lineIndex) => {
              const isLastLine = lineIndex === lineCount - 1;
              const width = isLastLine 
                ? getRandomWidth(180, 250)
                : getRandomWidth(280, 340);
              
              return (
                <SkeletonBone
                  key={`line-${lineIndex}`}
                  width={width}
                  height={16}
                  style={styles.noteLine}
                />
              );
            })}
          </View>
        );
      })}
    </View>
  );
};

/**
 * Skeleton for Modal/Article content
 * Shows title and paragraph blocks
 */
export const ArticleContentSkeleton: React.FC = () => {
  return (
    <View style={styles.container}>
      {/* Title */}
      <SkeletonBone width={220} height={28} style={styles.title} />
      
      {/* First paragraph */}
      <View style={styles.paragraph}>
        <SkeletonBone width={340} height={16} style={styles.paragraphLine} />
        <SkeletonBone width={320} height={16} style={styles.paragraphLine} />
        <SkeletonBone width={280} height={16} style={styles.paragraphLine} />
      </View>
      
      {/* Second paragraph */}
      <View style={styles.paragraph}>
        <SkeletonBone width={350} height={16} style={styles.paragraphLine} />
        <SkeletonBone width={330} height={16} style={styles.paragraphLine} />
        <SkeletonBone width={300} height={16} style={styles.paragraphLine} />
        <SkeletonBone width={220} height={16} style={styles.paragraphLine} />
      </View>
      
      {/* Third paragraph */}
      <View style={styles.paragraph}>
        <SkeletonBone width={340} height={16} style={styles.paragraphLine} />
        <SkeletonBone width={260} height={16} style={styles.paragraphLine} />
      </View>
    </View>
  );
};

/**
 * Skeleton for list items (e.g., Translation Words links)
 */
export const ListItemSkeleton: React.FC<{ itemCount?: number }> = ({ 
  itemCount = 5 
}) => {
  const getRandomWidth = (min: number, max: number) => {
    return Math.floor(Math.random() * (max - min) + min);
  };

  return (
    <View style={styles.container}>
      {Array.from({ length: itemCount }).map((_, index) => {
        const width = getRandomWidth(120, 220);
        
        return (
          <SkeletonBone
            key={`list-item-${index}`}
            width={width}
            height={18}
            style={styles.listItem}
          />
        );
      })}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 16,
  },
  bone: {
    backgroundColor: '#e5e7eb',
    borderRadius: 4,
  },
  // Note skeleton styles
  noteCard: {
    marginBottom: 24,
  },
  noteHeader: {
    marginBottom: 12,
  },
  noteLine: {
    marginBottom: 8,
  },
  // Article skeleton styles
  title: {
    marginBottom: 24,
  },
  paragraph: {
    marginBottom: 20,
  },
  paragraphLine: {
    marginBottom: 8,
  },
  // List skeleton styles
  listItem: {
    marginBottom: 12,
  },
});

