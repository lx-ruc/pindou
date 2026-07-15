import { defineStore } from 'pinia'
import { ref, shallowRef, triggerRef, computed } from 'vue'
import type { Brand, Cell, Hex, ImagePixels, Mode, PickedImage, Progress } from '@/types/pattern'
import { DEFAULT_BRAND } from '@/utils/palette'
import { pixelize } from '@/utils/pixelize'
import { computeCounts, computeRoute, findNextUnplaced } from '@/utils/route'
import { mergePipeline } from '@/utils/colorMerge'
import { hexToRgb } from '@/utils/color'
import type { Snapshot } from '@/utils/persist'

/** 图像类型档位：cartoon/photo 为命名预设，custom 为用户已偏离任意预设 */
export type Profile = 'cartoon' | 'photo' | 'custom'

/** profile 相关参数集合（改这些会改变派生 profile；不含 zoom/zones/codes/guide/brand/mode） */
export interface ProfileBundle {
  sizeMult: number
  mergeEnabled: boolean
  spatialEnabled: boolean
  paletteEnabled: boolean
  spatialThreshold: number
  paletteMaxColors: number
  paletteMinCount: number
  paletteThreshold: number
}

// size 自动范围（命名常量，单一来源）。
// 注意：CEILING=120 不在本变更抬高——导出 buffer 墙仍压它（见 design 决策 6/7）；
// 按板分页导出（3.6）后才能抬到 ~200，让 size lever 触及更多大图。
export const SIZE_AUTO_FLOOR = 80
export const SIZE_AUTO_CEILING = 120
/** 手动滑块范围（允许低于自动 floor，用户自负） */
export const SIZE_MANUAL_MIN = 50
export const SIZE_MANUAL_MAX = 200

function clampAutoSize(n: number): number {
  return Math.max(SIZE_AUTO_FLOOR, Math.min(SIZE_AUTO_CEILING, n))
}

// 两档预设（数值为经验假设，待 §4 调参 campaign 定稿）。
// 卡通：偏大 size 保线（×1.3，受 cap 夹击，大图会收敛）+ 仅 palette 收敛
//       （spatial 关——避免吞掉卡通本意近色，见 design 决策 2 SD-3；待 4.1 判定实验确认）。
// 照片：偏小 size 平均纹理（×0.7）+ spatial 平滑 → palette 去杂色封顶。
export const CARTOON_PROFILE: ProfileBundle = {
  sizeMult: 1.3,
  mergeEnabled: true,
  spatialEnabled: false,
  paletteEnabled: true,
  spatialThreshold: 10, // spatial 关时占位
  paletteMaxColors: 0, // 卡通本就没几色，不限
  paletteMinCount: 3,
  paletteThreshold: 12,
}

export const PHOTO_PROFILE: ProfileBundle = {
  sizeMult: 0.7,
  mergeEnabled: true,
  spatialEnabled: true,
  paletteEnabled: true,
  spatialThreshold: 10,
  paletteMaxColors: 40, // 照片用不满 291，封顶降备料
  paletteMinCount: 3,
  paletteThreshold: 12,
}

const PROFILE_BUNDLES: Record<Exclude<Profile, 'custom'>, ProfileBundle> = {
  cartoon: CARTOON_PROFILE,
  photo: PHOTO_PROFILE,
}

export const usePatternStore = defineStore('pattern', () => {
  // 源图像 —— shallowRef 避免 Vue 对 typed array 做 reactive proxy（否则 pixelize 下标访问卡死）
  const srcData = shallowRef<Uint8ClampedArray | null>(null)
  const srcW = ref(0)
  const srcH = ref(0)
  const imgAspect = ref(1)
  const origTempFilePath = ref('')

  // 设置（初始值 = PHOTO_PROFILE，使首屏 profile 派生为 photo）
  const brand = ref<Brand>(DEFAULT_BRAND)
  const mode = ref<Mode>('view')
  const size = ref(120)
  const zoom = ref(1)
  const showZones = ref(true)
  const showCodes = ref(true)
  const guide = ref(true)

  // 颜色合并（流水线：固定序 spatial→palette，每步可开关；mergeEnabled 总开关）
  const mergeEnabled = ref(PHOTO_PROFILE.mergeEnabled)
  const spatialEnabled = ref(PHOTO_PROFILE.spatialEnabled)
  const paletteEnabled = ref(PHOTO_PROFILE.paletteEnabled)
  const spatialThreshold = ref(PHOTO_PROFILE.spatialThreshold)
  const paletteMaxColors = ref(PHOTO_PROFILE.paletteMaxColors)
  const paletteMinCount = ref(PHOTO_PROFILE.paletteMinCount)
  const paletteThreshold = ref(PHOTO_PROFILE.paletteThreshold)

  // 计算结果 —— 全用 shallowRef（避免对大数组做 deep reactive）
  const rows = ref(0)
  const cols = ref(0)
  const hexGrid = shallowRef<Hex[][]>([])
  const placed = shallowRef<boolean[][]>([])
  const sortedItems = shallowRef<[Hex, number][]>([])
  const routeOrder = shallowRef<Cell[]>([])

  const totalBeads = computed(() => rows.value * cols.value)

  // profile 派生标签（决策 8）：当前参数正好等于某档 bundle 则该档，否则 custom。
  const profile = computed<Profile>(() => {
    for (const name of ['cartoon', 'photo'] as const) {
      if (matchesBundle(PROFILE_BUNDLES[name])) return name
    }
    return 'custom'
  })

  /** 给定倍率下该图应得的自动 size（无源图时返回当前 size，使比对恒真） */
  function expectedSize(mult: number): number {
    const longer = Math.max(srcW.value, srcH.value)
    if (!longer) return size.value
    return clampAutoSize(Math.round((longer / 6) * mult))
  }

  function matchesBundle(b: ProfileBundle): boolean {
    return (
      mergeEnabled.value === b.mergeEnabled &&
      spatialEnabled.value === b.spatialEnabled &&
      paletteEnabled.value === b.paletteEnabled &&
      spatialThreshold.value === b.spatialThreshold &&
      paletteMaxColors.value === b.paletteMaxColors &&
      paletteMinCount.value === b.paletteMinCount &&
      paletteThreshold.value === b.paletteThreshold &&
      size.value === expectedSize(b.sizeMult)
    )
  }

  const progress = computed<Progress>(() => {
    let m = 0
    const pl = placed.value
    for (let r = 0; r < rows.value; r++) {
      const row = pl[r]
      if (!row) continue
      for (let c = 0; c < cols.value; c++) {
        if (row[c]) m++
      }
    }
    const n = totalBeads.value
    const pct = n ? Math.round((m / n) * 100) : 0
    const ni = findNextUnplaced(routeOrder.value, pl)
    return {
      placed: m,
      total: n,
      pct,
      next: ni >= 0 ? routeOrder.value[ni] : null,
      nextIdx: ni,
    }
  })

  function ingest(picked: PickedImage): void {
    const { tempFilePath, pixels } = picked
    srcData.value = pixels.data
    srcW.value = pixels.width
    srcH.value = pixels.height
    imgAspect.value = pixels.width / pixels.height
    origTempFilePath.value = tempFilePath
    placed.value = []
    // 默认照片档（决策 8）：applyProfile 设 size（longer/6 × 0.7，受 floor/cap 夹）+ merge 参数 + recompute
    applyProfile('photo')
  }

  /**
   * 应用命名预设：一次性写入 size + 合并步开关 + 各阈值，再 recompute。
   * 用户手改任一相关参数后，派生 profile 自动变 custom（无需显式标记）。
   * 覆盖用户已有手改（决策 8：静默覆盖，UI 层负责 toast）。
   */
  function applyProfile(p: Exclude<Profile, 'custom'>): void {
    const b = PROFILE_BUNDLES[p]
    mergeEnabled.value = b.mergeEnabled
    spatialEnabled.value = b.spatialEnabled
    paletteEnabled.value = b.paletteEnabled
    spatialThreshold.value = b.spatialThreshold
    paletteMaxColors.value = b.paletteMaxColors
    paletteMinCount.value = b.paletteMinCount
    paletteThreshold.value = b.paletteThreshold
    size.value = expectedSize(b.sizeMult)
    recompute()
  }

  function recompute(): void {
    let raw = srcData.value
    let pw = srcW.value
    let ph = srcH.value
    // ghost 态：srcData 没了（刷新后），从持久化的 hexGrid 反推虚拟像素，让调参依然生效
    if (!raw) {
      const hg = hexGrid.value
      const r0 = rows.value
      const c0 = cols.value
      if (r0 === 0 || c0 === 0 || hg.length === 0) return
      const data = new Uint8ClampedArray(r0 * c0 * 4)
      for (let y = 0; y < r0; y++) {
        const row = hg[y]
        if (!row) continue
        for (let x = 0; x < c0; x++) {
          const [R, G, B] = hexToRgb(row[x])
          const i = (y * c0 + x) * 4
          data[i] = R; data[i + 1] = G; data[i + 2] = B; data[i + 3] = 255
        }
      }
      raw = data
      pw = c0
      ph = r0
    }
    ;(globalThis as any).__pindouLogs = (globalThis as any).__pindouLogs || []
    const t0 = Date.now()
    const _log = (tag: string) => {
      ;(globalThis as any).__pindouLogs.push(`[${((Date.now() - t0) / 1000).toFixed(2)}s][recompute] ${tag}`)
    }
    _log('start')
    const src: ImagePixels = {
      data: raw,
      width: pw,
      height: ph,
    }
    const { rows: r, cols: c, hexGrid: hg0 } = pixelize(src, size.value, imgAspect.value)
    _log('after pixelize')
    // 合并流水线（决策 2）：固定序 spatial→palette，每步按 enabled 执行；下游全基于合并后的 hg
    let hg: Hex[][] = hg0
    if (mergeEnabled.value) {
      hg = mergePipeline(hg0, r, c, [
        { kind: 'spatial', enabled: spatialEnabled.value, spatialThreshold: spatialThreshold.value },
        {
          kind: 'palette',
          enabled: paletteEnabled.value,
          paletteMaxColors: paletteMaxColors.value || undefined,
          paletteMinCount: paletteMinCount.value,
          paletteThreshold: paletteThreshold.value,
        },
      ])
      _log('after merge pipeline')
    }
    rows.value = r
    cols.value = c
    hexGrid.value = hg
    _log('after rows/cols/hexGrid set')
    const items = computeCounts(hg)
    _log('after computeCounts')
    sortedItems.value = items
    routeOrder.value = computeRoute(hg, r, c, items)
    _log('after computeRoute')
    if (placed.value.length !== r || (r > 0 && placed.value[0].length !== c)) {
      placed.value = hg.map((row) => row.map(() => false))
      _log('after placed reset')
    }
    _log('done')
  }

  function togglePlaced(r: number, c: number): void {
    if (r < 0 || r >= rows.value || c < 0 || c >= cols.value) return
    placed.value[r][c] = !placed.value[r][c]
    // shallowRef 需要手动触发更新
    triggerRef(placed)
  }

  function resetPlaced(): void {
    for (let r = 0; r < rows.value; r++) {
      const row = placed.value[r]
      if (!row) continue
      for (let c = 0; c < cols.value; c++) row[c] = false
    }
    triggerRef(placed)
  }

  function setMode(m: Mode): void {
    mode.value = m
  }

  function setBrand(b: Brand): void {
    if (b === brand.value) return
    brand.value = b
  }

  function setSize(s: number): void {
    const clamped = Math.max(SIZE_MANUAL_MIN, Math.min(SIZE_MANUAL_MAX, s))
    if (clamped === size.value) return
    size.value = clamped
    placed.value = []
    recompute()
  }

  function setZoom(z: number): void {
    zoom.value = z
  }

  function toggleZones(): void {
    showZones.value = !showZones.value
  }

  function toggleCodes(): void {
    showCodes.value = !showCodes.value
  }

  function toggleGuide(): void {
    guide.value = !guide.value
  }

  function setMergeEnabled(v: boolean): void {
    if (v === mergeEnabled.value) return
    mergeEnabled.value = v
    recompute()
  }
  function setSpatialEnabled(v: boolean): void {
    if (v === spatialEnabled.value) return
    spatialEnabled.value = v
    recompute()
  }
  function setPaletteEnabled(v: boolean): void {
    if (v === paletteEnabled.value) return
    paletteEnabled.value = v
    recompute()
  }
  function setSpatialThreshold(v: number): void {
    if (v === spatialThreshold.value) return
    spatialThreshold.value = v
    recompute()
  }
  function setPaletteMaxColors(v: number): void {
    if (v === paletteMaxColors.value) return
    paletteMaxColors.value = v
    recompute()
  }
  function setPaletteMinCount(v: number): void {
    if (v === paletteMinCount.value) return
    paletteMinCount.value = v
    recompute()
  }
  function setPaletteThreshold(v: number): void {
    if (v === paletteThreshold.value) return
    paletteThreshold.value = v
    recompute()
  }

  /**
   * 应用恢复的快照：直接写参数/几何/图纸/进度，进入 ghost 态
   * （srcData=null → 调参/原图/重新生成需重传图；track 记进度不受影响）。
   * 不调 recompute（它依赖 srcData），改为就地重算派生 sortedItems/routeOrder。
   * profile 不存（派生），由写入的参数自动重派生。
   */
  function applyRestored(snap: {
    params: Snapshot['params']
    rows: number
    cols: number
    srcW: number
    srcH: number
    imgAspect: number
    hexGrid: Hex[][]
    placed: boolean[][]
  }): void {
    const p = snap.params
    brand.value = p.brand
    mode.value = p.mode
    size.value = p.size
    zoom.value = p.zoom
    showZones.value = p.showZones
    showCodes.value = p.showCodes
    guide.value = p.guide
    mergeEnabled.value = p.mergeEnabled
    spatialEnabled.value = p.spatialEnabled
    paletteEnabled.value = p.paletteEnabled
    spatialThreshold.value = p.spatialThreshold
    paletteMaxColors.value = p.paletteMaxColors
    paletteMinCount.value = p.paletteMinCount
    paletteThreshold.value = p.paletteThreshold
    rows.value = snap.rows
    cols.value = snap.cols
    srcW.value = snap.srcW
    srcH.value = snap.srcH
    imgAspect.value = snap.imgAspect
    // immutable 拷贝（外部快照数组不再被引用）
    const hg = snap.hexGrid.map((row) => row.slice())
    const pl = snap.placed.map((row) => row.slice())
    hexGrid.value = hg
    placed.value = pl
    srcData.value = null
    origTempFilePath.value = ''
    const items = computeCounts(hg)
    sortedItems.value = items
    routeOrder.value = computeRoute(hg, snap.rows, snap.cols, items)
  }

  return {
    srcData,
    srcW,
    srcH,
    imgAspect,
    origTempFilePath,
    brand,
    mode,
    size,
    zoom,
    showZones,
    showCodes,
    guide,
    mergeEnabled,
    spatialEnabled,
    paletteEnabled,
    spatialThreshold,
    paletteMaxColors,
    paletteMinCount,
    paletteThreshold,
    profile,
    rows,
    cols,
    hexGrid,
    placed,
    sortedItems,
    routeOrder,
    totalBeads,
    progress,
    ingest,
    recompute,
    applyProfile,
    togglePlaced,
    resetPlaced,
    setMode,
    setBrand,
    setSize,
    setZoom,
    toggleZones,
    toggleCodes,
    toggleGuide,
    setMergeEnabled,
    setSpatialEnabled,
    setPaletteEnabled,
    setSpatialThreshold,
    setPaletteMaxColors,
    setPaletteMinCount,
    setPaletteThreshold,
    applyRestored,
  }
})
