# 拼豆智能助手 - 技术路线文档

> 版本：v0.1.0 · 最后更新：2026-06-22 · 状态：规划中

## 1. 技术栈选型

| 层 | 技术 | 理由 |
|----|------|------|
| **多端框架** | **Taro 4.x**（React + TypeScript） | 字节开源，一套代码编译微信小程序 + H5，社区活跃 |
| **状态管理** | Zustand | 轻量、无 boilerplate，比 Redux 简洁 |
| **样式方案** | Tailwind CSS + CSS Variables | Taro 4 已支持，主题色管理方便 |
| **UI 组件库** | NutUI React（京东） | 专为 Taro 设计，小程序兼容性好 |
| **图像处理（前端）** | Canvas API + 浏览器/小程序原生 Canvas | 客户端零成本处理，无需上云 |
| **图像处理（后端）** | Sharp（Node.js） | 缩放、格式转换，性能远超 Canvas |
| **AI 抠图** | U2Net / BiRefNet（ONNX Runtime Web） | 浏览器端跑模型，避免服务器成本 |
| **AI 生图** | SDXL 本地部署 / SiliconFlow API | 开源模型，免费额度可用 |
| **色差算法** | CIEDE2000（Delta E 2000） | 工业标准，比欧氏距离更符合人眼 |
| **进度识别** | OpenCV.js + 自研算法 | 透视变换 + 颜色对比，无需训练 |
| **后端** | Hono（Node.js/Bun） | 轻量、快、类型安全 |
| **数据库** | SQLite（开发）→ PostgreSQL（生产） | 起步轻量，可平滑迁移 |
| **ORM** | Drizzle ORM | 类型安全，SQL-like API |
| **对象存储** | Cloudflare R2 / 腾讯云 COS | R2 无出口费用，COS 国内快 |
| **部署（Web）** | Vercel | 免费、自动 CI/CD |
| **部署（小程序）** | 微信开发者工具 + 微信平台 | 国内必备 |
| **协议** | AGPL-3.0 | 衍生作品必须开源 |

## 2. 系统架构

```
┌──────────────────────────────────────────────────────────┐
│              客户端（Taro 多端）                          │
│  ┌─────────────────┐  ┌─────────────────┐               │
│  │   微信小程序     │  │      H5 Web     │               │
│  └────────┬────────┘  └────────┬────────┘               │
│           │     共享业务代码     │                        │
│           ▼                     ▼                        │
│  ┌─────────────────────────────────────────┐             │
│  │  图片处理引擎（Canvas）                 │             │
│  │  - 像素化、色号映射、杂色合并、抠图      │             │
│  │  - 进度识别算法                         │             │
│  └─────────────────────────────────────────┘             │
│  ┌─────────────────────────────────────────┐             │
│  │  本地存储（色号库、图纸缓存）           │             │
│  └─────────────────────────────────────────┘             │
└──────────────────────┬───────────────────────────────────┘
                       │ HTTP/WS（仅 AI 增强功能）
                       ▼
┌──────────────────────────────────────────────────────────┐
│              服务端（Hono on Bun/Node）                   │
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

- 基础图片处理（像素化、色号映射、杂色合并）：100% 客户端
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

### 算法 3：杂色合并（BFS）

```
输入：色号矩阵 + 阈值（默认 5）
输出：合并后的色号矩阵

1. 遍历网格，对未访问单元格启动 BFS
2. 将 CIEDE2000 色差 < 阈值的相邻格子合并为区域
3. 区域内统计色号频次，取最多的那个作为统一色号
4. 用户可调阈值（0-20），实时预览效果
```

**作用**：消除孤立噪点，让色块更干净。

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

```
pindou/
├── README.md
├── LICENSE                           # AGPL-3.0
├── docs/                             # 文档
│   ├── requirements.md               # 需求文档
│   ├── technical-roadmap.md          # 技术路线文档（本文件）
│   ├── data-sources.md               # 色号数据来源
│   └── algorithm-notes.md            # 算法笔记
├── data/
│   └── colorSystemMapping.json       # 5 品牌 × 291 色映射
├── packages/
│   ├── app/                          # Taro 多端应用
│   │   ├── src/
│   │   │   ├── pages/
│   │   │   │   ├── index/            # 首页
│   │   │   │   ├── generator/        # 图片转图纸
│   │   │   │   ├── progress-tracker/ # 进度识别
│   │   │   │   ├── palette/          # 色号库
│   │   │   │   └── my-projects/      # 我的项目
│   │   │   ├── components/
│   │   │   ├── hooks/
│   │   │   ├── stores/               # Zustand
│   │   │   ├── services/             # API 调用
│   │   │   └── app.config.ts         # Taro 配置
│   │   ├── project.config.json       # 小程序配置
│   │   └── package.json
│   ├── core/                         # 跨端核心逻辑（可独立发包）
│   │   ├── src/
│   │   │   ├── image/                # 像素化、色号映射、杂色合并
│   │   │   ├── color/                # CIEDE2000、LAB 转换
│   │   │   ├── progress/             # 进度识别算法
│   │   │   ├── data/                 # 色号数据加载
│   │   │   └── types/                # 共享类型
│   │   └── package.json
│   ├── server/                       # 后端 API
│   │   ├── src/
│   │   │   ├── routes/
│   │   │   ├── ai/                   # AI 服务集成
│   │   │   ├── db/                   # Drizzle schema
│   │   │   └── index.ts
│   │   └── package.json
│   └── shared/                       # 跨端共享（类型、常量、工具）
├── pnpm-workspace.yaml
├── package.json
└── .gitignore
```

### 为什么 Monorepo

`app` / `core` / `server` / `shared` 共享大量代码（色号、类型、算法），monorepo 能最大化复用，避免重复。`core` 包是纯 TS 实现，完全跨端，未来可独立发包给社区用。

## 6. 实施阶段（Roadmap）

### Phase 0：项目初始化（1-2 天）

- [ ] 初始化 monorepo（pnpm workspace）
- [ ] 创建 4 个 package（app / core / server / shared）
- [ ] Taro 4 + React + TypeScript + Tailwind 骨架
- [ ] 导入 5 品牌 × 291 色数据到 `data/colorSystemMapping.json`
- [ ] 写 README + LICENSE（AGPL-3.0）

### Phase 1：MVP（2-4 周）— 完成 P0 功能

**交付**：能上传图片 → 输出图纸 + 采购清单

- [ ] 色号库管理（load / query by HEX）
- [ ] 图片上传 + 像素化（算法 1）
- [ ] 色号映射（先用欧氏距离，算法 2 简化版）
- [ ] 品牌切换 UI
- [ ] 图纸导出（PNG + 网格）
- [ ] 采购清单导出
- [ ] 豆板用量计算
- [ ] 微信小程序基础适配（首次提审）

### Phase 2：AI 增强（4-8 周）— 完成 P1 功能

**交付**：抠图、杂色清理、手动精修

- [ ] 杂色合并（算法 3）
- [ ] 背景移除（算法 4 客户端版）
- [ ] CIEDE2000 替换欧氏距离
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
| **微信小程序 Canvas API 与 Web 不一致** | 高 | Taro 已做抽象；关键算法放 `core` 包用纯 TS 实现，避开 DOM/小程序差异 |
| **AI 模型体积大，小程序包体超限** | 高 | 主包控制在 2MB 内，AI 模型按需加载（分包/插件） |
| **图片处理性能（大图）** | 中 | 客户端预压缩到 max 1024px，再走算法；必要时上 Web Worker |
| **色差算法在不同显示器上结果不同** | 中 | 以 sRGB + D65 为标准，不做显示器校准 |
| **AGPL 协议限制商业化** | 中 | 接受开源属性，未来增值服务（AI 生图）可独立计费 |
| **豆子色号数据更新（新色/停产）** | 低 | 数据版本化，半年校准一次；社区贡献 PR |
| **进度识别准确率** | 高 | MVP 先支持光照良好的正俯视场景；复杂场景后续迭代 |

## 8. 度量与监控

- **前端性能**：Taro 内置 Performance API，记录关键步骤耗时
- **错误监控**：Sentry（自部署或免费额度）
- **用户行为**：Umami（开源、隐私友好）替代 GA
- **AI 调用成本**：每次 API 调用打 tag，月度报表

## 9. 参考资料

- [Zippland/perler-beads](https://github.com/Zippland/perler-beads) — 核心算法参考（AGPL-3.0）
- [Taro 官方文档](https://taro-docs.jd.com/)
- [CIEDE2000 论文](https://en.wikipedia.org/wiki/Color_difference#CIEDE2000)
- [U2Net 抠图模型](https://github.com/xuebinqin/U-2-Net)
- [ONNX Runtime Web](https://onnxruntime.ai/docs/tutorials/web/)
