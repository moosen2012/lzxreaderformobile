// Metro 配置：只为了解决两个 Node-only 依赖（mammoth / xlsx）在 RN 里的解析问题。
//
// 1. mammoth 的主入口是 Node 构建（会 require('fs') 读文件路径），浏览器构建
//    `mammoth/mammoth.browser.js` 才接受 ArrayBuffer。这里统一 alias 过去，
//    业务代码就可以正常 `import mammoth from 'mammoth'`，类型也拿得到。
// 2. xlsx（SheetJS CE）顶层对 fs / stream 是"有则用之"的可选依赖，Metro 是静态解析，
//    会直接报 "Unable to resolve module fs"。只对这两个包把 Node 内置模块替换成空模块，
//    其他包（如 expo 自身）的 fs 解析行为保持不变。
const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

const NODE_BUILTINS = new Set(['fs', 'stream', 'crypto', 'node:fs', 'node:stream', 'node:crypto']);
const NODE_BUILTIN_OWNERS = /node_modules[\\/](xlsx|mammoth|jszip)[\\/]/;

const defaultResolveRequest = config.resolver.resolveRequest;

config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (moduleName === 'mammoth') {
    return {
      filePath: require.resolve('mammoth/mammoth.browser.js'),
      type: 'sourceFile',
    };
  }

  /**
   * react-native-pdf 是纯原生视图，内部会 require('react-native/Libraries/...') 的原生实现，
   * web 打包时这些相对路径没有 .web 变体 → 整个 web 构建直接失败
   * （"Unable to resolve module ../Utilities/Platform"）。
   * 这里在 web 平台把它解析成空模块；PdfRenderer 里另有运行时守卫，
   * 拿到空对象时会降级成"当前平台暂不支持 PDF 预览"。
   */
  if (platform === 'web' && (moduleName === 'react-native-pdf' || moduleName === 'react-native-blob-util')) {
    return { type: 'empty' };
  }

  if (NODE_BUILTINS.has(moduleName) && NODE_BUILTIN_OWNERS.test(context.originModulePath ?? '')) {
    // 返回一个空模块：这些分支只在 Node 环境才会真正被调用
    return { type: 'empty' };
  }

  if (defaultResolveRequest) {
    return defaultResolveRequest(context, moduleName, platform);
  }
  return context.resolveRequest(context, moduleName, platform);
};

module.exports = config;
