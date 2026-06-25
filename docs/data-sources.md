# 色号数据来源说明

> 版本：v0.1.0 · 最后更新：2026-06-22

## 1. 数据文件

**主文件**：[`data/colorSystemMapping.json`](../data/colorSystemMapping.json)

**数据规模**：291 个标准颜色 × 5 个品牌色号体系

**数据结构**：

```json
{
  "#FAF4C8": {
    "MARD": "A01",
    "COCO": "E02",
    "漫漫": "E2",
    "盼盼": "65",
    "咪小窝": "77"
  },
  ...
}
```

- **Key**：HEX 颜色值（基于 sRGB 色彩空间）
- **Value**：5 个品牌对应的色号

## 2. 数据来源

### 2.1 MARD 官方色号

- **来源**：[pixel-beads.com/zh/mard-bead-color-chart](https://www.pixel-beads.com/zh/mard-bead-color-chart)
- **品牌官网**：MARD 拼豆（淘宝有旗舰店）
- **色号体系**：15 个字母前缀（A/B/C/D/E/F/G/H/M/P/Q/R/T/Y/ZG）+ 数字
- **总数**：291 色（含核心标准色、莫兰迪色、珍珠质感色、高亮荧光色）

### 2.2 5 品牌映射关系

- **来源**：[Zippland/perler-beads](https://github.com/Zippland/perler-beads) 项目的 `src/app/colorSystemMapping.json`
- **协议**：AGPL-3.0
- **覆盖品牌**：
  - **MARD**（291 色）
  - **COCO**（291 色，17 个色系前缀）
  - **漫漫**（291 色，20 个色系前缀）
  - **盼盼**（291 色，纯数字编号）
  - **咪小窝**（291 色，几乎全纯数字编号）

> ⚠️ **未覆盖**：黄豆豆、优肯这两个品牌暂无数据，需后续补充。

## 3. 数据特点

### 3.1 完全独立的色号体系

5 个品牌的色号**完全不通用**。例如同一个浅黄色 `#FAF4C8`：

| 品牌 | 色号 |
|------|------|
| MARD | A01 |
| COCO | E02 |
| 漫漫 | E2 |
| 盼盼 | 65 |
| 咪小窝 | 77 |

### 3.2 数据准确性

- HEX 值来自品牌方公开色卡
- 跨品牌映射基于人眼感知相似度（最接近的色号）
- 实际豆子会有**批次色差**，建议用户以实物色卡为准

### 3.3 未包含的信息（待补全）

- ❌ 颜色中文名（如「浅鹅黄」「樱花粉」）
- ❌ RGB 值（当前仅 HEX）
- ❌ LAB 值（用于 CIEDE2000 色差计算）—— **颜色合并（P0）的硬前置依赖，优先补全**
- ❌ 色系分类（如「黄色系」「绿色系」）
- ❌ 停产/在产状态
- ❌ 参考价格

## 4. 数据维护

### 4.1 更新频率

- **建议**：每 6 个月校准一次
- **触发**：品牌出新色、停产、色号体系调整

### 4.2 版本化

- 文件头将加入 `version` 和 `updatedAt` 字段
- 历史版本归档到 `data/history/`

### 4.3 贡献方式

欢迎社区通过 PR 补充：
1. 新品牌色号数据（如黄豆豆、优肯）
2. 颜色中文名翻译
3. 错误色号修正（附实物色卡对比图）

## 5. 加载与使用

```typescript
// 示例：从 core 包加载色号数据
import colorMap from '../../data/colorSystemMapping.json';

// 通过 HEX 查询某品牌色号
function getCodeByHex(hex: string, brand: Brand): string | undefined {
  return colorMap[hex.toUpperCase()]?.[brand];
}

// 获取某品牌全部色号
function getAllCodes(brand: Brand): Array<{ hex: string; code: string }> {
  return Object.entries(colorMap).map(([hex, codes]) => ({
    hex,
    code: codes[brand],
  }));
}
```

## 6. 法律与协议

- 色号数据本身为**事实信息**，不构成著作权保护对象
- 数据汇编方式受 **AGPL-3.0** 协议约束
- 商业使用需保留来源声明
- 品牌名称所有权归各自品牌方
