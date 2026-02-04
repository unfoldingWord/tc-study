/**
 * Centralized Icon Component
 * 
 * Implementation following Lucide React Native patterns
 * https://lucide.dev/guide/packages/lucide-react-native
 */

import {
  AlertCircle,
  // Status icons
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  Book,
  BookOpen,
  Check,
  CheckCircle,
  ChevronDown,
  // Navigation icons
  ChevronLeft,
  ChevronRight,
  Clock,
  Download,
  Edit,
  // UI icons
  Eye,
  EyeOff,
  // File/Document icons
  File,
  FileText,
  Folder,
  FolderOpen,
  // Educational icons
  GraduationCap,
  Grid3X3,
  HelpCircle,
  Home,
  Info,
  Languages,
  Layers,
  Link,
  List,
  // Loading icons
  Loader2,
  Maximize,
  Menu,
  Minimize,
  Minus,
  MoreHorizontal,
  MoreVertical,
  Pause,
  Play,
  Plus,
  RefreshCw,
  Save,
  // Action icons
  Search,
  Settings,
  SkipBack,
  SkipForward,
  Square,
  // Additional icons needed by the app
  StickyNote,
  Target,
  Trash2,
  Upload,
  // Media/Audio icons
  Volume2,
  X,
  XCircle,
  type LucideIcon
} from 'lucide-react-native';
import React, { useEffect, useRef } from 'react';
import { Animated, Easing, Pressable, StyleSheet, Text, View } from 'react-native';

// Icon name mapping for easy usage - keeping our existing mappings
export const iconMap = {
  // Media/Audio
  'volume': Volume2,
  'play': Play,
  'pause': Pause,
  'stop': Square,
  'skip-back': SkipBack,
  'skip-forward': SkipForward,
  
  // Educational
  'academy': GraduationCap,
  'translation-words': Book,
  'book': Book,
  'book-open': BookOpen,
  
  // Navigation
  'chevron-left': ChevronLeft,
  'chevron-right': ChevronRight,
  'chevron-down': ChevronDown,
  'arrow-left': ArrowLeft,
  'arrow-right': ArrowRight,
  'home': Home,
  'menu': Menu,
  'target': Target,
  'list': List,
  'grid': Grid3X3,
  'layers': Layers,
  
  // Actions
  'search': Search,
  'settings': Settings,
  'download': Download,
  'upload': Upload,
  'save': Save,
  'edit': Edit,
  'delete': Trash2,
  'trash': Trash2,
  'plus': Plus,
  'minus': Minus,
  'close': X,
  'x': X,
  'check': Check,
  
  // Status
  'warning': AlertTriangle,
  'alert-triangle': AlertTriangle,
  'error': AlertCircle,
  'alert-circle': AlertCircle,
  'info': Info,
  'success': CheckCircle,
  'check-circle': CheckCircle,
  'cancel': XCircle,
  'x-circle': XCircle,
  'loading': Loader2,
  'spinner': Loader2,
  'refresh': RefreshCw,
  'clock': Clock,
  
  // UI
  'show': Eye,
  'eye': Eye,
  'hide': EyeOff,
  'eye-off': EyeOff,
  'maximize': Maximize,
  'minimize': Minimize,
  'more-horizontal': MoreHorizontal,
  'more-vertical': MoreVertical,
  
  // Files
  'file': File,
  'file-text': FileText,
  'folder': Folder,
  'folder-open': FolderOpen,
  
  // App-specific icons
  'sticky-note': StickyNote,
  'question-mark-circle': HelpCircle,
  'help-circle': HelpCircle,
  'link': Link,
  'languages': Languages,
} as const;

export type IconName = keyof typeof iconMap;

export interface IconProps {
  /** Icon name from the iconMap */
  name: IconName;
  /** Icon size in pixels (default: 24) */
  size?: number;
  /** Icon color (default: currentColor) */
  color?: string;
  /** Stroke width (default: 2) */
  strokeWidth?: number;
  /** Absolute stroke width (default: false) */
  absoluteStrokeWidth?: boolean;
  /** Click handler */
  onClick?: () => void;
  /** Accessibility label for React Native */
  accessibilityLabel?: string;
  /** Whether to animate spinner icons (default: true for loading/spinner icons) */
  animate?: boolean;
}

/**
 * Universal Icon Component
 * 
 * Following Lucide React Native patterns:
 * https://lucide.dev/guide/packages/lucide-react-native
 * 
 * Usage:
 * <Icon name="play" size={20} color="blue" />
 * <Icon name="academy" color="#3b82f6" />
 * <Icon name="translation-words" size={24} strokeWidth={1.5} />
 */
export const Icon: React.FC<IconProps> = ({
  name,
  size = 24,
  color = 'currentColor',
  strokeWidth = 2,
  absoluteStrokeWidth = false,
  onClick,
  accessibilityLabel,
  animate,
}) => {
  const IconComponent = iconMap[name] as LucideIcon;
  
  // Animation setup for spinner icons
  const spinValue = useRef(new Animated.Value(0)).current;
  const shouldAnimate = animate !== undefined ? animate : (name === 'loading' || name === 'spinner' || name === 'refresh');
  
  useEffect(() => {
    if (shouldAnimate) {
      const spinAnimation = Animated.loop(
        Animated.timing(spinValue, {
          toValue: 1,
          duration: 1000,
          easing: Easing.linear,
          useNativeDriver: true,
        })
      );
      spinAnimation.start();
      
      return () => spinAnimation.stop();
    }
  }, [shouldAnimate, spinValue]);
  
  const spin = spinValue.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '360deg'],
  });
 
  // Test with a direct import to see if lucide-react-native works at all
  if (name === 'book-open') {
    
    try {
      return (
        <View style={{ backgroundColor: 'yellow', padding: 4, borderWidth: 2, borderColor: 'red' }}>
          <Text style={{ fontSize: 10, color: 'black' }}>Direct BookOpen:</Text>
          <BookOpen size={size} color={color} strokeWidth={strokeWidth} />
          <Text style={{ fontSize: 8, color: 'black' }}>Should see icon above</Text>
        </View>
      );
    } catch (error) {
      console.error(`❌ Direct BookOpen failed:`, error);
      return (
        <View style={[styles.fallbackIcon, { width: size + 20, height: size + 40 }]}>
          <Text style={[styles.fallbackText, { fontSize: 8 }]}>DIRECT</Text>
          <Text style={[styles.fallbackText, { fontSize: 6 }]}>ERROR</Text>
        </View>
      );
    }
  }
  
  if (!IconComponent) {
    console.warn(`❌ Icon "${name}" not found in iconMap`);
    
    return (
      <View style={[styles.fallbackIcon, { width: size, height: size }]}>
        <Text style={[styles.fallbackText, { fontSize: Math.max(8, size * 0.3) }]}>?</Text>
      </View>
    );
  }
  
  // Props following Lucide React Native API
  const iconProps = {
    size,
    color,
    strokeWidth,
    absoluteStrokeWidth,
  };
  
  
  
  try {
    const iconElement = <IconComponent {...iconProps} />;
    
    // Wrap with animation if needed
    const finalElement = shouldAnimate ? (
      <Animated.View style={{ transform: [{ rotate: spin }] }}>
        {iconElement}
      </Animated.View>
    ) : iconElement;
    
    if (onClick) {
      return (
        <Pressable
          onPress={onClick}
          style={styles.iconButton}
          accessibilityLabel={accessibilityLabel || name}
          accessibilityRole="button"
        >
          {finalElement}
        </Pressable>
      );
    }
    
    return finalElement;
  } catch (error) {
    console.error(`❌ Error rendering icon ${name}:`, error);
    return (
      <View style={[styles.fallbackIcon, { width: size, height: size }]}>
        <Text style={[styles.fallbackText, { fontSize: Math.max(8, size * 0.3) }]}>E</Text>
      </View>
    );
  }
};

/**
 * Icon Button Component
 * 
 * Combines Icon with button functionality
 */
export interface IconButtonProps extends Omit<IconProps, 'onClick'> {
  /** Button click handler */
  onPress?: () => void;
  /** Disabled state */
  disabled?: boolean;
  /** Button variant */
  variant?: 'default' | 'ghost' | 'outline';
  /** Button size */
  buttonSize?: 'sm' | 'md' | 'lg';
}

export const IconButton: React.FC<IconButtonProps> = ({
  name,
  size,
  color,
  strokeWidth,
  absoluteStrokeWidth,
  onPress,
  disabled = false,
  variant = 'default',
  buttonSize = 'md',
  accessibilityLabel,
}) => {
  const getVariantStyle = () => {
    switch (variant) {
      case 'ghost':
        return styles.ghostButton;
      case 'outline':
        return styles.outlineButton;
      default:
        return styles.defaultButton;
    }
  };
  
  const getSizeStyle = () => {
    switch (buttonSize) {
      case 'sm':
        return styles.smallButton;
      case 'lg':
        return styles.largeButton;
      default:
        return styles.mediumButton;
    }
  };
  
  const iconSize = size || (buttonSize === 'sm' ? 16 : buttonSize === 'lg' ? 24 : 20);
  
  return (
    <Pressable
      style={[
        styles.baseButton,
        getVariantStyle(),
        getSizeStyle(),
        disabled && styles.disabledButton
      ]}
      onPress={disabled ? undefined : onPress}
      disabled={disabled}
      accessibilityLabel={accessibilityLabel || name}
      accessibilityRole="button"
    >
      <Icon
        name={name}
        size={iconSize}
        color={disabled ? '#9ca3af' : color}
        strokeWidth={strokeWidth}
        absoluteStrokeWidth={absoluteStrokeWidth}
      />
    </Pressable>
  );
};

const styles = StyleSheet.create({
  iconButton: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: 4,
  },
  fallbackIcon: {
    backgroundColor: '#ef4444',
    borderRadius: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  fallbackText: {
    color: '#ffffff',
    fontWeight: 'bold',
    textAlign: 'center',
  },
  baseButton: {
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 6,
  },
  defaultButton: {
    backgroundColor: '#f3f4f6',
  },
  ghostButton: {
    backgroundColor: 'transparent',
  },
  outlineButton: {
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: '#d1d5db',
  },
  smallButton: {
    width: 28,
    height: 28,
    padding: 4,
  },
  mediumButton: {
    width: 36,
    height: 36,
    padding: 8,
  },
  largeButton: {
    width: 44,
    height: 44,
    padding: 10,
  },
  disabledButton: {
    opacity: 0.5,
  },
});

// Export individual icons for direct usage if needed
export {
  AlertCircle,
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  Book,
  BookOpen,
  Check,
  CheckCircle,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Clock,
  Download,
  Edit,
  Eye,
  EyeOff,
  File,
  FileText,
  Folder,
  FolderOpen,
  GraduationCap,
  Grid3X3,
  HelpCircle,
  Home,
  Info,
  Languages,
  Layers,
  Link,
  List,
  Loader2,
  Maximize,
  Menu,
  Minimize,
  Minus,
  MoreHorizontal,
  MoreVertical,
  Pause,
  Play,
  Plus,
  RefreshCw,
  Save,
  Search,
  Settings,
  SkipBack,
  SkipForward,
  Square,
  StickyNote,
  Target,
  Trash2,
  Upload,
  Volume2,
  X,
  XCircle,
  type LucideIcon
};

