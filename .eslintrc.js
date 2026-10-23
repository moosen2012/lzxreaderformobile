module.exports = {
  root: true,
  extends: ['expo'],
  ignorePatterns: ['node_modules/', 'dist/', 'web-build/', '.expo/', 'scripts/*.mjs'],
  rules: {
    // 组件文件里大量出现 TS 类型断言（第三方库类型不完整），显式 any 由 review 把关
    '@typescript-eslint/no-explicit-any': 'warn',
    '@typescript-eslint/no-unused-vars': [
      'error',
      { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
    ],
    // hooks 依赖顺序错误会导致真实 bug（本仓库历史上就有条件调用 hooks 的问题）
    'react-hooks/rules-of-hooks': 'error',
    'react-hooks/exhaustive-deps': 'warn',
  },
};
