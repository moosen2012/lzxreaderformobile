import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, ActivityIndicator, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { Theme } from '../../styles/themes';
import { resolveLocalPdfPath } from '../../services/pdfSource';

/**
 * PDF 阅读：交给 react-native-pdf（MIT）原生渲染。
 *
 * 为什么不像 docx 那样转成 Markdown：PDF 是"固定版式"格式，抽文本会丢分页、表格线、
 * 图文混排和公式，等于把 PDF 变成一堆断行——不如直接按原版式滚动阅读。
 *
 * ⚠️ 交给原生视图的**必须是本地路径**，不能是 `content://`：
 * react-native-pdf 的 JS 层会对 `content://` 做 `decodeURIComponent`，把 SAF URI 里的
 * `%3A`/`%2F` 解回裸斜杠，树关系被破坏后 provider 抛 SecurityException，
 * 而 PdfView 只 catch FileNotFoundException → 异常冒到 UI 线程 → 整个进程被系统杀掉。
 * 所以这里先经 `services/pdfSource` 复制到 cacheDirectory，再传纯本地路径。
 *
 * 组件用 require 延迟加载并包 try/catch：
 * - web 端没有对应实现（react-native-pdf 是纯原生），要能优雅降级成提示而不是白屏；
 * - 老安装包（未重建）里原生模块不存在时同理。
 */
type PdfComponent = React.ComponentType<Record<string, unknown>>;

let cachedPdfComponent: PdfComponent | null | undefined;

function loadPdfComponent(): PdfComponent | null {
  if (cachedPdfComponent !== undefined) return cachedPdfComponent;
  if (Platform.OS === 'web') {
    cachedPdfComponent = null;
    return null;
  }
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const mod = require('react-native-pdf');
    const candidate = (mod?.default ?? mod) as unknown;
    /**
     * web 打包时 metro 把 react-native-pdf 解析成空模块（见 metro.config.js），
     * require 会拿到 `{}` —— 它不是合法的 React 组件，必须当成"不可用"，
     * 否则会渲染出一个空对象直接白屏。
     */
    const isRenderable =
      typeof candidate === 'function' ||
      (typeof candidate === 'object' &&
        candidate !== null &&
        '$$typeof' in (candidate as Record<string, unknown>));
    cachedPdfComponent = isRenderable ? (candidate as PdfComponent) : null;
  } catch {
    cachedPdfComponent = null;
  }
  return cachedPdfComponent;
}

interface PdfRendererProps {
  uri?: string;
  theme: Theme;
  name: string;
}

function describeError(error: unknown): string {
  const detail = error instanceof Error ? error.message : String(error ?? '');
  if (/security|permission|eacces|eperm/i.test(detail)) {
    return '没有读取这个 PDF 的权限，可能授权已失效';
  }
  return detail || '无法打开这个 PDF';
}

export const PdfRenderer: React.FC<PdfRendererProps> = ({ uri, theme, name }) => {
  const Pdf = useMemo(loadPdfComponent, []);
  const [pages, setPages] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [localPath, setLocalPath] = useState<string | null>(null);
  const [preparing, setPreparing] = useState(false);
  const [failed, setFailed] = useState<string | null>(null);

  // content:// → 本地缓存副本（见文件头注释，这步是防闪退的关键）
  useEffect(() => {
    if (!uri) return;
    let cancelled = false;
    setPreparing(true);
    setFailed(null);
    setLocalPath(null);
    setPages(0);
    setCurrentPage(1);

    resolveLocalPdfPath(uri)
      .then((path) => {
        if (cancelled) return;
        setLocalPath(path);
        setPreparing(false);
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        setFailed(describeError(error));
        setPreparing(false);
      });

    return () => {
      cancelled = true;
    };
  }, [uri]);

  const handleError = useCallback((error: unknown) => {
    setFailed(describeError(error));
  }, []);

  if (!Pdf) {
    return (
      <View style={[styles.state, { backgroundColor: theme.background }]}>
        <Ionicons name="document-outline" size={44} color={theme.textTertiary} />
        <Text style={[styles.stateText, { color: theme.textSecondary }]}>
          当前平台暂不支持 PDF 预览
        </Text>
      </View>
    );
  }

  if (!uri) {
    return (
      <View style={[styles.state, { backgroundColor: theme.background }]}>
        <Ionicons name="document-outline" size={44} color={theme.textTertiary} />
        <Text style={[styles.stateText, { color: theme.textSecondary }]}>PDF 地址缺失</Text>
      </View>
    );
  }

  if (failed) {
    return (
      <View style={[styles.state, { backgroundColor: theme.background }]}>
        <Ionicons name="alert-circle-outline" size={44} color={theme.textTertiary} />
        <Text style={[styles.stateText, { color: theme.textSecondary }]}>{failed}</Text>
        <Text style={[styles.stateHint, { color: theme.textTertiary }]}>
          云盘（Drive / OneDrive）里的 PDF 可能不允许直读，导入到本地后再试
        </Text>
      </View>
    );
  }

  if (preparing || !localPath) {
    return (
      <View style={[styles.state, { backgroundColor: theme.background }]}>
        <ActivityIndicator size="large" color={theme.primary} />
        <Text style={[styles.stateText, { color: theme.textSecondary }]}>正在准备文档...</Text>
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      <Pdf
        source={{ uri: localPath }}
        style={styles.pdf}
        onLoadComplete={(numberOfPages: number) => setPages(numberOfPages)}
        onPageChanged={(page: number) => setCurrentPage(page)}
        onError={handleError}
        enablePaging={false}
        spacing={8}
        fitPolicy={0}
        trustAllCerts={false}
        activityIndicator={<ActivityIndicator size="large" color={theme.primary} />}
      />
      {pages > 0 ? (
        <View style={[styles.badge, { backgroundColor: theme.headerBackground, borderColor: theme.separator }]}>
          <Text style={[styles.badgeText, { color: theme.textSecondary }]}>
            {currentPage} / {pages} · {name}
          </Text>
        </View>
      ) : null}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  pdf: {
    flex: 1,
    width: '100%',
    backgroundColor: 'transparent',
  },
  state: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    padding: 28,
  },
  stateText: {
    fontSize: 14,
    textAlign: 'center',
  },
  stateHint: {
    fontSize: 12,
    textAlign: 'center',
    lineHeight: 18,
  },
  badge: {
    position: 'absolute',
    bottom: 12,
    alignSelf: 'center',
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    maxWidth: '86%',
  },
  badgeText: {
    fontSize: 11,
  },
});
