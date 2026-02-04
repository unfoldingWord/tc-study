/**
 * Scripture Skeleton Loading Component
 * 
 * Displays a skeleton placeholder that mimics the structure of scripture text
 * while content is being loaded. Uses React Native's built-in Animated API.
 */

import React, { useEffect, useRef } from 'react';
import { Animated, StyleSheet, View } from 'react-native';

interface ScriptureSkeletonProps {
  verseCount?: number; // Number of verse skeletons to show
}

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

export const ScriptureSkeleton: React.FC<ScriptureSkeletonProps> = ({ 
  verseCount = 5 
}) => {
  // Generate random line widths for more natural appearance
  const getRandomWidth = (min: number, max: number) => {
    return Math.floor(Math.random() * (max - min) + min);
  };

  return (
    <View style={styles.container}>
      {Array.from({ length: verseCount }).map((_, verseIndex) => {
        const lineCount = Math.floor(Math.random() * 3) + 2; // 2-4 lines per verse
        
        return (
          <View key={`verse-${verseIndex}`} style={styles.verseContainer}>
            {/* Verse number */}
            <SkeletonBone width={30} height={20} style={styles.verseNumber} />
            
            {/* Verse text lines */}
            <View style={styles.verseLines}>
              {Array.from({ length: lineCount }).map((_, lineIndex) => {
                const isLastLine = lineIndex === lineCount - 1;
                const width = isLastLine 
                  ? getRandomWidth(150, 250) // Last line shorter
                  : getRandomWidth(280, 350); // Other lines longer
                
                return (
                  <SkeletonBone
                    key={`line-${lineIndex}`}
                    width={width}
                    height={18}
                    style={styles.line}
                  />
                );
              })}
            </View>
          </View>
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
  verseContainer: {
    marginBottom: 16,
    flexDirection: 'row',
  },
  verseNumber: {
    marginRight: 8,
    marginTop: 2,
  },
  verseLines: {
    flex: 1,
  },
  line: {
    marginBottom: 8,
  },
  bone: {
    backgroundColor: '#e5e7eb',
    borderRadius: 4,
  },
});

