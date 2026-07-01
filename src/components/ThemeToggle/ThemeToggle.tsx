import React from 'react';
import { TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { Theme } from '../../styles/themes';
import type { ThemeMode } from '../../types';

interface ThemeToggleProps {
  theme: Theme;
  mode: ThemeMode;
  onToggle: () => void;
  size?: number;
}

export const ThemeToggle: React.FC<ThemeToggleProps> = ({ theme, mode, onToggle, size = 24 }) => {
  return (
    <TouchableOpacity
      style={[styles.button, { backgroundColor: theme.surfaceAlt }]}
      onPress={onToggle}
      activeOpacity={0.7}
      accessibilityRole="button"
      accessibilityLabel={mode === 'light' ? '切换到深色模式' : '切换到浅色模式'}
    >
      <Ionicons
        name={mode === 'light' ? 'moon' : 'sunny'}
        size={size - 4}
        color={theme.text}
      />
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  button: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
