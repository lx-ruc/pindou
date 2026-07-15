## 关键设计决策

### 决策 1：档位 = 起始 bundle，不是模式锁
选卡通 / 照片档 → 一次性写入 size + `spatialEnabled`/`paletteEnabled` + 各阈值，toast 提示。之后用户单独动任何旋钮都正常生效、不被档位覆盖。档位只是「专家起点」，**保留现有全部自由度**，否则相对现状是倒退。

### 决策 2：合并升级为有序流水线（固定 spatial → palette，每步可开关）  ← 本变更最大技术决策
现状 store `recompute` 是 `mergeMode === 'spatial' ? spatial : palette`，XOR 二选一。照片理想管线是「先 spatial 平滑区域 → 再 palette 去杂色 + 封顶」，两步都要；维持互斥会让照片档永远次优。底层 `colorMerge` 已是纯函数，组合合法，故**只动 store + UI，不改算法**。替代方案 ②-keep（维持互斥）被否决。

**语义纠正（读 `colorMerge.ts` 后，与名字暗示相反）：**
- `mergeSpatial`：8 连通同色区域取众数统一、**单格区域跳过** → 做**区域平滑**、**不**去孤立杂色点；会顺手减少近重复色。
- `mergePalette`：小频次色（< minCount）归并到最近大色 + 可选 maxColors 封顶 → 才是**去孤立杂色 + 色数封顶**。

本决策含 7 个子决策：

- **SD-1 数据模型**：固定序 `[spatial, palette]` + 每步 `enabled` 标志；**不**做用户可重排的任意 `steps[]`（无 `palette→spatial` 用例，见 SD-2）。store/persist 存 `spatialEnabled`/`paletteEnabled` 两布尔；recompute 按固定序执行启用的步骤。
- **SD-2 顺序不可换**：spatial 作用在几何、palette 作用在色直方图。`spatial→palette` 让 palette 在更干净的直方图上减色（更温和原理化）；反过来会让 spatial 区域变大变激进、过平滑。**顺序由系统决定、不暴露给用户。**
- **SD-3 每步开关必要（不能只靠阈值）**：spatial 会吞掉「色差 < threshold 的相邻本意近色」，对卡通渐变阴影有损；调大阈值只降概率不消除，故卡通需 spatial 真关。是否必要见下方「开放实测门」。
- **SD-4 UI 暴露步开关（实现时修订）**：原设想「步开关内部定、不暴露」；实现时修订为**暴露**每步开关（边界关/边界平滑、色号关/色号归并）+ 各阈值滑块（步关时其阈值组隐藏）。理由：① 调参 campaign（§4）需手动切步；② 完全兑现「档位不锁」——每个 lever 用户可调，手动切步 → 派生 profile 变 custom，钮高亮自动跟随。原「边界/色号」单选 mode 钮被拆成两个独立步开关（可同开 = 照片档默认）。
- **SD-5 快照迁移 = bump v2 + v1→v2 迁移（不丢弃）**：`mergeMode`→步骤是确定性 1:1 映射，迁移 ~10 行；保用户状态优于丢弃（MVP 未发，丢弃也站得住，但迁移近零成本）。
- **SD-6 性能**：spatial O(cells) 廉价；palette 的 maxColors 贪心 O(colors²×迭代) 是热点（照片档 cap ~40-60 时），调参时观测，必要时封顶迭代数。
- **SD-7 流水线逻辑放 utils**：抽 `mergePipeline(grid, [{kind,enabled,opts}…])` 纯函数 fold（贴架构缝、可单测）；store 只构造 steps 调用。两步时 helper 较薄，保留为可单测的 Seam。

**straw-man 落点（7 个 SD 全按倾向解掉后）：**
- store：`mergeEnabled`（总开关，沿用）+ `spatialEnabled`/`paletteEnabled`（步开关）+ `profile` + 现有各阈值；recompute 固定序执行启用步骤。
- profile → 步开关 + 阈值：cartoon = {spatial: off, palette: on}、photo = {both: on}；手改任一旋钮 → profile = custom。
- UI：`[卡通 | 照片]` 钮替换 mode 分段钮；阈值滑块保留、步关则置灰。
- persist：Snapshot v2，params 去 `mergeMode`、加 `spatialEnabled`/`paletteEnabled`/`profile` + v1→v2 迁移。

**开放实测门（决定 SD-3 是必要还是可选）**：「spatial 是否伤卡通」取决于卡通里本意区分的近色色差通常多大——无先验答案。若实测常见卡通近色色差都 > threshold（>15）→ spatial 对卡通基本无害、步开关退化为可选；若有损 → 确认卡通须 spatial off、步开关是硬需求。**此条须在调参 campaign（tasks §4）单列为判定实验，先于通用调参**——因为它反向影响数据模型（SD-1/3），不是普通调参附属。

### 决策 3：命名贴脑模型，调参贴真实轴
档位对外叫「卡通 / 照片」（用户秒懂自己上传的是哪类）。但真正决定最优调参的是**色数 + 纹理方差**，不是采集方式：纯色墙的照片行为像卡通，高细节数字插画行为像照片。故：
- 手动档用「卡通 / 照片」命名 OK；
- **若未来做自动识别（非本变更），必须测色数 / 纹理方差，而不是猜「这是不是卡通」**——否则纯色墙照片会被误分到照片档、得不到 palette 收敛。此约束写入 design，防未来踩坑。

### 决策 4：先双档，第三档（插画 / 混合）待数据
二值档对混合图（插画、贴纸、照片 + 纯色背景、赛璐璐动画截图）会误分。因档位是可微调的起始 bundle，误分成本低（用户拧一下即可），MVP 先双档，上线后看误分率再决定是否加第三档「插画 / 混合」（size 中 + spatial→palette 全开 + 中阈值）。

### 决策 5：档位数值是经验假设，必须配调参 campaign
机制简单（store + UI，半天级），但每档的 size / threshold 具体值只能跑真实图、人眼判、反复调来定。本变更的完成定义**包含**一轮调参 campaign（代表性卡通图 + 照片各若干），产出两套定稿默认。**不做调参 = 未完成。**

### 决策 6：size 是次要 lever（被 floor/cap 夹击）；cap 值是 lever-range 决策且与分页 3.6 耦合

**前提纠正**：pixelize 实为「全像素采样（block <32px 时 step=1，逐像素）+ 精确 24-bit RGB 众数」，**无采样噪声地板**（add-mvp 的 design 决策 2 旧述「8×8/64 采样」已过时，待清理）。故卡通「×>1 更细保线」不撞噪声地板——细豆的代价是**边缘抗锯齿色的精确-RGB 碎片化**（众数可能取到某个抗锯齿中间色），由下游 merge（Oklab snap + palette）清掉。它撞的是 **bead-count cap**。

**size lever 被 floor(80) 与 cap(C) 夹住**：档位倍率（卡通 ×>1、照片 ×<1）只在两档 clamp 后 size 不同时才起作用——

| 统一 cap C | size lever 起作用的源图长边 | 区间外（两档 size 相同） |
|-----------|---------------------------|------------------------|
| 120（现状）| 369–1028 px | <369 同 floor 80；>1028 同 cap 120 |
| 200（滑块上限）| 369–1714 px | <369 同 floor 80；>1714 同 cap 200 |

> 关键：cap=120 时，size lever 对 **>1028px 的源图（含多数压缩后的手机照片 1028–2048）完全失效**——卡通与照片都收敛到 cap 120，size 无差。

**故 size 是次要 lever**：merge 流水线（决策 2）才是对**全分辨率**都有效的首要差异器；size 只在中分辨率（且 cap 足够高时）补一刀，对大图常失效。**档位价值不能主要靠「卡通大/照片小」兑现，大图必须靠 merge 策略扛。**

**cap 值是 lever-range 决策，不只是清理项**：cap 越高，size lever 覆盖越多大图。但 cap 受两道独立约束——
- 导出 buffer 墙（`bp=3500/size` 需 ≥ 可读阈值）→ 把 cap 压到 ~120；
- 项目 sanity（bead 数；341²≈11.6 万豆已荒谬）→ 即使放开导出，cap 仍有 ~200 的理性上限。

**与分页（3.6）强耦合**：只有按板分页导出能拆掉导出 buffer 墙、把 cap 从 ~120 抬到 ~200，size lever 才能触及多数手机照片。**故决策 6 与 3.6 不独立**——想要 size lever 对照片生效，需先 3.6（见决策 7）。本变更范围内：档位倍率在 `longer/6`（6px/豆保真基线，resolution-adaptive）上偏移（卡通 ×>1、照片 ×<1），并顺手把三处不一致的 size 上限（预设 ≤100 / 自动默认 120 / 滑块 200）统一为该单一 cap 常量。

### 决策 7（关联，非本变更）：抬 cap 的前置是按板分页导出（3.6）
分页同时解决两件事：① **大图保真**——源 >720px 在 cap 120 下每豆 7–17px、偏离 6px 保真基线而失真，放开 cap 才能 recover；② **让 size lever 触及大图**（见决策 6 的 lever-range 分析）。两道都卡在同一个导出 buffer 墙上，3.6 一并拆掉。**本变更只让「默认 size 随图类偏移」，不抬 cap**（那是 3.6 独立变更）；记录此因果，避免把「档位倍率」与「cap 上限」混为一谈。

### 决策 8：profile 是派生标签（computed），不是显式状态机
profile 不存为可写 state、不做转移函数，而是一个 **computed**：把当前 profile 相关参数与两档 bundle 常量逐一比对，匹配 cartoon 则 cartoon、匹配 photo 则 photo、否则 custom。零转移、零 setter 耦合；未来加新参数只需加入比对集，老 setter 不用改。

- **profile 相关参数集**（改这些会改变派生 profile）：`size`、`mergeEnabled`、`spatialEnabled`、`paletteEnabled`、`spatialThreshold`、`paletteMinCount`、`paletteThreshold`、`paletteMaxColors`。**不含** `zoom` / `showZones` / `showCodes` / `guide` / `brand` / `mode`（改这些不翻 custom，否则按钮乱闪）。
- **custom 下再点预设**：静默覆盖用户手改 + toast「已切换到 X，手动调整已重置」。不弹确认（摩擦大；手改可重新拧回）。`applyProfile(p)` = 写入 p 的 bundle 常量；派生 profile 随之变回 p。
- **ingest 新图的初始档位 = photo**：照片是常见且更难的场景，photo 预设是「看起来还行」的安全起点；卡通用户多知道要什么、会主动切。ingest 改为调 `applyProfile('photo')`（接管 size + merge 参数），而非现在的直接置 size。**记住上次档位**为未来 refinement（需单独持久化 `lastProfile`，本期不做）。
- **派生 ⇒ 快照不存 profile**：profile 由各参数派生，持久化只存参数（含 `spatialEnabled`/`paletteEnabled`），恢复时自动重派生；按钮高亮也随派生 profile 自动对齐。

## 数据模型改动

- store 新增**派生 `profile`（computed，非可写 state；见决策 8）**：比对当前 profile 相关参数与两档 bundle 常量，匹配则该档、否则 custom。两档 bundle 常量（`CARTOON_PROFILE` / `PHOTO_PROFILE`）+ `applyProfile(p)` 写入函数；ingest 默认 `applyProfile('photo')`。
- 合并参数从单 `mergeMode` 扩为**固定序流水线 + 每步开关**：`spatialEnabled`/`paletteEnabled` 两布尔（固定序 spatial→palette、不可重排，见决策 2 SD-1/2）；各步阈值复用现有字段（`spatialThreshold` / `paletteMinCount` / `paletteThreshold` / `paletteMaxColors`）。`mergeMode` 旧字段经 v1→v2 迁移映射（`'palette'`→palette on/spatial off，`'spatial'`→反之）。
- 持久化 `Snapshot` v2 增 `profile` + `spatialEnabled`/`paletteEnabled`（替 `mergeMode`），含 v1→v2 迁移。
