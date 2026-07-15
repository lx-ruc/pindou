import type { Hex } from '@/types/pattern'
import { hexToOklab, oklabDistance } from './oklab'
import type { Oklab } from './oklab'

export type DistFn = (a: Oklab, b: Oklab) => number

export interface MergeSpatialOptions {
  /** 同色判定阈值（CIEDE2000 单位），distFn < threshold 视为同色连通 */
  threshold: number
  /** 色差函数，默认 oklab；测试可注入简化距离 */
  distFn?: DistFn
}

export interface MergePaletteOptions {
  /** 目标色数上限；0 / undefined = 不限，靠 minCount + threshold 自然收敛 */
  maxColors?: number
  /** 大色最小频次，低于此为小色，默认 3 */
  minCount?: number
  /** 小色归并到大色的色差阈值，默认 12 */
  threshold?: number
  /** 色差函数，默认 oklab */
  distFn?: DistFn
}

const DEFAULT_DIST: DistFn = oklabDistance

// 8 邻居方向（拼豆对角接触也算同色块）
const DIRS8: ReadonlyArray<readonly [number, number]> = [
  [-1, -1], [-1, 0], [-1, 1],
  [0, -1], /*  */ [0, 1],
  [1, -1], [1, 0], [1, 1],
]

/**
 * 模式 A：空间 BFS 去孤立杂色。
 * 8 连通，同色（distFn < threshold）连通区域取众数 hex 统一；单格区域跳过。
 * 不修改输入，返回新 Hex[][]。
 */
export function mergeSpatial(
  grid: readonly Hex[][],
  rows: number,
  cols: number,
  options: MergeSpatialOptions
): Hex[][] {
  const out = grid.map((row) => row.slice())
  if (rows === 0 || cols === 0) return out

  const dist = options.distFn ?? DEFAULT_DIST
  const threshold = options.threshold
  const visited = new Uint8Array(rows * cols)
  const stack: number[] = []
  const compCells: number[] = []

  for (let sr = 0; sr < rows; sr++) {
    for (let sc = 0; sc < cols; sc++) {
      const startIdx = sr * cols + sc
      if (visited[startIdx]) continue

      stack.length = 0
      compCells.length = 0
      stack.push(startIdx)
      visited[startIdx] = 1
      const baseHex = grid[sr][sc]
      const baseLab = hexToOklab(baseHex)

      while (stack.length) {
        const idx = stack.pop() as number
        compCells.push(idx)
        const r = (idx / cols) | 0
        const c = idx % cols
        for (const [dr, dc] of DIRS8) {
          const nr = r + dr
          const nc = c + dc
          if (nr < 0 || nr >= rows || nc < 0 || nc >= cols) continue
          const ni = nr * cols + nc
          if (visited[ni]) continue
          if (dist(baseLab, hexToOklab(grid[nr][nc])) < threshold) {
            visited[ni] = 1
            stack.push(ni)
          }
        }
      }

      if (compCells.length < 2) continue

      // 区域内取众数 hex 统一
      let modeHex = baseHex
      let modeN = -1
      const counts = new Map<Hex, number>()
      for (const i of compCells) {
        const h = grid[(i / cols) | 0][i % cols]
        const n = (counts.get(h) ?? 0) + 1
        counts.set(h, n)
        if (n > modeN) {
          modeN = n
          modeHex = h
        }
      }
      for (const i of compCells) {
        out[(i / cols) | 0][i % cols] = modeHex
      }
    }
  }

  return out
}

/**
 * 模式 B：全局色号归并。
 * 小色（频次 < minCount）归并到最近的足够大的大色（distFn < threshold）；
 * 若指定 maxColors，贪心迭代合并最接近的色对直到色数 ≤ N。
 * 全小色时兜底：最高频者升为大色。不修改输入，返回新 Hex[][]。
 */
export function mergePalette(grid: readonly Hex[][], options: MergePaletteOptions): Hex[][] {
  const out = grid.map((row) => row.slice())
  if (grid.length === 0 || grid[0].length === 0) return out

  const dist = options.distFn ?? DEFAULT_DIST
  const minCount = options.minCount ?? 3
  const threshold = options.threshold ?? 12

  // 统计全图频次
  const count = new Map<Hex, number>()
  for (const row of grid) {
    for (const h of row) {
      count.set(h, (count.get(h) ?? 0) + 1)
    }
  }

  // 大色 / 小色
  const entries = [...count.entries()]
  let bigs = entries.filter(([, n]) => n >= minCount).map(([h]) => h)
  let smalls = entries.filter(([, n]) => n < minCount).map(([h]) => h)
  if (bigs.length === 0 && entries.length > 0) {
    // 全小色兜底：最高频者升为大色
    const top = entries.sort((a, b) => b[1] - a[1])[0][0]
    bigs = [top]
    smalls = smalls.filter((h) => h !== top)
  }

  // 小色 → 最近大色（仅当 distFn < threshold 才归并）
  const mergeTo = new Map<Hex, Hex>()
  for (const s of smalls) {
    const labS = hexToOklab(s)
    let best: Hex | null = null
    let bestD = Infinity
    for (const b of bigs) {
      const d = dist(labS, hexToOklab(b))
      if (d < bestD) {
        bestD = d
        best = b
      }
    }
    if (best !== null && bestD < threshold) {
      mergeTo.set(s, best)
    }
  }

  // maxColors：贪心迭代合并最接近的存活色对
  if (options.maxColors && options.maxColors > 0) {
    const alive = new Set<Hex>(bigs)
    for (const s of smalls) if (!mergeTo.has(s)) alive.add(s)

    while (alive.size > options.maxColors) {
      const list = [...alive]
      let bx = ''
      let by = ''
      let bd = Infinity
      for (let i = 0; i < list.length; i++) {
        const labI = hexToOklab(list[i])
        for (let j = i + 1; j < list.length; j++) {
          const d = dist(labI, hexToOklab(list[j]))
          if (d < bd) {
            bd = d
            bx = list[i]
            by = list[j]
          }
        }
      }
      // 保留频次高的，合并另一个
      const keep = (count.get(bx) ?? 0) >= (count.get(by) ?? 0) ? bx : by
      const drop = keep === bx ? by : bx
      alive.delete(drop)
      for (const [k, v] of mergeTo) {
        if (v === drop) mergeTo.set(k, keep)
      }
      mergeTo.set(drop, keep)
    }
  }

  // 应用归并
  for (let r = 0; r < out.length; r++) {
    const row = out[r]
    for (let c = 0; c < row.length; c++) {
      const target = mergeTo.get(row[c])
      if (target) row[c] = target
    }
  }

  return out
}

/** 流水线单步：kind + 开关 + 该 kind 对应参数（仅对应 kind 读对应字段）。 */
export interface MergePipelineStep {
  kind: 'spatial' | 'palette'
  enabled: boolean
  /** spatial 同色连通阈值（distFn < threshold） */
  spatialThreshold?: number
  /** palette 目标色数上限；0 / undefined = 不限 */
  paletteMaxColors?: number
  /** palette 大色最小频次 */
  paletteMinCount?: number
  /** palette 小色归并色差阈值 */
  paletteThreshold?: number
}

export interface MergePipelineOptions {
  distFn?: DistFn
}

/**
 * 有序流水线：按 steps 顺序，对 enabled 的步骤依次应用，每步产出喂给下一步。
 * 顺序由调用方决定（store 固定 spatial→palette）。纯函数、不改输入；空 grid 返回 []。
 */
export function mergePipeline(
  grid: readonly Hex[][],
  rows: number,
  cols: number,
  steps: readonly MergePipelineStep[],
  options: MergePipelineOptions = {}
): Hex[][] {
  let out = grid.map((row) => row.slice())
  if (rows === 0 || cols === 0) return out
  const distFn = options.distFn ?? DEFAULT_DIST
  for (const step of steps) {
    if (!step.enabled) continue
    if (step.kind === 'spatial') {
      out = mergeSpatial(out, rows, cols, {
        threshold: step.spatialThreshold ?? 0,
        distFn,
      })
    } else {
      out = mergePalette(out, {
        maxColors: step.paletteMaxColors,
        minCount: step.paletteMinCount,
        threshold: step.paletteThreshold,
        distFn,
      })
    }
  }
  return out
}
