# 代码高亮测试

## JavaScript

```js
export function debounce(fn, delay = 200) {
  let timer = null;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), delay);
  };
}
```

## Python

```python
def fib(n: int) -> int:
    a, b = 0, 1
    for _ in range(n):
        a, b = b, a + b
    return a
```

## Go

```go
func Sum(nums []int) int {
	total := 0
	for _, n := range nums {
		total += n
	}
	return total
}
```

## SQL

```sql
SELECT id, name
FROM files
WHERE directory LIKE 'notes/%'
ORDER BY updated_at DESC
LIMIT 20;
```

## 超长行（验证横向滚动，不撑破布局）

```js
const veryLongLine = 'ThisIsAVeryLongStringThatShouldOverflowHorizontallyAndTestWhetherTheCodeBlockKeepsItsOwnScrollAreaWithoutBreakingTheOuterLayoutOfTheReaderPane';
```

## 无语言标注（应回退为纯文本）

```
plain text fallback
第二行中文
```

## 深色模式检查点

打开暗色主题后再看本文件：代码块背景应变深，**且 token 颜色不能还是亮色主题那一套**（深底深字即为 bug）。
