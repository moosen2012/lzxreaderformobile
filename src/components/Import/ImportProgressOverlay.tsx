import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Modal, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { Theme } from '../../styles/themes';
import type { ImportPhase } from '../../types';

interface ImportProgressOverlayProps {
  visible: boolean;
  theme: Theme;
  phase: ImportPhase;
  /** 已扫描目录数 */
  dirs: number;
  /** 已发现的可导入文件数 */
  files: number;
  /** 当前正在扫描的目录（可能很长，单行省略） */
  currentPath: string;
  /** 开始时间戳，用于显示已用时——让用户看到"没卡死" */
  startedAt: number;
  onCancel: () => void;
}

const PHASE_TEXT: Record<ImportPhase, string> = {
  picking: '等待目录授权…',
  scanning: '正在扫描目录…',
  saving: '正在写入文件索引…',
  done: '导入完成',
};

/**
 * 目录导入进度浮层。
 *
 * 之前的实现只是一条 12pt 的细横幅：导入上千个文件时要等到扫描结束才有数字，
 * 中间还有"授权 → 扫描 → 合并进索引 → 落盘"几段完全没有反馈，
 * 用户只会以为卡死了。这里做成阻塞式浮层，四段阶段 + 实时计数 + 已用时 + 取消。
 */
export const ImportProgressOverlay: React.FC<ImportProgressOverlayProps> = ({
  visible,
  theme,
  phase,
  dirs,
  files,
  currentPath,
  startedAt,
  onCancel,
}) => {
  const [elapsed, setElapsed] = useState(0);

  // 已用时自己走秒：进度数字可能几十秒才跳一次，秒表是"还活着"的最直接证据
  useEffect(() => {
    if (!visible) return;
    setElapsed(0);
    const timer = setInterval(() => {
      setElapsed(Math.max(0, Math.round((Date.now() - startedAt) / 1000)));
    }, 500);
    return () => clearInterval(timer);
  }, [visible, startedAt]);

  const isDone = phase === 'done';
  const showCounts = phase === 'scanning' || phase === 'saving' || isDone;

  return (
    <Modal transparent visible={visible} animationType="fade" onRequestClose={() => undefined}>
      <View style={styles.backdrop}>
        <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.separator }]}>
          <View style={styles.iconRow}>
            {isDone ? (
              <Ionicons name="checkmark-circle" size={30} color={theme.success} />
            ) : (
              <ActivityIndicator size="small" color={theme.primary} />
            )}
            <Text style={[styles.title, { color: theme.text }]}>
              {isDone ? '导入完成' : PHASE_TEXT[phase]}
            </Text>
          </View>

          {showCounts ? (
            <>
              <View style={styles.countRow}>
                <View style={styles.countItem}>
                  <Text style={[styles.countValue, { color: theme.text }]}>{dirs}</Text>
                  <Text style={[styles.countLabel, { color: theme.textTertiary }]}>个文件夹</Text>
                </View>
                <View style={[styles.countDivider, { backgroundColor: theme.separator }]} />
                <View style={styles.countItem}>
                  <Text style={[styles.countValue, { color: theme.text }]}>{files}</Text>
                  <Text style={[styles.countLabel, { color: theme.textTertiary }]}>个文件</Text>
                </View>
              </View>

              {!isDone && currentPath ? (
                <Text style={[styles.path, { color: theme.textTertiary }]} numberOfLines={1}>
                  {currentPath}
                </Text>
              ) : null}

              <Text style={[styles.elapsed, { color: theme.textTertiary }]}>已用时 {elapsed}s</Text>
            </>
          ) : (
            <Text style={[styles.hint, { color: theme.textSecondary }]}>
              请在弹出的系统文件选择器里选择要导入的目录
            </Text>
          )}

          {!isDone ? (
            <TouchableOpacity
              style={[styles.cancelButton, { borderColor: theme.separator }]}
              onPress={onCancel}
              activeOpacity={0.6}
              accessibilityRole="button"
              accessibilityLabel="取消导入"
            >
              <Text style={[styles.cancelText, { color: theme.textSecondary }]}>
                {phase === 'scanning' ? '取消（保留已扫描到的部分）' : '取消'}
              </Text>
            </TouchableOpacity>
          ) : null}
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.35)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
  },
  card: {
    width: '100%',
    maxWidth: 360,
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 20,
    gap: 14,
  },
  iconRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  title: {
    fontSize: 16,
    fontWeight: '600',
  },
  hint: {
    fontSize: 12.5,
    lineHeight: 19,
    textAlign: 'center',
  },
  countRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 18,
  },
  countItem: {
    alignItems: 'center',
    gap: 2,
  },
  countValue: {
    fontSize: 22,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
  countLabel: {
    fontSize: 11,
  },
  countDivider: {
    width: StyleSheet.hairlineWidth,
    height: 28,
  },
  path: {
    fontSize: 11,
    textAlign: 'center',
  },
  elapsed: {
    fontSize: 11,
    textAlign: 'center',
  },
  cancelButton: {
    marginTop: 2,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
  },
  cancelText: {
    fontSize: 13,
    fontWeight: '600',
  },
});
