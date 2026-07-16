## 1. 合并流水线（前置，决策 2）

- [x] 1.1 `stores/pattern.ts` recompute：合并从 XOR 改为固定序流水线（spatial→palette），按 `spatialEnabled`/`paletteEnabled` 执行启用的步骤，每步独立阈值
- [x] 1.2 `utils/colorMerge.ts`：按需加 `mergePipeline(grid, steps, opts)` 组合 helper（纯函数，复用现有 spatial/palette，不改算法）
- [x] 1.3 单测：流水线结果 = 分步依次结果；空步骤 / 单步骤回退与原单模式行为一致
- [x] 1.4 废弃 / 映射旧 `mergeMode` 字段，兼容已有持久化快照

## 2. 档位机制（决策 1 / 6）

- [x] 2.1 store 加 `applyProfile(p)`（写入 p 的 bundle 常量：size 倍率 + `spatialEnabled`/`paletteEnabled` + 各阈值）+ 两档 bundle 常量；profile 为 computed（见 2.2）。ingest 默认调 `applyProfile('photo')`
- [x] 2.2 `profile` 为 computed（比对当前参数与两档 bundle，匹配则该档、否则 custom）；无显式转移、无 setter 耦合。定义 profile 相关参数集（见 design 决策 8）
- [x] 2.3 统一 size 上限为单一常量（消除 预设 ≤100 / 默认 120 / 滑块 200 三处不一致）
- [x] 2.4 `Snapshot` v2 增 `spatialEnabled`/`paletteEnabled`（替 `mergeMode`；profile 派生不存）+ v1→v2 迁移，跨会话恢复（`applyRestored` 同步；profile 自动重派生）

## 3. UI（决策 1）

- [x] 3.1 `Toolbar.vue` 顶部加「图类型 [卡通][照片]」分段钮（最显眼，决定下方旋钮起点）
- [x] 3.2 选档 → `applyProfile` + toast（如「已切换到照片预设」）
- [x] 3.3 选档后下方 size / 合并 / 阈值旋钮显示值同步刷新；profile=custom 时档位钮不强亮

## 4. 调参 campaign（完成定义的必要部分，决策 5）

- [x] 4.1 **判定实验（决策 2 SD-3 收口，先于通用调参）**：测 spatial 对卡通是否有损（本意区分的近色色差分布）。无伤 → 步开关退化为可选；有损 → 确认卡通须 spatial off。此条反向影响数据模型。
- [ ] 4.2 准备代表性图集：卡通 / 线稿若干（含小分辨率 + 抗锯齿边缘）+ 照片若干（含纹理区 + 渐变区）
- [ ] 4.3 真机 `weapp-dev-mcp` + H5 `Playwright` 逐图调参，人眼判，记录每档 size 倍率 / 各阈值最佳值
- [ ] 4.4 定稿数值写回 cartoon / photo 两套默认（替换 tasks 中的占位假设）
- [ ] 4.5 混合图（插画 / 贴纸）误分率观察 → 决定本期内是否加第三档（决策 4）

## 5. 验证

- [x] 5.1 utils 单测覆盖（pipeline 组合 / profile 不变量）
- [x] 5.2 H5 + mp-weixin 构建通过
- [ ] 5.3 端到端：卡通图选卡通档→干净；照片选照片档→干净；切档→旋钮刷新；手改任一旋钮→profile=custom 且生效
