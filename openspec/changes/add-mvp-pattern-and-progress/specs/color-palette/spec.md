## ADDED Requirements

### Requirement: 5 品牌色号体系
系统 SHALL 加载 `data/colorSystemMapping.json`（291 HEX × 5 品牌），并通过 HEX 查询指定品牌的色号。MARD / COCO / 漫漫 / 盼盼 / 咪小窝 五个品牌的色号体系相互独立、不可混用。

#### Scenario: 按 HEX 查询品牌色号
- **WHEN** 系统以 HEX "#FAF4C8" 查询 MARD 品牌
- **THEN** 返回色号 "A01"

#### Scenario: 品牌间色号不通用
- **WHEN** 同一 HEX 在不同品牌下查询
- **THEN** 各返回该品牌独立色号（MARD A01 ≠ COCO E02 ≠ 漫漫 E2 ≠ 盼盼 65 ≠ 咪小窝 77），系统不跨品牌复用色号

### Requirement: 品牌切换实时重映射
系统 SHALL 在用户切换品牌时，仅对色号网格重新映射色号、不重新像素化；切换在 500ms 内完成。

#### Scenario: 切换品牌只刷新色号
- **WHEN** 用户在已生成图纸上将品牌从 MARD 切到 COCO
- **THEN** 豆面颜色与符号不变，仅图例色号列刷新为 COCO 色号

### Requirement: MVP 仅全色板
系统 SHALL 在 MVP 阶段仅支持全 291 色色板；96/144/168 色子集在子集数据补全前不提供。

#### Scenario: 选择色板规模
- **WHEN** 用户在 MVP 版本选择色板规模
- **THEN** 仅"全 291 色"可选；子集选项置灰或隐藏
