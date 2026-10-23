# 公式渲染测试

## 行内公式

质能方程 $E = mc^2$，勾股定理 $a^2 + b^2 = c^2$，下标与上标 $x_i^{2n}$。

一句话里塞三个公式：$\alpha$、$\beta$、$\gamma$，验证行内公式与文字基线是否对齐。

## 块级公式

$$
\int_0^\infty e^{-x^2}\,\mathrm{d}x = \frac{\sqrt{\pi}}{2}
$$

## 矩阵与对齐环境

$$
\begin{pmatrix} a & b \\ c & d \end{pmatrix}
\begin{pmatrix} x \\ y \end{pmatrix}
= \begin{pmatrix} ax + by \\ cx + dy \end{pmatrix}
$$

$$
\begin{align}
f(x) &= (x+1)^2 \\
     &= x^2 + 2x + 1
\end{align}
$$

## 中文与嵌套

$\text{当 } x > 0 \text{ 时}$，且 $\sum_{k=1}^{n} k = \dfrac{n(n+1)}{2}$。

## 非法公式（应降级为源码，不能崩）

$\thisIsNotACommand{x}$

## 代码块里的美元符号（不应被当成公式）

```bash
echo $HOME
echo "当前用户 ${USER}"
export PATH=$PATH:/usr/local/bin
awk '{print $1}' file.txt
```

```js
const price = 100;
const total = `总价 $${price}`;
```
