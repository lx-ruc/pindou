# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Status

🚧 **Core MVP implemented (uni-app + Vue 3); H5 live at https://lx-ruc.github.io/pindou/.** Image → pixel-pattern generation works end-to-end on H5 + WeChat Mini Program: upload, pixelization (dominant-color), 291-color mapping, 5-brand switching, per-bead color codes, 10-cell zones, recommended route, progress tracking, PNG export. **Not yet built:** color merge (P0, blocked on LAB data), AI matting, SDXL generation, and **photo-based progress recognition** (the differentiator). Roadmap: `docs/technical-roadmap.md`.

## What this project is

**拼豆智能助手 (Pindou Assistant)** — an AI-powered tool that turns arbitrary images into perler-bead patterns and tracks the user's assembly progress via photo recognition. Targeting **WeChat Mini Program + Web dual-end** from a single uni-app (Vue 3) codebase.

**Differentiator vs existing tools** (e.g. `Zippland/perler-beads`): photo-based **assembly progress recognition** — point a camera at a half-finished board, the app diffs it against the target pattern and reports which cells are wrong/missing.

## Read these first

Before any implementation work, read:

- `docs/requirements.md` — 21 features prioritized P0–P3, user stories, non-functional requirements
- `docs/technical-roadmap.md` — tech stack, architecture diagram, data models, 5 core algorithms, phase roadmap, risk register
- `docs/competitive-analysis.md` — competitor (pindou.org) feature audit + borrow list
- `docs/data-sources.md` — provenance of the color dataset
- `README.md` — public-facing summary

## Non-negotiable constraints

- **License: AGPL-3.0.** Derivative works must be open-sourced under the same terms. Do not copy code from perler-beads or any other AGPL project unless the user explicitly accepts this constraint.
- **Client-first principle.** If a feature can run on the client (Canvas, WebAssembly, on-device model), it must. Server calls only for: AI image generation (SDXL), optional heavy AI matting, persistence the user opts into. This protects both cost and user privacy.
- **Five-brand color systems are NOT interchangeable.** MARD `A01` ≠ COCO `E02` ≠ 漫漫 `E2` ≠ 盼盼 `65` ≠ 咪小窝 `77`, even when they map to the same HEX. Never hard-code a single brand's code; always go through the palette abstraction.
- **WeChat Mini Program constraints:** main package ≤ 2 MB; large AI models must be lazy-loaded via subpackages/plugins; Canvas API differs subtly from web — algorithm code lives in `src/utils/` as pure TypeScript (no DOM/小程序 API), with platform-specific glue (Canvas drawing, image decode) isolated in `src/composables/` and `src/utils/canvasDraw.ts`. Branch platform behavior with uni-app conditional compilation (`// #ifdef H5` / `// #ifdef MP-WEIXIN`).

## Key data asset

`data/colorSystemMapping.json` — 291 standard HEX colors × 5 brand code systems. Structure:

```json
{
  "#FAF4C8": { "MARD": "A01", "COCO": "E02", "漫漫": "E2", "盼盼": "65", "咪小窝": "77" }
}
```

Loaded by brand lookup, not by iterating. **Pending enrichment** (not yet present): RGB, LAB (needed for CIEDE2000), Chinese color names, color series classification. Brand coverage gaps to fill: 黄豆豆, 优肯.

## Architecture

**uni-app 4 + Vue 3 + Pinia single project** (npm, not a monorepo). One codebase compiles to WeChat Mini Program + H5.

- `src/pages/pattern/index.vue` — main page (pattern generation + progress tracking)
- `src/components/pattern/` — Toolbar, StatsPanel, ProgressStrip, OrigModal
- `src/stores/pattern.ts` — Pinia store (single source of truth: hexGrid, placed, mode, brand, size)
- `src/utils/` — **pure-TS algorithms** (pixelize, color mapping, palette, route, canvasDraw). **No DOM/小程序 API here** — this is the portability seam.
- `src/composables/` — platform-aware glue (useCanvas2d, useImageDecode)
- `data/colorSystemMapping.json` — 5-brand × 291-color dataset

Algorithms are specified in §4 of `technical-roadmap.md`. Notes:

- **Algorithm 1 (pixelization) uses dominant-color extraction, not mean pooling** — intentional, avoids gray artifacts at color boundaries.
- **H5 Canvas gotcha:** uni-app H5 `<canvas type="2d">` native drawing is broken (`fillStyle` changes don't apply). H5 uses `document.createElement('canvas')` directly; MP uses selectorQuery node + `toTempFilePath`. See `docs/h5-canvas-display.md`.
- **Color merge (Algorithm 3) is P0 / first priority** — see `docs/competitive-analysis.md`; blocked on LAB data enrichment.

## Working in this repo

- **Toolchain (npm):** `npm run dev:h5` (H5 dev server), `npm run dev:mp-weixin` (MP dev), `npm run build:h5` (build), `npm test` (vitest), `npm run type-check` (vue-tsc).
- **Deploy:** push to `main` → GitHub Actions builds H5 → GitHub Pages (https://lx-ruc.github.io/pindou/).
- To validate `colorSystemMapping.json` after edits: `python3 -c "import json; json.load(open('data/colorSystemMapping.json'))"` or equivalent.
- Treat edits to `docs/*.md` as substantive changes that should be reviewed against the rest of the docs (especially roadmap ↔ requirements consistency).
- After meaningful changes, commit + push to `github.com/lx-ruc/pindou` (SSH, `main`, conventional commits, no attribution trailer).
