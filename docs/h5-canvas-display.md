# H5 像素图显示问题 — 诊断记录

> 状态：**未解决（H5 端）**。MP 端已修。本文记录根因与已尝试方案，供接手者继续。

## 症状
H5（`npm run dev:h5`）上传图片后，像素图**只显示左上角一部分**（用户反馈：4 字图只露出"智"），或整片发红。MP（微信小程序）经修复后正常。

## 已验证【正确】的部分
用 puppeteer + 真实 DOM canvas 读像素 + 读 Pinia store，逐层确认：

1. **像素化 + 色号映射正确**：`store.hexGrid` 四角 = `#FC283C(红) / #324BCA(蓝) / #35C75B(绿) / #FFFF00(黄)`，与源图四象限一致。`utils/pixelize` + `utils/color`(LUT) 无问题（单测亦绿）。
2. **drawGrid 收到正确数据**：在 `drawGrid` 入口打印，`hexGrid` 四角确实是上述 4 色。

即：**数据层完全正确，问题在 canvas 绘制/显示层。**

## 根因
**uni-app H5 里 `uni.createSelectorQuery().select(canvas).fields({node:true})` 返回的 canvas node 是"幻影"** —— 在当前 `@dcloudio` 版本下，对它 `width=`/`getContext('2d')`/`fillRect` 的绘制**不会进入 DOM 显示**，`toDataURL` 导出的图也是错的（黑/红乱码），而非 hexGrid 的真实颜色。

证据：
- 对 `canvasNode`（uni node）做 `getImageData` readback → 黑/红乱码；
- 对真实 DOM canvas（`document.querySelector('.canvas-scroll canvas')`）readback → 全红；
- 两者不一致 → 不是同一个绘制面 → uni node 绘制没到达 DOM。
- `<image :src=导出图>` 因此显示全红/被裁。

> 这正是 `src/pages/pattern/index.vue` 里用"离屏 canvas + 导出给 `<image>`"绕过的那个 MP 显示 bug，在 H5 端表现为另一种失效。

## 已尝试的修复（均未成功，已回退）

| 方案 | 做法 | 结果 |
|------|------|------|
| 条件编译：H5 直显 canvas | `<!-- #ifdef H5 -->` 让 canvas 可见、`fetchCanvasNode` 用 `querySelector` 取真实 DOM canvas | 仍全红（drawGrid 收到 4 色但 canvas 画出红）—— 疑 uni H5 canvas 渲染层在该版本另有问题 |
| H5 `dpr=1` | 让导出 PNG = 容器尺寸，期望 `<image>` 不再按大原始尺寸裁切 | 仍全红（因 uni node 导出本身就坏，与 dpr 无关） |
| `<image mode=scaleToFill/aspectFit>` | 改 image 缩放模式 | 无效（uni H5 `<image>` 不缩放大数据 URL） |

## 已修复（MP，提交 `6ec14a0`，保留）
`canvas.toTempFilePath` 的 `width/height` 用整个 buffer（`canvas.width/height`），而非 CSS 逻辑像素 `cw/ch` —— 后者会被 WeChat 按 buffer 像素解释、只截左上 1/dpr。MP 端据此完整显示。

## 建议的下一步（H5）
1. **彻底绕开 uni-node canvas**：H5 端用 `document.querySelector` 拿真实 `<canvas>` DOM 元素 + 原生 `getContext('2d')` 绘制（不走 `uni.createSelectorQuery().fields({node:true})`）。注意 `fetchCanvasNode` 要在 canvas 真正渲染到 DOM 之后取（`onMounted` + `nextTick` + 适当延时，或用 `ref`）。
2. 用项目既有的 **`pindou-h5-test` harness**（puppeteer 驱动）验证：上传四色图 → 截 `.canvas-scroll` → 四象限颜色齐全且未被裁。
3. 若真实 DOM canvas 仍异常，检查 `@dcloudio/vite-plugin-uni` 版本 / 升级 uni-app，或改用 `<canvas>` 原生标签（不经 uni 包装）。

## 复现/验证脚手架（本会话用过的，已删除，可重建）
- 四色测试图：400×400，四象限红/蓝/绿/黄（`qi=(2 if x>=W/2 else 0)+(1 if y>=H/2 else 0)`）。
- puppeteer-core + 系统 Chrome：上传图 → 等 `.pick-prompt` 隐藏 → 截图 `.canvas-scroll` / 读 canvas `getImageData` → 按颜色家族统计四象限。
