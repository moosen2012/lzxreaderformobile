import React, { useMemo } from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { Theme } from '../../styles/themes';
import { getBreadcrumbs } from '../../utils/fileTree';

interface BreadcrumbsProps {
  theme: Theme;
  path: string;
  onNavigate: (path: string) => void;
}

/** 层级过多时折叠中间层，避免把工具栏挤爆 */
const MAX_VISIBLE = 4;

export const Breadcrumbs: React.FC<BreadcrumbsProps> = ({ theme, path, onNavigate }) => {
  const items = useMemo(() => {
    const all = getBreadcrumbs(path);
    if (all.length <= MAX_VISIBLE) return all;

    return [all[0], { name: '…', path: '' }, ...all.slice(-2)];
  }, [path]);

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.container}
      keyboardShouldPersistTaps="handled"
    >
      {items.map((item, index) => {
        const isLast = index === items.length - 1;
        const isEllipsis = item.name === '…';

        return (
          <View key={`${item.path}-${index}`} style={styles.crumb}>
            {index > 0 ? (
              <Ionicons
                name="chevron-forward"
                size={12}
                color={theme.textTertiary}
                style={styles.separator}
              />
            ) : (
              <Ionicons name="albums-outline" size={13} color={theme.textSecondary} />
            )}

            {isLast || isEllipsis ? (
              <Text
                style={[
                  styles.label,
                  { color: isLast ? theme.text : theme.textTertiary, fontWeight: isLast ? '600' : '400' },
                ]}
                numberOfLines={1}
              >
                {item.name}
              </Text>
            ) : (
              <TouchableOpacity
                onPress={() => onNavigate(item.path)}
                activeOpacity={0.6}
                accessibilityRole="button"
                accessibilityLabel={`跳转到 ${item.name}`}
              >
                <Text style={[styles.label, { color: theme.link }]} numberOfLines={1}>
                  {item.name}
                </Text>
              </TouchableOpacity>
            )}
          </View>
        );
      })}
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    paddingRight: 8,
  },
  crumb: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  separator: {
    marginHorizontal: 0,
  },
  label: {
    fontSize: 13,
    maxWidth: 160,
  },
});
