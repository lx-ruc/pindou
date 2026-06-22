# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Status

🚧 **Planning stage — no code yet.** This repo currently contains only documentation and the color code dataset. Implementation will follow the roadmap in `docs/technical-roadmap.md`. There are no build, test, or lint commands until Phase 0 (project initialization) is executed.

## What this project is

**拼豆智能助手 (Pindou Assistant)** — an AI-powered tool that turns arbitrary images into perler-bead patterns and tracks the user's assembly progress via photo recognition. Targeting **WeChat Mini Program + Web dual-end** from a single Taro codebase.

**Differentiator vs existing tools** (e.g. `Zippland/perler-beads`): photo-based **assembly progress recognition** — point a camera at a half-finished board, the app diffs it against the target pattern and reports which cells are wrong/missing.

## Read these first

Before any implementation work, read:

- `docs/requirements.md` — 21 features prioritized P0–P3, user stories, non-functional requirements
- `docs/technical-roadmap.md` — tech stack, architecture diagram, data models, 5 core algorithms, 4-phase roadmap, risk register
- `docs/data-sources.md` — provenance of the color dataset
- `README.md` — public-facing summary

## Non-negotiable constraints

- **License: AGPL-3.0.** Derivative works must be open-sourced under the same terms. Do not copy code from perler-beads or any other AGPL project unless the user explicitly accepts this constraint.
- **Client-first principle.** If a feature can run on the client (Canvas, WebAssembly, on-device model), it must. Server calls only for: AI image generation (SDXL), optional heavy AI matting, persistence the user opts into. This protects both cost and user privacy.
- **Five-brand color systems are NOT interchangeable.** MARD `A01` ≠ COCO `E02` ≠ 漫漫 `E2` ≠ 盼盼 `65` ≠ 咪小窝 `77`, even when they map to the same HEX. Never hard-code a single brand's code; always go through the palette abstraction.
- **WeChat Mini Program constraints:** main package ≤ 2 MB; large AI models must be lazy-loaded via subpackages/plugins; Canvas API differs subtly from web — algorithm code must live in `packages/core` as pure TypeScript, with all platform-specific glue isolated in `packages/app`.

## Key data asset

`data/colorSystemMapping.json` — 291 standard HEX colors × 5 brand code systems. Structure:

```json
{
  "#FAF4C8": { "MARD": "A01", "COCO": "E02", "漫漫": "E2", "盼盼": "65", "咪小窝": "77" }
}
```

Loaded by brand lookup, not by iterating. **Pending enrichment** (not yet present): RGB, LAB (needed for CIEDE2000), Chinese color names, color series classification. Brand coverage gaps to fill: 黄豆豆, 优肯.

## Planned architecture (when implementation begins)

Monorepo with pnpm workspaces:

- `packages/app` — Taro 4 multi-end app (WeChat MP + H5)
- `packages/core` — pure-TS image algorithms (pixelization, color mapping, BFS cleanup, progress recognition). **No DOM/小程序 API here** — this is the portability seam.
- `packages/server` — Hono backend (AI services, persistence)
- `packages/shared` — cross-end types, constants, utilities

Algorithms are specified in §4 of `technical-roadmap.md`. Note that **Algorithm 1 (pixelization) uses dominant-color extraction, not mean pooling** — this is intentional to avoid gray artifacts at color boundaries.

## Working in this repo today

- There is no toolchain yet — don't invent `npm test` / `pnpm build` / `pnpm dev` invocations. They will fail.
- To validate `colorSystemMapping.json` after edits: `python3 -c "import json; json.load(open('data/colorSystemMapping.json'))"` or equivalent.
- Documentation is the product right now. Treat edits to `docs/*.md` as substantive changes that should be reviewed against the rest of the docs (especially roadmap ↔ requirements consistency).
