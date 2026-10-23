// 这是一个独立的 .js 文件（不是 markdown），用于验证 code 类型的文件
// 打开它应该走代码渲染路径：等宽字体 + 语法高亮 + 无 markdown 解析

function greet(name) {
  return `Hello, ${name}!`;
}

console.log(greet('file browser'));
