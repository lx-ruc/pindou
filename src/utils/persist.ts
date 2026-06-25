import { watch, type WatchSource } from 'vue'
import type { Brand, Hex, MergeMode, Mode } from '@/types/pattern'
import { setKV } from './storage'

export const SNAPSHOT_KEY = 'pindou:snapshot'
const SNAPSHOT_VERSION = 1

/** store 最小契约 —— 用 ReturnType 自动跟 store 演进，零运行时开销（纯类型） */
export type PatternStore = ReturnType<typeof import('@/stores/pattern').usePatternStore>

/** 单项目快照：13 参数 + 几何 + 图纸 + 进度（不含原图像素 → 恢复后进入 ghost 态） */
export interface Snapshot {
  v: typeof SNAPSHOT_VERSION
  params: {
    brand: Brand
    mode: Mode
    size: number
    zoom: number
    showZones: boolean
    showCodes: boolean
    guide: boolean
    mergeEnabled: boolean
    mergeMode: MergeMode
    spatialThreshold: number
    paletteMaxColors: number
    paletteMinCount: number
    paletteThreshold: number
  }
  rows: number
  cols: number
  srcW: number
  srcH: number
  imgAspect: number
  hexGrid: Hex[][]
  placed: boolean[][]
}

/** 从 store 构造快照（immutable：深拷贝 hexGrid/placed，不污染 store 内部数组） */
export function buildSnapshot(store: PatternStore): Snapshot {
  return {
    v: SNAPSHOT_VERSION,
    params: {
      brand: store.brand,
      mode: store.mode,
      size: store.size,
      zoom: store.zoom,
      showZones: store.showZones,
      showCodes: store.showCodes,
      guide: store.guide,
      mergeEnabled: store.mergeEnabled,
      mergeMode: store.mergeMode,
      spatialThreshold: store.spatialThreshold,
      paletteMaxColors: store.paletteMaxColors,
      paletteMinCount: store.paletteMinCount,
      paletteThreshold: store.paletteThreshold,
    },
    rows: store.rows,
    cols: store.cols,
    srcW: store.srcW,
    srcH: store.srcH,
    imgAspect: store.imgAspect,
    hexGrid: store.hexGrid.map((row) => row.slice()),
    placed: store.placed.map((row) => row.slice()),
  }
}

export function serialize(s: Snapshot): string {
  return JSON.stringify(s)
}

/** 解析 + 版本校验；非法 JSON 或版本不符返回 null（不抛，避免阻断启动） */
export function deserialize(json: string): Snapshot | null {
  let parsed: unknown
  try {
    parsed = JSON.parse(json)
  } catch {
    return null
  }
  return isSnapshot(parsed) ? parsed : null
}

function isSnapshot(x: unknown): x is Snapshot {
  if (typeof x !== 'object' || x === null) return false
  const s = x as Record<string, unknown>
  if (s.v !== SNAPSHOT_VERSION) return false
  if (typeof s.params !== 'object' || s.params === null) return false
  if (typeof s.rows !== 'number' || typeof s.cols !== 'number') return false
  if (typeof s.srcW !== 'number' || typeof s.srcH !== 'number') return false
  if (typeof s.imgAspect !== 'number') return false
  if (!Array.isArray(s.hexGrid) || !Array.isArray(s.placed)) return false
  return true
}

/** 维度一致性：placed 行列须与 rows/cols 匹配；不符则恢复时丢弃进度 */
function dimsOk(s: Snapshot): boolean {
  if (s.hexGrid.length !== s.rows) return false
  if (s.placed.length !== s.rows) return false
  if (s.rows === 0) return true
  if (s.hexGrid[0].length !== s.cols) return false
  if (s.placed[0].length !== s.cols) return false
  return true
}

/** 应用快照到 store：维度不符则丢弃 placed（重置全 false），交给 store.applyRestored */
export function applySnapshot(store: PatternStore, snap: Snapshot): void {
  const placed = dimsOk(snap)
    ? snap.placed.map((row) => row.slice())
    : snap.hexGrid.map((row) => row.map(() => false))
  store.applyRestored({
    params: snap.params,
    rows: snap.rows,
    cols: snap.cols,
    srcW: snap.srcW,
    srcH: snap.srcH,
    imgAspect: snap.imgAspect,
    hexGrid: snap.hexGrid.map((row) => row.slice()),
    placed,
  })
}

/**
 * 挂载持久化写入：watch 13 参数 + placed 引用，debounce 300ms 合并连续 togglePlaced。
 * 返回 dispose，组件 onUnmounted 调用。
 * 不用 store.$subscribe —— setup-store 对 shallowRef 的 triggerRef 行为不稳，
 * watch 引用变化已由 pages/pattern/index.vue 现有 placed watch 验证可触发。
 */
export function installPersist(store: PatternStore): () => void {
  let timer: ReturnType<typeof setTimeout> | null = null
  const flush = (): void => {
    timer = null
    setKV(SNAPSHOT_KEY, serialize(buildSnapshot(store)))
  }
  const schedule = (): void => {
    if (timer) clearTimeout(timer)
    timer = setTimeout(flush, 300)
  }
  const sources: WatchSource<unknown>[] = [
    () => store.brand,
    () => store.mode,
    () => store.size,
    () => store.zoom,
    () => store.showZones,
    () => store.showCodes,
    () => store.guide,
    () => store.mergeEnabled,
    () => store.mergeMode,
    () => store.spatialThreshold,
    () => store.paletteMaxColors,
    () => store.paletteMinCount,
    () => store.paletteThreshold,
    () => store.placed,
  ]
  const stops = sources.map((src) => watch(src, schedule, { flush: 'post' }))
  return () => {
    stops.forEach((stop) => stop())
    if (timer) clearTimeout(timer)
  }
}
