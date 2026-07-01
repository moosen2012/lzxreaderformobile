import React from 'react';
import {
  View,
  Text,
  Modal,
  TouchableOpacity,
  StyleSheet,
  Switch,
  ScrollView,
  Pressable,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { Theme } from '../../styles/themes';
import type { CodeTheme, ThemeMode } from '../../types';
import { CODE_THEME_OPTIONS } from '../../utils/markdownHelper';

interface SettingsPanelProps {
  visible: boolean;
  theme: Theme;
  themeMode: ThemeMode;
  fontSize: number;
  codeTheme: CodeTheme;
  onClose: () => void;
  onToggleTheme: () => void;
  onFontSizeChange: (size: number) => void;
  onCodeThemeChange: (theme: CodeTheme) => void;
}

export const SettingsPanel: React.FC<SettingsPanelProps> = ({
  visible,
  theme,
  themeMode,
  fontSize,
  codeTheme,
  onClose,
  onToggleTheme,
  onFontSizeChange,
  onCodeThemeChange,
}) => {
  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <Pressable style={styles.overlay} onPress={onClose}>
        <Pressable
          style={[styles.panel, { backgroundColor: theme.surface }]}
          onPress={(e) => e.stopPropagation()}
        >
          {/* 头部 */}
          <View style={[styles.header, { borderBottomColor: theme.separator }]}>
            <Text style={[styles.title, { color: theme.text }]}>设置</Text>
            <TouchableOpacity onPress={onClose} style={styles.closeButton}>
              <Ionicons name="close" size={22} color={theme.textSecondary} />
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
            {/* 主题切换 */}
            <View style={styles.section}>
              <Text style={[styles.sectionTitle, { color: theme.textSecondary }]}>
                外观
              </Text>
              <View style={[styles.settingItem, { backgroundColor: theme.cardBackground }]}>
                <View style={styles.settingLeft}>
                  <Ionicons
                    name={themeMode === 'light' ? 'sunny' : 'moon'}
                    size={22}
                    color={theme.primary}
                  />
                  <Text style={[styles.settingLabel, { color: theme.text }]}>
                    深色模式
                  </Text>
                </View>
                <Switch
                  value={themeMode === 'dark'}
                  onValueChange={onToggleTheme}
                  trackColor={{ false: theme.surfaceAlt, true: theme.primary }}
                />
              </View>
            </View>

            {/* 字体大小 */}
            <View style={styles.section}>
              <Text style={[styles.sectionTitle, { color: theme.textSecondary }]}>
                字体大小
              </Text>
              <View style={[styles.settingItem, { backgroundColor: theme.cardBackground }]}>
                <View style={styles.fontSizeContainer}>
                  <Text style={[styles.fontSizeLabel, { color: theme.text }]}>
                    {fontSize}px
                  </Text>
                  <View style={styles.fontSizeControls}>
                    <TouchableOpacity
                      style={[
                        styles.fontSizeButton,
                        { backgroundColor: theme.surfaceAlt, opacity: fontSize <= 12 ? 0.4 : 1 },
                      ]}
                      onPress={() => onFontSizeChange(fontSize - 1)}
                      disabled={fontSize <= 12}
                    >
                      <Ionicons name="remove" size={18} color={theme.text} />
                    </TouchableOpacity>
                    <Text style={[styles.fontSizeValue, { color: theme.text }]}>
                      {fontSize}
                    </Text>
                    <TouchableOpacity
                      style={[
                        styles.fontSizeButton,
                        { backgroundColor: theme.surfaceAlt, opacity: fontSize >= 28 ? 0.4 : 1 },
                      ]}
                      onPress={() => onFontSizeChange(fontSize + 1)}
                      disabled={fontSize >= 28}
                    >
                      <Ionicons name="add" size={18} color={theme.text} />
                    </TouchableOpacity>
                  </View>
                </View>
              </View>
              {/* 快速预设 */}
              <View style={styles.presetContainer}>
                {[
                  { label: '小', size: 14 },
                  { label: '中', size: 16 },
                  { label: '大', size: 18 },
                  { label: '特大', size: 20 },
                ].map((preset) => (
                  <TouchableOpacity
                    key={preset.size}
                    style={[
                      styles.presetButton,
                      {
                        backgroundColor:
                          fontSize === preset.size ? theme.primary : theme.cardBackground,
                        borderColor: fontSize === preset.size ? theme.primary : theme.border,
                      },
                    ]}
                    onPress={() => onFontSizeChange(preset.size)}
                  >
                    <Text
                      style={[
                        styles.presetText,
                        { color: fontSize === preset.size ? '#FFFFFF' : theme.text },
                      ]}
                    >
                      {preset.label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            {/* 代码主题 */}
            <View style={styles.section}>
              <Text style={[styles.sectionTitle, { color: theme.textSecondary }]}>
                代码主题
              </Text>
              {CODE_THEME_OPTIONS.map((option) => (
                <TouchableOpacity
                  key={option.value}
                  style={[
                    styles.settingItem,
                    { backgroundColor: theme.cardBackground },
                    codeTheme === option.value && { borderColor: theme.primary, borderWidth: 1.5 },
                  ]}
                  onPress={() => onCodeThemeChange(option.value)}
                >
                  <View style={styles.settingLeft}>
                    <View
                      style={[
                        styles.colorIndicator,
                        {
                          backgroundColor: option.isDark ? '#272822' : '#F6F8FA',
                        },
                      ]}
                    />
                    <Text style={[styles.settingLabel, { color: theme.text }]}>
                      {option.label}
                    </Text>
                  </View>
                  {codeTheme === option.value ? (
                    <Ionicons name="checkmark-circle" size={22} color={theme.primary} />
                  ) : (
                    <Ionicons name="chevron-forward" size={20} color={theme.textTertiary} />
                  )}
                </TouchableOpacity>
              ))}
            </View>

            <View style={{ height: 24 }} />
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.4)',
  },
  panel: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: '75%',
    paddingBottom: 34, // Safe area
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  title: {
    fontSize: 18,
    fontWeight: '600',
  },
  closeButton: {
    padding: 4,
  },
  content: {
    padding: 16,
  },
  section: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '600',
    textTransform: 'uppercase',
    marginBottom: 10,
    marginLeft: 4,
  },
  settingItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 12,
    marginBottom: 8,
  },
  settingLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  settingLabel: {
    fontSize: 16,
  },
  fontSizeContainer: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  fontSizeLabel: {
    fontSize: 14,
  },
  fontSizeControls: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  fontSizeButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  fontSizeValue: {
    fontSize: 16,
    fontWeight: '600',
    minWidth: 24,
    textAlign: 'center',
  },
  presetContainer: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 8,
  },
  presetButton: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: 'center',
  },
  presetText: {
    fontSize: 14,
    fontWeight: '500',
  },
  colorIndicator: {
    width: 24,
    height: 24,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.1)',
  },
});
