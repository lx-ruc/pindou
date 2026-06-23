## 1. 工程初始化（uni-app + Vue 3）

- [x] 1.1 uni-app + Vue 3 + TS 工程（`manifest.json` / `pages.json` / `tsconfig.json` / `vite.config.ts`）
- [x] 1.2 AGPL-3.0 LICENSE、`tsconfig`、`@/` 别名
- [x] 1.3 `data/colorSystemMapping.json` 接入 `src/utils/palette.ts`

## 2. 色板能力（color-palette）

- [x] 2.1 `utils/palette`: `PALETTE_HEX`(291) / `BRAND_CODES`(5 品牌) / `PAL_RGB`
- [x] 2.2 `utils/palette`+`utils/color`: 最近色映射 —— 32³ LUT 预计算 + `nearestHex` O(1) 查表
- [x] 2.3 MVP 仅 MARD（`DEFAULT_BRAND`，无品牌切换 UI；多品牌切换留后续）
- [x] 2.4 子集数据（96/144/168）缺失已记录 → MVP 仅全 291 色

## 3. 图纸生成（pattern-generation）

- [x] 3.1 `utils/pixelize`: 主导色像素化（4-bit/通道量化取众数，非均值）
- [x] 3.2 `composables/useImageDecode`: chooseImage + 压缩 + offscreen canvas `getImageData`（EXIF 由平台处理）
- [ ] 3.3 上传已有图纸入口 + "实际尺寸"输入（避免重采样串色）
- [x] 3.4 `utils/canvasDraw` + `StatsPanel`: 豆面真实色号 + 每 10 格分区坐标 + 采购清单
- [ ] 3.5 单格手动改色（品牌内覆盖层）
- [ ] 3.6 按 29×29 板分页 PNG 导出 <!-- 已有单张 toTempFilePath + 存相册；缺按板分页 -->
- [ ] 3.7 实测定主导色 bin/采样默认值

## 4. 进度追踪（progress-tracking）

- [x] 4.1 `utils/route`: 推荐顺序（色批量频率降序 + 色内蛇形）+ `zoneLabel`
- [ ] 4.2 预计时间模型（`estimateMs` / `formatDuration`，可调单豆/换色） <!-- 尚未实现 -->
- [x] 4.3 手动点选 `togglePlaced` + 实时 m/n（store `progress` computed）
- [x] 4.4 引导高亮下一颗（`findNextUnplaced`）+ "下一步"提示
- [ ] 4.5 倒计时（总剩余为主 + 分段激励为辅，换色报点）
- [ ] 4.6 `Project` 本地持久化（图纸 + 已拼网格 + 路线状态），跨会话恢复
- [ ] 4.7 多板项目的板切换与独立进度

## 5. 视觉、测试与整合

- [x] 5.1 像素 + neobrutalism 主题（`uni.scss` + 组件，参照 `prototype/`）
- [x] 5.2 `src/utils` 单测覆盖（palette / color / pixelize / route，16 个 vitest 用例）
- [ ] 5.3 H5 与微信小程序构建验证 + 真机性能
- [ ] 5.4 端到端：上传 → 图纸 → 导出；上传 → 图纸 → 引导拼豆 → 进度
- [ ] 5.5 清理 `globalThis.__pindouLogs` 调试残留（pixelize / store / useImageDecode / Toolbar / page）

## 后续独立变更（不在本次范围）

- [ ] 方案 Z spike（C1–C5 五验证点）→ 拍照识别进度（P2）
