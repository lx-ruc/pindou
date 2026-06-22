# 拼豆图纸生成器 · 参考原型

MVP 的可视化参考实现：图片 → 拼豆图纸（每豆真实色号）+ 引导式拼豆进度。纯前端、单页、零依赖，用来锁定算法行为与视觉语言，**不是产品代码**（产品实现落 `packages/core` 纯 TS + `packages/app` Taro）。

## 运行

直接用浏览器打开 `index.html`（无需服务器）：

```bash
open prototype/index.html
```

点左上「选择图片」挑一张图（任意照片，或已有的拼豆图纸像素图），即可。

## 功能

- **图纸生成**：主导色提取（非均值，避免边界发灰）→ 291 色最近欧氏映射；网格尺寸 29 / 50 / 80 / 100
- **每豆真实色号**：每颗豆直接标注当前品牌的真实色号（如 MARD `A01`），字号按色号长度自适应；切品牌即时刷新
- **采购清单**：右侧按用量降序列出 色号 → 色块 → HEX → 数量
- **导出 PNG**：合成图 = 标题 + 网格（每豆色号）+ 采购清单，A4 可读
- **进度模式**：点豆标记已拼（再点取消），实时 `m/n` 进度条 + 引导高亮下一颗（推荐顺序：按色批量频率降序 + 色内蛇形）

## 数据

`palette.js` 由 `data/colorSystemMapping.json` 生成（5 品牌 × 291 色）。重新生成：

```bash
python3 -c "import json; d=json.load(open('../data/colorSystemMapping.json')); brands=['MARD','COCO','漫漫','盼盼','咪小窝']; print('ok', len(d), len(brands))"
```

## 对应规格

- `openspec/changes/add-mvp-pattern-and-progress/`（pattern-generation、progress-tracking 能力）
- 算法对应 `docs/technical-roadmap.md` 算法 1（像素化·主导色）+ 算法 2（色号映射·欧氏距离，MVP 简化版）

## 许可

AGPL-3.0（同主仓库）。
