import { Alert, Clipboard } from 'react-native';
import type { FileItem } from '../types';

interface FileActionMenuOptions {
  file: FileItem;
  isBookmarked: boolean;
  onToggleBookmark?: (file: FileItem) => void;
  onDelete?: (file: FileItem) => void;
}

/**
 * 文件长按菜单。列表视图和树形视图共用，避免两处各写一份 Alert 逻辑导致行为不一致
 * （之前树视图干脆没接删除/书签，导过目录之后用户就删不掉文件了）。
 */
export function showFileActionMenu({
  file,
  isBookmarked,
  onToggleBookmark,
  onDelete,
}: FileActionMenuOptions) {
  const buttons = [
    onToggleBookmark
      ? {
          text: isBookmarked ? '取消书签' : '添加书签',
          onPress: () => onToggleBookmark(file),
        }
      : null,
    file.directory
      ? {
          text: '复制目录路径',
          onPress: () => Clipboard.setString(file.directory ?? ''),
        }
      : null,
    onDelete
      ? {
          text: '删除',
          style: 'destructive' as const,
          onPress: () => confirmDelete(file, onDelete),
        }
      : null,
    { text: '取消', style: 'cancel' as const },
  ].filter(Boolean) as { text: string; onPress?: () => void; style?: 'cancel' | 'destructive' }[];

  Alert.alert(file.name, file.directory || undefined, buttons, { cancelable: true });
}

function confirmDelete(file: FileItem, onDelete: (file: FileItem) => void) {
  Alert.alert('确认删除', `确定要从列表移除 "${file.name}" 吗？`, [
    { text: '取消', style: 'cancel' },
    { text: '删除', style: 'destructive', onPress: () => onDelete(file) },
  ]);
}
