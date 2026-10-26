import React from 'react';
import Svg, { Path } from 'react-native-svg';

interface BackChevronProps {
  color: string;
  size?: number;
}

/**
 * 返回箭头：用 SVG 手绘而不用 iconfont 的 chevron-back 字形。
 * 原因：真机上该字形渲染异常（显示成一条斜线），SVG 路径与字体版本无关，渲染结果确定。
 * 阅读器头部与目录页应用头共用。
 */
export const BackChevron: React.FC<BackChevronProps> = ({ color, size = 24 }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <Path
      d="M15 5 L8 12 L15 19"
      stroke={color}
      strokeWidth={2.4}
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </Svg>
);
