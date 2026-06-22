## ADDED Requirements

### Requirement: 色号体系（MVP：MARD）
系统 SHALL 以 MARD 色号体系为 MVP 的默认与唯一展示品牌；数据层加载 `data/colorSystemMapping.json`（291 HEX × 5 品牌）备用，其他品牌（COCO/漫漫/盼盼/咪小窝）的切换 UI 在后续版本提供。五个品牌色号相互独立、不可混用。

#### Scenario: 按 HEX 查询 MARD 色号
- **WHEN** 系统以 HEX "#FAF4C8" 查询 MARD 品牌
- **THEN** 返回色号 "A01"

#### Scenario: MVP 仅暴露 MARD
- **WHEN** 用户在 MVP 版本生成图纸
- **THEN** 豆面色号与采购清单均使用 MARD 色号；界面不提供品牌切换

### Requirement: 多品牌切换（后续版本，非 MVP）
系统 SHALL 在后续版本支持品牌切换：仅对色号网格重新映射色号、不重新像素化，500ms 内完成；五个品牌色号不可混用。MVP 不实现此切换 UI。

#### Scenario: 切换品牌只刷新色号（后续版本）
- **WHEN** 用户在后续版本将品牌从 MARD 切到 COCO
- **THEN** 豆面颜色不变，豆面色号与采购清单同步刷新为 COCO 色号（不重新像素化）

### Requirement: MVP 仅全色板
系统 SHALL 在 MVP 阶段仅支持全 291 色色板；96/144/168 色子集在子集数据补全前不提供。

#### Scenario: 选择色板规模
- **WHEN** 用户在 MVP 版本选择色板规模
- **THEN** 仅"全 291 色"可选；子集选项置灰或隐藏
