/**
 * 路由参数表：全应用唯一来源。
 *
 * 改造为文件浏览器后只剩一个页面 —— 目录内容与文件内容都在同一屏的右栏切换，
 * 不再需要 Reader 路由（原本手机端走路由、平板端走内嵌，是两套逻辑）。
 * 将来若要支持深链接到某文件，给 Home 加可选参数 initialFileId 即可。
 */
export type RootStackParamList = {
  Home: undefined;
};
