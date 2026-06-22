## 1. 项目初始化（Phase 0）

- [ ] 1.1 初始化 pnpm workspaces monorepo
- [ ] 1.2 创建 `packages/app`（Taro 4 + React + TS + Tailwind）、`packages/core`（纯 TS）、`packages/server`（Hono 骨架）、`packages/shared`
- [ ] 1.3 配置 ESLint/Prettier/TS，添加 AGPL-3.0 LICENSE
- [ ] 1.4 将 `data/colorSystemMapping.json` 接入 `packages/core` 数据加载层

## 2. 色板能力（color-palette）

- [ ] 2.1 `core`: 实现 HEX → 品牌色号查询、品牌枚举、调色板 RGB 预计算
- [ ] 2.2 `core`: 实现最近色欧氏映射（MVP 简化版）
- [ ] 2.3 `app`: 品牌切换 UI，验证"只重映射不重像素化" < 500ms
- [ ] 2.4 记录子集数据（96/144/168）缺失，标记为后续待补

## 3. 图纸生成（pattern-generation）

- [ ] 3.1 `core`: 主导色像素化（降采样 + 4bit 直方图众数，bin/采样数留旋钮）
- [ ] 3.2 `app`: 图片上传 / 拍照入口 + EXIF 旋转校正
- [ ] 3.3 `app`: 上传已有图纸入口 + "实际尺寸"输入（避免重采样串色）
- [ ] 3.4 `core`+`app`: 符号分配（用量降序）+ 豆面符号渲染（自适应黑白）+ 色号图例
- [ ] 3.5 `core`+`app`: 单格手动改色（品牌内覆盖层）
- [ ] 3.6 `app`: 按 29×29 板分页 PNG 导出（网格 + 本页图例）
- [ ] 3.7 实测主导色 bin/采样参数，钉默认值

## 4. 进度追踪（progress-tracking）

- [ ] 4.1 `core`: 推荐路线（色批量频率降序 + 色内蛇形）
- [ ] 4.2 `core`: 预计时间模型（可调单豆/换色参数）
- [ ] 4.3 `app`: 手动点选标记已拼/取消 + 实时 m/n + 进度条
- [ ] 4.4 `app`: 引导高亮下一颗（+ 后 2 颗渐淡）+ "下一步"提示
- [ ] 4.5 `app`: 倒计时（总剩余为主 + 分段激励为辅，换色报点）
- [ ] 4.6 `app`: `Project` 本地持久化（图纸 + 已拼网格 + 路线状态），跨会话恢复
- [ ] 4.7 `app`: 多板项目的板切换与独立进度

## 5. 视觉与整合

- [ ] 5.1 落地像素 + neobrutalism 主题（参照 `/Users/lixin/Desktop/pindou-demo/` 原型）
- [ ] 5.2 H5 端跑通完整流程，真机性能验证
- [ ] 5.3 Taro 编译微信小程序，处理 Canvas / 包体差异
- [ ] 5.4 端到端：上传 → 图纸 → 导出；上传 → 图纸 → 引导拼豆 → 进度

## 后续独立变更（不在本次范围）

- [ ] 方案 Z spike（C1–C5 五验证点）→ 拍照识别进度（P2）
