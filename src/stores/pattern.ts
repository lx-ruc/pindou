import { defineStore } from 'pinia'
import { ref, shallowRef, triggerRef, computed } from 'vue'
import type { Brand, Cell, Hex, ImagePixels, MergeMode, Mode, PickedImage, Progress } from '@/types/pattern'
import { DEFAULT_BRAND } from '@/utils/palette'
import { pixelize } from '@/utils/pixelize'
import { computeCounts, computeRoute, findNextUnplaced } from '@/utils/route'
import { mergePalette, mergeSpatial } from '@/utils/colorMerge'

export const usePatternStore = defineStore('pattern', () => {
  // 源图像 —— shallowRef 避免 Vue 对 typed array 做 reactive proxy（否则 pixelize 下标访问卡死）
  const srcData = shallowRef<Uint8ClampedArray | null>(null)
  const srcW = ref(0)
  const srcH = ref(0)
  const imgAspect = ref(1)
  const origTempFilePath = ref('')

  // 设置
  const brand = ref<Brand>(DEFAULT_BRAND)
  const mode = ref<Mode>('view')
  const size = ref(50)
  const zoom = ref(1)
  const showZones = ref(true)
  const showCodes = ref(true)
  const guide = ref(true)

  // 颜色合并（P0 生成质量：清杂色 / 减色号 / 降备料成本）
  const mergeEnabled = ref(true)
  const mergeMode = ref<MergeMode>('palette')
  const spatialThreshold = ref(10)
  const paletteMaxColors = ref(0) // 0 = 不限
  const paletteMinCount = ref(3)
  const paletteThreshold = ref(12)

  // 计算结果 —— 全用 shallowRef（避免对大数组做 deep reactive）
  const rows = ref(0)
  const cols = ref(0)
  const hexGrid = shallowRef<Hex[][]>([])
  const placed = shallowRef<boolean[][]>([])
  const sortedItems = shallowRef<[Hex, number][]>([])
  const routeOrder = shallowRef<Cell[]>([])

  const totalBeads = computed(() => rows.value * cols.value)

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
    recompute()
  }

  function recompute(): void {
    const raw = srcData.value
    if (!raw) return
    ;(globalThis as any).__pindouLogs = (globalThis as any).__pindouLogs || []
    const t0 = Date.now()
    const _log = (tag: string) => {
      ;(globalThis as any).__pindouLogs.push(`[${((Date.now() - t0) / 1000).toFixed(2)}s][recompute] ${tag}`)
    }
    _log('start')
    const src: ImagePixels = {
      data: raw,
      width: srcW.value,
      height: srcH.value,
    }
    const { rows: r, cols: c, hexGrid: hg0 } = pixelize(src, size.value, imgAspect.value)
    _log('after pixelize')
    // 颜色合并：pixelize 出 hg0 → 合并得 hg，下游 computeCounts/computeRoute/placed 全部基于 hg
    let hg: Hex[][] = hg0
    if (mergeEnabled.value) {
      hg = mergeMode.value === 'spatial'
        ? mergeSpatial(hg0, r, c, { threshold: spatialThreshold.value })
        : mergePalette(hg0, {
            maxColors: paletteMaxColors.value || undefined,
            minCount: paletteMinCount.value,
            threshold: paletteThreshold.value,
          })
      _log('after merge')
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
    if (s === size.value) return
    size.value = s
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
  function setMergeMode(m: MergeMode): void {
    if (m === mergeMode.value) return
    mergeMode.value = m
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
    mergeMode,
    spatialThreshold,
    paletteMaxColors,
    paletteMinCount,
    paletteThreshold,
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
    setMergeMode,
    setSpatialThreshold,
    setPaletteMaxColors,
    setPaletteMinCount,
    setPaletteThreshold,
  }
})
