# 拼豆智能助手 (Pindou Assistant)

> AI 驱动的拼豆图纸生成与进度追踪工具 · 开源免费 · 微信小程序 + Web 双端

## 项目简介

把任意图片秒变拼豆图纸，并在拼豆过程中通过拍照识别进度，告诉你还差什么色号、哪里拼错了。

## 核心功能

- **图片转图纸** — 上传图片，自动像素化 + 色号映射，5 大品牌支持
- **AI 智能处理** — 自动抠图、杂色清理、智能配色建议
- **进度识别** ★ — 拍照对比设计图，告诉你还差什么（差异化卖点）
- **AI 生图转拼豆** — 文字描述 → AI 生图 → 自动转图纸（规划中）

## 支持的拼豆品牌

| 品牌 | 色号数 | 编号风格 |
|------|--------|---------|
| MARD | 291 | A01 / B12 / ZG3 |
| COCO | 291 | E02 / K15 / GB08 |
| 漫漫 | 291 | E2 / DH15 / YX08 |
| 盼盼 | 291 | 纯数字（1-291） |
| 咪小窝 | 291 | 几乎全数字 |

## 项目状态

🚧 **规划阶段** — 文档已完成，代码未开始

## 文档

- [需求文档](docs/requirements.md)
- [技术路线文档](docs/technical-roadmap.md)
- [色号数据来源](docs/data-sources.md)

## 技术栈

- **前端**：Taro 4 + React + TypeScript + Tailwind CSS + Zustand
- **后端**：Hono + Drizzle ORM + PostgreSQL
- **AI**：U2Net（抠图）/ SDXL（生图）/ OpenCV.js（进度识别）
- **协议**：AGPL-3.0

## 快速开始（待实现）

```bash
git clone https://github.com/your-username/pindou.git
cd pindou
pnpm install
pnpm dev
```

## 参与贡献

欢迎 Issue 和 PR。请先阅读 [需求文档](docs/requirements.md) 和 [技术路线](docs/technical-roadmap.md)。

## 致谢

- [Zippland/perler-beads](https://github.com/Zippland/perler-beads) — 核心算法与色号数据参考
- [pixel-beads.com](https://www.pixel-beads.com/zh/mard-bead-color-chart) — MARD 官方色号数据

## License

AGPL-3.0 © 2026
