# 四级目录里的文件

这个文件位于 `notes/deep/a/b/`，用来验证：

1. 侧栏树能展开到第 4 层，缩进不串位
2. 面包屑显示 `notes / deep / a / b`，每一级可点击
3. 从阅读器点「返回」回到 `b` 目录，而不是直接跳根目录
4. 树里当前文件保持高亮

## 长文本（验证滚动进度）

Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris.

重复段落 1。
重复段落 2。
重复段落 3。
重复段落 4。
重复段落 5。
重复段落 6。
重复段落 7。
重复段落 8。
重复段落 9。
重复段落 10。
重复段落 11。
重复段落 12。
重复段落 13。
重复段落 14。
重复段落 15。

**到底了。** 如果进度环/百分比停在 100%，滚动节流逻辑正常；如果卡在 97% 之类，说明取整阈值有边界问题。
