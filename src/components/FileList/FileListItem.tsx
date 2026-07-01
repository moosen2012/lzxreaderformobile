import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { Theme } from '../../styles/themes';
import type { FileItem } from '../../types';
import { formatFileSize, formatDate, getFileIconName, getFileIconColor } from '../../utils/fileHelper';

interface FileListItemProps {
  file: FileItem;
  theme: Theme;
  isActive?: boolean;
  isBookmarked: boolean;
  onPress: (file: FileItem) => void;
  onLongPress?: (file: FileItem) => void;
  onDelete?: (file: FileItem) => void;
  onToggleBookmark?: (file: FileItem) => void;
}

export const FileListItem: React.FC<FileListItemProps> = ({
  file,
  theme,
  isActive = false,
  isBookmarked,
  onPress,
  onLongPress,
  onDelete,
  onToggleBookmark,
}) => {
  const handleLongPress = () => {
    if (onLongPress) {
      onLongPress(file);
      return;
    }
    // 默认长按菜单
    Alert.alert(
      file.name,
      undefined,
      [
        {
          text: isBookmarked ? '取消书签' : '添加书签',
          onPress: () => onToggleBookmark?.(file),
        },
        {
          text: '删除',
          style: 'destructive',
          onPress: () => {
            Alert.alert('确认删除', `确定要删除 "${file.name}" 吗？`, [
              { text: '取消', style: 'cancel' },
              { text: '删除', style: 'destructive', onPress: () => onDelete?.(file) },
            ]);
          },
        },
        { text: '取消', style: 'cancel' },
      ]
    );
  };

  const iconName = getFileIconName(file.type) as keyof typeof Ionicons.glyphMap;
  const iconColor = getFileIconColor(file.type);

  return (
    <TouchableOpacity
      style={[
        styles.container,
        {
          backgroundColor: isActive ? theme.primaryLight : theme.cardBackground,
          borderBottomColor: theme.separator,
        },
      ]}
      onPress={() => onPress(file)}
      onLongPress={handleLongPress}
      activeOpacity={0.6}
      accessibilityRole="button"
      accessibilityLabel={`文件: ${file.name}`}
    >
      {/* 左侧图标 */}
      <View style={[styles.iconContainer, { backgroundColor: isActive ? theme.primaryLight : theme.surfaceAlt }]}>
        <Ionicons name={iconName} size={24} color={iconColor} />
      </View>

      {/* 中间信息 */}
      <View style={styles.infoContainer}>
        <Text style={[styles.fileName, { color: theme.text }]} numberOfLines={1}>
          {file.name}
        </Text>
        <View style={styles.metaContainer}>
          {file.size ? (
            <Text style={[styles.metaText, { color: theme.textTertiary }]}>
              {formatFileSize(file.size)}
            </Text>
          ) : null}
          {file.size ? <Text style={[styles.metaDot, { color: theme.textTertiary }]}>·</Text> : null}
          <Text style={[styles.metaText, { color: theme.textTertiary }]}>
            {formatDate(file.addedAt)}
          </Text>
        </View>
      </View>

      {/* 右侧书签 */}
      {isBookmarked ? (
        <View style={styles.bookmarkContainer}>
          <Ionicons name="bookmark" size={18} color={theme.primary} />
        </View>
      ) : null}
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
    height: 72,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  iconContainer: {
    width: 44,
    height: 44,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  infoContainer: {
    flex: 1,
    justifyContent: 'center',
  },
  fileName: {
    fontSize: 16,
    fontWeight: '500',
    marginBottom: 4,
  },
  metaContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  metaText: {
    fontSize: 12,
  },
  metaDot: {
    fontSize: 12,
  },
  bookmarkContainer: {
    padding: 8,
  },
});
