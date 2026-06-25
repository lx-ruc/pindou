# 拼豆智能助手 - 技术路线文档

> 版本：v0.1.0 · 最后更新：2026-06-22 · 状态：规划中

## 1. 技术栈选型

> ✅ 已落地 · 🔜 规划中（未启动）

| 层 | 技术 | 状态 | 理由 |
|----|------|------|------|
| **多端框架** | **uni-app 4.x**（Vue 3 + TypeScript） | ✅ | DCloud 出品，一套代码编译微信小程序 + H5，Vue 生态，Vite 构建 |
| **状态管理** | **Pinia** | ✅ | Vue 官方推荐，轻量、类型安全 |
| **构建工具** | **Vite 5 + @dcloudio/vite-plugin-uni** | ✅ | 快速 HMR，uni-app 官方 Vite 方案 |
| **样式方案** | **SCSS + 全局变量**（`src/uni.scss`）+ rpx | ✅ | uni-app 原生支持，rpx 跨端响应式，主题色集中管理 |
| **UI 组件** | **自研轻量组件**（`src/components/`） | ✅ | 不引入重型 UI 库，控制小程序主包 ≤ 2MB |
| **图像处理（前端）** | **Canvas API** | ✅ | 客户端零成本；H5 端用原生 `document.createElement('canvas')` 绕过 uni node-canvas 显示 bug（见 [h5-canvas-display.md](./h5-canvas-display.md)） |
| **算法核心** | **纯 TS**（`src/utils/`：pixelize / color / palette / route） | ✅ | 无 DOM / 小程序 API，跨端可移植 |
| **单元测试** | **Vitest 2**（`tests/`） | ✅ | 覆盖 pixelize / color / palette / route |
| **部署（Web）** | **GitHub Pages**（Actions 自动构建） | ✅ | 免费、push 即部署；线上 https://lx-ruc.github.io/pindou/ |
| **色差算法** | CIEDE2000（Delta E 2000） | 🔜 | 工业标准，比欧氏距离更符合人眼；MVP 先欧氏 RGB（颜色合并 P0 前置，依赖 LAB 数据） |
| **进度识别** | OpenCV.js + 自研算法 | 🔜 | 透视变换 + 颜色对比，无需训练；核心差异化（算法 5） |
| **AI 抠图** | U2Net / BiRefNet（ONNX Runtime Web） | 🔜 | 浏览器端跑模型，避免服务器成本 |
| **AI 生图** | SDXL / SiliconFlow API | 🔜 | 开源模型，免费额度可用 |
| **后端** | Hono（Node.js/Bun） | 🔜 | 轻量、快、类型安全；仅 AI 增强 + 可选持久化 |
| **数据库** | SQLite → PostgreSQL | 🔜 | 起步轻量，可平滑迁移 |
| **ORM** | Drizzle ORM | 🔜 | 类型安全，SQL-like API |
| **对象存储** | Cloudflare R2 / 腾讯云 COS | 🔜 | R2 无出口费用，COS 国内快 |
| **部署（小程序）** | 微信开发者工具 + 微信平台 | 🔜 | 国内必备 |
| **协议** | AGPL-3.0 | ✅ | 衍生作品必须开源 |

## 2. 系统架构

```
┌──────────────────────────────────────────────────────────┐
│              客户端（uni-app 多端）                       │
│  ┌─────────────────┐  ┌─────────────────┐               │
│  │   微信小程序     │  │      H5 Web     │               │
│  └────────┬────────┘  └────────┬────────┘               │
│           │     共享业务代码     │                        │
│           ▼                     ▼                        │
│  ┌─────────────────────────────────────────┐             │
│  │  图片处理引擎（Canvas）                 │             │
│  │  - 像素化、色号映射、颜色合并、抠图      │             │
│  │  - 进度识别算法                         │             │
│  └─────────────────────────────────────────┘             │
│  ┌─────────────────────────────────────────┐             │
│  │  本地存储（色号库、图纸缓存）           │             │
│  └─────────────────────────────────────────┘             │
└──────────────────────┬───────────────────────────────────┘
                       │ HTTP/WS（仅 AI 增强功能）
                       ▼
┌──────────────────────────────────────────────────────────┐
│        服务端（Hono · 🔜 规划中，当前未启动）             │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐                │
│  │ AI 生图  │  │ AI 抠图  │  │ 进度识别 │                │
│  │  SDXL    │  │ U2Net    │  │  算法    │                │
│  └──────────┘  └──────────┘  └──────────┘                │
│  ┌────────────────────────────────────────┐              │
│  │  PostgreSQL + 对象存储                 │              │
│  └────────────────────────────────────────┘              │
└──────────────────────────────────────────────────────────┘
```

### 关键设计原则

**能用客户端做的绝不上云** — 省成本、护隐私、响应快。

- 基础图片处理（像素化、色号映射、颜色合并）：100% 客户端
- AI 抠图：默认客户端（ONNX Runtime Web），可选服务端
- AI 生图：必须服务端（模型体积大）
- 进度识别：客户端为主（OpenCV.js）

## 3. 数据模型

```
BrandColor（色号库）
├── id: int
├── brand: enum(MARD, COCO, 漫漫, 盼盼, 咪小窝)
├── code: string          // 色号，如 "A01"
├── hex: string           // "#FAF4C8"
├── rgb: [r, g, b]
├── lab: [l, a, b]        // 用于 CIEDE2000
├── name_zh: string?      // 中文名（可选）
└── series: string?       // 色系（如 "黄色系"）

Board（豆板规格）
├── id: int
├── name: string          // "标准大方板"
├── rows: int             // 29
├── cols: int             // 29
├── bead_size: enum(5mm, 2.6mm, 10mm)
└── physical_size: string // "14.5×14.5cm"

Palette（色板）
├── id: int
├── brand_id: int
├── name: string          // "MARD 168色套装"
├── color_ids: int[]      // 包含哪些色号

Pattern（图纸）
├── id: int
├── source_image_url: string?
├── grid: [[color_code]] // 二维数组，每格的色号
├── rows: int
├── cols: int
├── palette_id: int
├── board_id: int
└── metadata: json

Project（用户项目）
├── id: int
├── user_id: int?
├── pattern_id: int
├── progress_grid: [[{done: bool, code: string}]]
├── created_at, updated_at

ProgressSnapshot（进度快照，P2 用）
├── id: int
├── project_id: int
├── photo_url: string
├── recognized_grid: [[string]]
├── diff_with_target: json
└── created_at
```

## 4. 核心算法

### 算法 1：像素化（主导色提取）

```
输入：原图 + 目标网格尺寸 (rows × cols)
输出：rows × cols 的 RGB 矩阵

1. 将原图按 rows × cols 网格分块
2. 对每块区域，统计像素 RGB 频次
3. 取出现频次最高的 RGB（主导色），而非均值
   → 避免色块边界出现灰色毛边
4. 输出 rows × cols 的 RGB 矩阵
```

**为什么不用均值**：均值会在红黄边界处算出橙色，导致图纸出现不存在的中间色。主导色保留真实存在的颜色。

### 算法 2：色号映射（CIEDE2000）

```
输入：RGB 矩阵 + 色板（BrandColor 列表）
输出：色号矩阵

1. 将每个像素 RGB 转换到 LAB 颜色空间
2. 对色板中所有色号预计算 LAB
3. 计算 CIEDE2000 色差（比欧氏距离更准）
4. 取色差最小的色号
5. 缓存最近 K 个候选，加速重复计算
```

**MVP 阶段**先用 RGB 欧氏距离，后续切换到 CIEDE2000。

### 算法 3：颜色合并（杂色清理）★ 生成质量第一优先级

两种互补模式，都基于 **CIEDE2000** 色差（依赖 LAB 数据，见 [data-sources.md §3.3](./data-sources.md)）。MVP 第一优先级，决定图纸成品感与采购色号数（备料成本）。竞品 pindou.org 的核心卖点。

**模式 A：空间孤立噪点清除（BFS）**
```
输入：色号矩阵 + 色差阈值 δ（默认 5）
1. 遍历网格，对未访问单元格启动 BFS
2. 将 CIEDE2000 色差 < δ 的相邻格子合并为连通区域
3. 区域内统计色号频次，取最多的那个作为统一色号
4. 消除 1-2 颗的孤立杂色 → 色块边界干净
```

**模式 B：全局色号归并（palette reduction）**
```
输入：色号矩阵 + 目标色数 N（或最小用量阈值 minCount）
1. 统计全图各色号数量
2. 把「数量 < minCount」或「与某大色 CIEDE2000 < δ」的小色，
   全局归并到最近的足够大的色
3. 结果：色号总数从几十降到 N（如 38→12），备料成本骤降
```

**可调**：用户在「色数少（省料/好拼）↔ 细节多（还原度高）」之间调 δ / N，实时预览。

**为什么是第一优先级**：直接决定成品感 + 备料成本，纯客户端算法（无 AI 依赖），原归入 P1「AI 增强」分类有误。

### 算法 4：背景移除（混合）

```
阶段 1（客户端，默认开启）：
1. 取边界单元格的主导色作为候选背景色
2. 洪水填充：从边界出发，色差 < 阈值的格子标记为"外部"
3. 忽略外部格子的色号映射

阶段 2（AI 增强，可选）：
4. U2Net 模型精细抠图（处理复杂背景）
```

### 算法 5：进度识别（创新点）★

```
输入：用户拍的豆板照片 + 目标图纸
输出：进度报告（已完成 / 未完成 / 拼错位置）

1. **透视校正**
   - 检测豆板四个角点（边缘检测 + 直线拟合）
   - Homography 矩阵将照片变换为正俯视图

2. **网格对齐**
   - 将正视图按 rows × cols 切分
   - 人工微调对齐（用户拖拽角点）

3. **逐格识别**
   a. 取每格中心区域（避开边界）的平均 RGB
   b. 与设计图该位置的色号对比
   c. 若色差 < 阈值 → 已完成
   d. 若识别为空（接近豆板色）→ 未完成
   e. 否则 → 拼错

4. **生成差异报告**
   - 已完成率（X/Y）
   - 还差：色号 A × N 颗、色号 B × M 颗
   - 拼错：位置 (r, c) 当前是 X，应该是 Y
```

**这是市面竞品没有的核心差异化功能**。

## 5. 目录结构

实际为 **uni-app 单项目**（非 monorepo）。算法放 `src/utils/` 纯 TS（无 DOM / 小程序 API），满足跨端可移植；未来如需独立发包算法，再抽 `src/utils` 为独立包。

```
pindou/
├── README.md
├── LICENSE                           # AGPL-3.0
├── CLAUDE.md                         # Claude Code 项目指令
├── package.json                      # 单项目（npm）
├── vite.config.ts                    # Vite + uni 插件；base 接 PAGES_BASE（CI 注入 /pindou/）
├── vitest.config.ts                  # 单元测试
├── tsconfig.json                     # @ → src 别名
├── index.html                        # H5 入口
├── docs/                             # 文档
│   ├── requirements.md               # 需求文档
│   ├── technical-roadmap.md          # 技术路线（本文件）
│   ├── data-sources.md               # 色号数据来源
│   ├── competitive-analysis.md       # 竞品分析（pindou.org）
│   └── h5-canvas-display.md          # H5 canvas 显示问题诊断
├── data/
│   └── colorSystemMapping.json       # 5 品牌 × 291 色（LAB 待补）
├── src/
│   ├── App.vue / main.ts             # 入口
│   ├── manifest.json                 # uni-app 配置（appid / 各端）
│   ├── pages.json                    # 页面路由 + navigationStyle
│   ├── uni.scss                      # 全局 SCSS 变量（色彩 / 圆角 / 阴影）
│   ├── pages/
│   │   └── pattern/index.vue         # 图纸生成主页面
│   ├── components/pattern/           # Toolbar / StatsPanel / ProgressStrip / OrigModal
│   ├── composables/                  # useCanvas2d / useImageDecode
│   ├── stores/pattern.ts             # Pinia store
│   ├── types/pattern.ts              # 共享类型
│   └── utils/                        # 纯 TS 算法（跨端可移植）
│       ├── pixelize.ts               # 算法 1 像素化（主导色）
│       ├── color.ts                  # 算法 2 色号映射（欧氏 → CIEDE2000）
│       ├── palette.ts                # 色板 / 5 品牌色号
│       ├── route.ts                  # 推荐拼装路径 + 分区
│       ├── canvasDraw.ts             # Canvas 绘制（平台胶水层）
│       └── permissions.ts            # 保存相册权限（MP）
├── tests/                            # Vitest 单元测试
├── brand/                            # logo 资产
├── prototype/                        # 早期 HTML demo（参考实现）
└── openspec/                         # OpenSpec 规格变更
```

### 为什么单项目（而非 monorepo）

uni-app 的 Vite 项目天然是单项目结构，`src/utils/` 已是纯 TS（无 DOM / 小程序 API），满足「算法跨端可移植」的核心诉求，无需 monorepo 拆包的额外复杂度。服务端（Hono）尚未启动，待真正需要时再独立为 `packages/server` 或单独仓库，避免过早抽象。

## 6. 实施阶段（Roadmap）

### Phase 0：项目初始化（1-2 天）✅ 已完成

- [x] 初始化 uni-app 4 + Vue 3 + TypeScript + Vite 单项目（npm，非 monorepo）
- [x] Pinia 状态管理 + SCSS 全局变量（`src/uni.scss`）
- [x] 导入 5 品牌 × 291 色数据到 `data/colorSystemMapping.json`
- [x] README + LICENSE（AGPL-3.0）
- [x] GitHub Pages 自动部署（Actions）
- [ ] LAB 数据补全（CIEDE2000 / 颜色合并前置）

### Phase 1：MVP（2-4 周）— 完成 P0 功能

**交付**：能上传图片 → 输出**干净**图纸 + **精简**采购清单

> 🎯 **生成质量主线**（基于竞品 pindou.org 分析，见 [competitive-analysis.md](./competitive-analysis.md)）：颜色合并是 MVP 第一优先级，决定成品感与备料成本。

- [ ] 色号库管理（load / query by HEX）
- [ ] **LAB 数据补全**（CIEDE2000 前置依赖，见 data-sources §3.3）
- [ ] 图片上传 + 像素化（算法 1）
- [ ] 色号映射（算法 2：欧氏 RGB → **CIEDE2000**）
- [ ] **颜色合并（算法 3：模式 A 空间去噪 + 模式 B 全局归并 / 限 N 色）** ★
- [ ] 品牌切换 UI
- [ ] 图纸导出（PNG + 网格）
- [ ] 采购清单导出
- [ ] 豆板用量计算
- [ ] 微信小程序基础适配（首次提审）

### Phase 2：AI 增强（4-8 周）— 完成 P1 功能

**交付**：抠图、手动精修、多尺寸预览

- [ ] 背景移除（算法 4 客户端版）
- [ ] 颜色排除 + 重映射
- [ ] 手动精修 UI（单格点击、撤销/重做）
- [ ] 多尺寸预览
- [ ] 后端 API 起步（Hono + Drizzle）

### Phase 3：进度识别（8-12 周）— 完成 P2 功能 ★

**交付**：拍照识别拼豆进度（核心差异化）

- [ ] 拍照 UI + 透视校正
- [ ] 网格对齐算法
- [ ] 逐格颜色识别
- [ ] 差异报告生成
- [ ] 进度可视化（红/绿/黄高亮）
- [ ] Project 数据模型实现

### Phase 4：生态能力（12-16 周）— P3 功能

- [ ] AI 生图集成（SDXL）
- [ ] 个人作品库
- [ ] 社区分享（可选）
- [ ] 豆子库存管理

## 7. 关键风险与应对

| 风险 | 影响 | 应对 |
|------|------|------|
| **微信小程序 Canvas API 与 Web 不一致** | 高 | uni-app 条件编译隔离两端；关键算法放 `src/utils` 纯 TS；H5 端用原生 canvas 绕过 uni node-canvas bug（见 [h5-canvas-display.md](./h5-canvas-display.md)） |
| **AI 模型体积大，小程序包体超限** | 高 | 主包控制在 2MB 内，AI 模型按需加载（分包/插件） |
| **图片处理性能（大图）** | 中 | 客户端预压缩到 max 1024px，再走算法；必要时上 Web Worker |
| **色差算法在不同显示器上结果不同** | 中 | 以 sRGB + D65 为标准，不做显示器校准 |
| **AGPL 协议限制商业化** | 中 | 接受开源属性，未来增值服务（AI 生图）可独立计费 |
| **豆子色号数据更新（新色/停产）** | 低 | 数据版本化，半年校准一次；社区贡献 PR |
| **进度识别准确率** | 高 | MVP 先支持光照良好的正俯视场景；复杂场景后续迭代 |

## 8. 度量与监控

- **前端性能**：浏览器 / uni Performance API，记录关键步骤耗时
- **错误监控**：Sentry（自部署或免费额度）
- **用户行为**：Umami（开源、隐私友好）替代 GA
- **AI 调用成本**：每次 API 调用打 tag，月度报表

## 9. 参考资料

- [Zippland/perler-beads](https://github.com/Zippland/perler-beads) — 核心算法参考（AGPL-3.0）
- [pindou.org](https://pindou.org/) — 竞品参考（颜色合并 / 画笔编辑 / 色号高亮），分析见 [competitive-analysis.md](./competitive-analysis.md)
- [uni-app 官方文档](https://uniapp.dcloud.net.cn/)
- [CIEDE2000 论文](https://en.wikipedia.org/wiki/Color_difference#CIEDE2000)
- [U2Net 抠图模型](https://github.com/xuebinqin/U-2-Net)
- [ONNX Runtime Web](https://onnxruntime.ai/docs/tutorials/web/)
