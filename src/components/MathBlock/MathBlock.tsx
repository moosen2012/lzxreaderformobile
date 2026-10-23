import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, useWindowDimensions } from 'react-native';
import { SvgXml } from 'react-native-svg';
import { getCachedMath, renderMath, type MathSvg } from '../../utils/mathRenderer';

interface MathBlockProps {
  /** TeX 源码（不含 $ 定界符） */
  formula: string;
  /** 正文字号，决定公式尺寸 */
  fontSize: number;
  /** 前景色 */
  color: string;
  /** 行内公式（跟随文字排版）还是块级公式（独占一行居中） */
  inline?: boolean;
  /** 左右留白，用于计算超宽公式的可用宽度 */
  horizontalPadding?: number;
}

/**
 * 公式渲染组件：把 TeX 渲染成 SVG 后用 react-native-svg 绘制。
 * 全程无 WebView、无网络请求，行内公式可以像文字一样参与排版。
 *
 * 首次渲染时公式引擎是异步加载的（避免冷启动被 mathjax 拖住），
 * 加载期间先显示 TeX 源码，加载完成后原地替换成 SVG。
 */
export function MathBlock({
  formula,
  fontSize,
  color,
  inline = false,
  horizontalPadding = 32,
}: MathBlockProps) {
  const { width: windowWidth } = useWindowDimensions();
  const availableWidth = Math.max(80, windowWidth - horizontalPadding);

  const [rendered, setRendered] = useState<MathSvg | null>(() => {
    const cached = getCachedMath(formula, { display: !inline, fontSize, color });
    return cached ?? null;
  });

  useEffect(() => {
    const options = { display: !inline, fontSize, color };

    // 命中缓存直接同步渲染，避免重复公式在滚动时闪一下源码
    const cached = getCachedMath(formula, options);
    if (cached !== undefined) {
      setRendered(cached);
      return;
    }

    setRendered(null);
    let alive = true;
    void renderMath(formula, options).then((result) => {
      if (alive) setRendered(result);
    });

    return () => {
      alive = false;
    };
  }, [formula, inline, fontSize, color]);

  // 解析失败（公式语法错误）时降级为原始 TeX，至少让用户看到内容
  if (!rendered) {
    return (
      <Text
        style={[
          styles.fallback,
          { color, fontSize, lineHeight: fontSize * 1.6 },
          inline ? styles.fallbackInline : styles.fallbackBlock,
        ]}
      >
        {inline ? `$${formula}$` : `$$${formula}$$`}
      </Text>
    );
  }

  // 行内公式放不下一行时按比例缩小，避免撑破版面
  const needsShrink = rendered.width > availableWidth;
  const width = needsShrink ? availableWidth : rendered.width;
  const height = needsShrink ? (rendered.height * availableWidth) / rendered.width : rendered.height;

  const svg = <SvgXml xml={rendered.svg} width={width} height={height} />;

  if (inline) {
    return (
      <View style={[styles.inlineContainer, { width, height }]} accessible accessibilityLabel={`公式 ${formula}`}>
        {svg}
      </View>
    );
  }

  // 块级公式超宽时允许横向滚动，保持原始字号
  if (needsShrink) {
    return (
      <ScrollView
        horizontal
        style={styles.blockScroll}
        contentContainerStyle={styles.blockScrollContent}
        showsHorizontalScrollIndicator={false}
        accessible
        accessibilityLabel={`公式 ${formula}`}
      >
        <SvgXml xml={rendered.svg} width={rendered.width} height={rendered.height} />
      </ScrollView>
    );
  }

  return (
    <View style={styles.blockContainer} accessible accessibilityLabel={`公式 ${formula}`}>
      {svg}
    </View>
  );
}

// 供 MarkdownRenderer 在段落里识别"这行含行内公式"，从而切换成横向流式排版
(MathBlock as unknown as { __mathInline: boolean }).__mathInline = true;

/** 判断某个 React 节点是不是行内公式节点 */
export function isInlineMathNode(node: React.ReactNode): boolean {
  if (!React.isValidElement(node)) return false;
  const type = node.type as unknown as { __mathInline?: boolean };
  return type?.__mathInline === true;
}

const styles = StyleSheet.create({
  inlineContainer: {
    // 行内公式：固定宽高，作为 inline view 参与 Text 流
    marginHorizontal: 1,
  },
  blockContainer: {
    alignItems: 'center',
    marginVertical: 10,
  },
  blockScroll: {
    marginVertical: 10,
  },
  blockScrollContent: {
    paddingHorizontal: 16,
    alignItems: 'center',
  },
  fallback: {
    fontFamily: 'Menlo',
  },
  fallbackInline: {
    marginHorizontal: 2,
  },
  fallbackBlock: {
    textAlign: 'center',
    marginVertical: 8,
  },
});
