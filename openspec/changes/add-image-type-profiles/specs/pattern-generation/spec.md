## ADDED Requirements

### Requirement: 图像类型档位（卡通 / 照片）
系统 SHALL 提供两个图像类型档位（卡通、照片）作为「起始预设」：选择档位时一次性预设像素化 size、颜色合并步骤与各阈值。系统 SHALL 允许用户在选档后单独调整任一参数，且不以档位锁定这些参数；当用户手动修改任一相关参数后，系统 SHALL 将档位标记为 `custom`（已偏离预设）。对同一源图，照片档的 size SHALL 小于卡通档（照片偏粗以平均纹理，卡通偏细以保线 / 边）。

#### Scenario: 选照片档预设偏粗
- **WHEN** 用户上传一张照片并选择「照片」档
- **THEN** size 相对基线偏小、合并步骤为 spatial → palette、各阈值取照片预设值

#### Scenario: 选卡通档预设偏细
- **WHEN** 用户对一张线稿 / 卡通图选择「卡通」档
- **THEN** size 大于照片档对同一源图的取值（保细线 / 锐边），合并以 palette 收敛为主

#### Scenario: 档位不锁旋钮
- **WHEN** 用户在照片档下手动调高 size（或任一阈值）
- **THEN** 该修改生效，且档位标记变为 `custom`

#### Scenario: 跨会话恢复档位
- **WHEN** 用户选了照片档后退出，再次进入同一项目
- **THEN** 恢复 profile、各步开关（spatialEnabled/paletteEnabled）及各参数

### Requirement: 合并流水线（spatial → palette）
系统 SHALL 将颜色合并从单模式互斥升级为有序流水线（固定序：先空间平滑 spatial 再色号归并 palette，顺序不可由用户重排）；每步独立阈值，且 SHALL 允许通过每步开关跳过任一步骤。语义：spatial 负责 8 连通同色区域平滑（单格区域不处理），palette 负责小频次色归并与色数封顶。

#### Scenario: 照片先平滑再去杂色
- **WHEN** 一张照片在默认流水线（spatial → palette）下处理
- **THEN** 先 spatial 平滑同色区域、再 palette 去小频次杂色并按上限封顶色数

#### Scenario: 单步骤回退兼容
- **WHEN** 流水线仅含一步（例如仅 palette）
- **THEN** 结果与原有单模式 palette 一致

#### Scenario: 总开关关闭
- **WHEN** 合并总开关 `mergeEnabled` 关闭
- **THEN** 跳过整条流水线，直接使用像素化原始色号网格
