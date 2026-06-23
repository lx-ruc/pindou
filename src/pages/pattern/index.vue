<script setup lang="ts">
import { ref, getCurrentInstance, onMounted, nextTick } from 'vue'
import { usePatternStore } from '@/stores/pattern'
import { drawGrid, drawProgressOverlay, drawComposed } from '@/utils/canvasDraw'
import { saveImageToAlbum } from '@/utils/permissions'
import Toolbar from '@/components/pattern/Toolbar.vue'
import ProgressStrip from '@/components/pattern/ProgressStrip.vue'
import StatsPanel from '@/components/pattern/StatsPanel.vue'
import OrigModal from '@/components/pattern/OrigModal.vue'

const store = usePatternStore()
const instance = getCurrentInstance()

const canvasId = 'patternCanvas'
const exportCanvasId = 'exportCanvas'
const showOrig = ref(false)
const exporting = ref(false)
// canvas 导出的 PNG 路径，给 <image> 显示（绕过 mp-weixin canvas 显示层 bug）
const patternImageSrc = ref('')

// 用 canvas 自己的 CSS 尺寸算 bp（不是父容器 scroll-view 的尺寸）
function fitBp(canvasCssW: number, canvasCssH: number): number {
  const zM = store.showZones ? 3.4 : 0
  // bp 能小到 3（确保任何 canvas 都能放下 grid）
  return Math.max(
    3,
    Math.min(
      48,
      Math.floor(Math.min(canvasCssW / (store.cols + zM), canvasCssH / (store.rows + zM)) * store.zoom)
    )
  )
}

// 缓存 canvas node：onMounted 时调一次 selectorQuery（在 setup scope 能成功）
// 后续 render 直接用缓存，不再调 selectorQuery（emit handler 里 selectorQuery callback 不触发）
let canvasNode: any = null
let canvasDpr = 1
let canvasCssW = 0
let canvasCssH = 0

function fetchCanvasNode(): Promise<void> {
  return new Promise((resolve) => {
    uni.createSelectorQuery()
      .in(instance)
      .select('#' + canvasId)
      .fields({ node: true, size: true } as any, (res: any) => {
        if (res && res.node) {
          canvasNode = res.node
          canvasDpr = uni.getSystemInfoSync().pixelRatio
          canvasCssW = res.width
          canvasCssH = res.height
        }
        resolve()
      })
      .exec()
  })
}

// 诊断 hook：画完后 300ms 读 canvas pixel data 写 storage（给 pindou-test skill 读）
function dumpCanvasStats(canvas: any, ctx: any, w: number, h: number): void {
  setTimeout(() => {
    try {
      const cw = canvas.width, ch = canvas.height
      if (cw === 0 || ch === 0) {
        ;(globalThis as any).wx.setStorageSync('__pindouCanvasStats', { error: 'canvas 0x0' })
        return
      }
      const imgData = ctx.getImageData(0, 0, cw, ch).data
      let colorPixels = 0
      const uniqueColors = new Set<number>()
      const sampleStep = 4 * 10
      let totalSamples = 0
      for (let i = 0; i < imgData.length; i += sampleStep) {
        totalSamples++
        const r = imgData[i], g = imgData[i + 1], b = imgData[i + 2], a = imgData[i + 3]
        if (a === 0) continue
        const isWhite = r > 245 && g > 245 && b > 245
        const isBlack = r < 30 && g < 30 && b < 30
        const isBg = Math.abs(r - 243) < 12 && Math.abs(g - 234) < 12 && Math.abs(b - 214) < 12
        if (!isWhite && !isBlack && !isBg) {
          colorPixels++
          uniqueColors.add((Math.round(r / 16) << 8) | (Math.round(g / 16) << 4) | Math.round(b / 16))
        }
      }
      const stats = {
        canvasW: cw, canvasH: ch,
        gridW: w, gridH: h,
        totalSamples, colorPixels,
        uniqueColors: uniqueColors.size,
        ts: Date.now(),
      }
      ;(globalThis as any).wx.setStorageSync('__pindouCanvasStats', stats)
    } catch (e) {
      ;(globalThis as any).wx.setStorageSync('__pindouCanvasStats', { error: (e as Error).message })
    }
  }, 300)
}

function render(): void {
  if (!store.srcData || store.rows === 0 || store.cols === 0) return
  if (!canvasNode) return

  const canvas = canvasNode
  const dpr = canvasDpr

  // canvas 离屏画 grid，然后 toTempFilePath 导出 PNG 给 <image> 显示
  // （mp-weixin devtools 下 canvas 直接显示不稳定，导出 PNG + image 渲染可靠）
  const bp = fitBp(canvasCssW, canvasCssH)
  const M = store.showZones ? Math.round(bp * 1.7) : 0
  const W = store.cols * bp + 2 * M
  const H = store.rows * bp + 2 * M

  canvas.width = Math.floor(W * dpr)
  canvas.height = Math.floor(H * dpr)
  const ctx = canvas.getContext('2d') as CanvasRenderingContext2D
  ctx.setTransform(1, 0, 0, 1, 0, 0)
  ctx.scale(dpr, dpr)
  ctx.clearRect(0, 0, W, H)

  drawGrid(ctx, store.hexGrid, store.rows, store.cols, bp, store.showCodes, store.showZones, store.brand)

  if (store.mode === 'track') {
    drawProgressOverlay(
      ctx,
      store.placed,
      store.rows,
      store.cols,
      bp,
      store.showZones,
      store.guide,
      store.routeOrder,
      store.progress.nextIdx
    )
  }

  // 导出 PNG 给 <image> 显示
  canvas.toTempFilePath({
    x: 0, y: 0, width: W, height: H,
    destWidth: Math.floor(W * dpr), destHeight: Math.floor(H * dpr),
    fileType: 'png',
    success: (r: any) => { patternImageSrc.value = r.tempFilePath },
    fail: (e: any) => { console.error('[render] toTempFilePath failed', e) },
  })

  dumpCanvasStats(canvas, ctx, W, H)
}

function onPicked(): void {
  nextTick(() => render())
}

function onCanvasTap(e: any): void {
  if (store.mode !== 'track' || !store.srcData) return
  const x = e.detail?.x ?? e.touches?.[0]?.x ?? e.changedTouches?.[0]?.x
  const y = e.detail?.y ?? e.touches?.[0]?.y ?? e.changedTouches?.[0]?.y
  if (x == null || y == null) return
  const bp = fitBp(canvasCssW, canvasCssH)
  const M = store.showZones ? Math.round(bp * 1.7) : 0
  const W = store.cols * bp + 2 * M
  const H = store.rows * bp + 2 * M
  const ox = Math.floor((canvasCssW - W) / 2)
  const oy = Math.floor((canvasCssH - H) / 2)
  const c = Math.floor((x - ox - M) / bp)
  const r = Math.floor((y - oy - M) / bp)
  if (r < 0 || r >= store.rows || c < 0 || c >= store.cols) return
  store.togglePlaced(r, c)
  nextTick(() => render())
}

async function onExport(): Promise<void> {
  if (exporting.value || !store.srcData) return
  exporting.value = true
  uni.showLoading({ title: '导出中…', mask: true })
  try {
    const bp = 30
    const M = Math.round(bp * 1.7)
    const gridW = store.cols * bp + 2 * M
    const gridH = store.rows * bp + 2 * M
    const titleH = 46
    const itemW = 176
    const itemH = 42
    const legendCols = Math.max(1, Math.min(store.sortedItems.length, Math.floor((gridW + 40) / itemW)))
    const legendRows = Math.ceil(store.sortedItems.length / legendCols)
    const W = Math.max(gridW, legendCols * itemW) + 40
    const H = titleH + gridH + legendRows * itemH + 34 + 40

    const exportNode: any = await new Promise((resolve, reject) => {
      uni.createSelectorQuery()
        .in(instance)
        .select('#' + exportCanvasId)
        .fields({ node: true }, (res: any) => {
          if (!res || !res.node) reject(new Error('export canvas not found'))
          else resolve(res.node)
        })
        .exec()
    })
    const canvas = exportNode as any
    const ctx = canvas.getContext('2d')
    const dpr = uni.getSystemInfoSync().pixelRatio
    canvas.width = Math.floor(W * dpr)
    canvas.height = Math.floor(H * dpr)
    ctx.setTransform(1, 0, 0, 1, 0, 0)
    ctx.scale(dpr, dpr)
    ctx.clearRect(0, 0, W, H)
    drawComposed(ctx, store.hexGrid, store.rows, store.cols, store.sortedItems, store.brand, bp)

    const tempFilePath: string = await new Promise((resolve, reject) => {
      canvas.toTempFilePath({
        x: 0, y: 0, width: W, height: H,
        destWidth: Math.floor(W * dpr), destHeight: Math.floor(H * dpr),
        fileType: 'png',
        success: (r: any) => resolve(r.tempFilePath),
        fail: (e: any) => reject(e),
      })
    })
    await saveImageToAlbum(tempFilePath)
  } catch (e) {
    console.error('export failed', e)
    uni.showToast({ title: '导出失败', icon: 'none' })
  } finally {
    uni.hideLoading()
    exporting.value = false
  }
}

onMounted(() => {
  nextTick(() => {
    setTimeout(() => {
      fetchCanvasNode().then(() => render())
    }, 50)
  })
})
</script>

<template>
  <view class="page">
    <view class="header">
      <view class="logo">
        <view class="logo-dot" style="background: #F77F00" />
        <view class="logo-dot" style="background: #E63946" />
        <view class="logo-dot" style="background: #2D6CDF" />
        <view class="logo-dot" style="background: #06A77D" />
      </view>
      <view class="title-wrap">
        <text class="title">拼豆智能助手</text>
        <text class="sub">图纸生成器 · 小程序版</text>
      </view>
      <view class="spacer" />
      <view class="badge">主导色提取 · MARD</view>
    </view>

    <view class="card canvas-card">
      <Toolbar @picked="onPicked" @viewOrig="showOrig = true" @export="onExport" />
      <ProgressStrip />

      <view class="canvas-scroll">
        <image
          v-if="patternImageSrc"
          :src="patternImageSrc"
          mode="aspectFit"
          class="pattern-image"
          @tap="onCanvasTap"
        />
        <canvas
          :id="canvasId"
          type="2d"
          class="pattern-canvas"
        />
        <view v-if="!store.srcData && !patternImageSrc" class="pick-prompt">
          <text class="big">选择一张图片开始</text>
          <text class="small">点击上方「选择图片」</text>
        </view>
      </view>

      <view class="footnote">
        主导色像素化 + 291 色最近欧氏映射 + 每豆 MARD 真实色号 + 每 10 格分区。
      </view>
    </view>

    <StatsPanel />

    <OrigModal :show="showOrig" :src="store.origTempFilePath" @close="showOrig = false" />

    <canvas :id="exportCanvasId" type="2d" class="export-canvas" />
  </view>
</template>

<style lang="scss" scoped>
.page {
  min-height: 100vh;
  padding: 14px clamp(12px, 3vw, 32px) 24px;
  box-sizing: border-box;
}
.header {
  display: flex;
  align-items: center;
  gap: 14px;
  flex-wrap: wrap;
  margin-bottom: 12px;
}
.logo {
  display: flex;
  gap: 5px;
}
.logo-dot {
  width: 16px;
  height: 16px;
  border-radius: 4px;
  border: 2px solid $ink;
  box-shadow: 1.5px 1.5px 0 $ink;
}
.title-wrap {
  display: flex;
  flex-direction: column;
}
.title {
  font-size: 22px;
  font-weight: 700;
  letter-spacing: 0.5px;
}
.sub {
  font-size: 12px;
  color: $ink-soft;
  font-weight: 700;
  margin-top: 2px;
}
.spacer {
  flex: 1;
}
.badge {
  font-weight: 600;
  font-size: 11px;
  padding: 5px 11px;
  background: $ink;
  color: #fff;
  border-radius: 30px;
  box-shadow: $shadow-sm;
}
.card {
  background: $surface;
  border: $border;
  border-radius: $radius;
  box-shadow: $shadow;
}
.canvas-card {
  padding: 12px;
  margin-bottom: 14px;
}
.canvas-scroll {
  background: radial-gradient(circle, rgba(35, 32, 46, 0.1) 1.1px, transparent 1.6px) 0 0 / 14px 14px,
    $bg-2;
  border: $border;
  border-radius: 12px;
  height: 500rpx;
  padding: 12px;
  position: relative;
  box-sizing: border-box;
}
.pattern-canvas {
  /* canvas 只用于离屏画图，导出 PNG 给 .pattern-image 显示 */
  position: fixed;
  left: -9999px;
  top: 0;
  width: 10px;
  height: 10px;
  pointer-events: none;
}
.pattern-image {
  width: 100%;
  height: 100%;
  background: $bg-2;
  border: $border;
  border-radius: 6px;
  box-sizing: border-box;
}
.pick-prompt {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
  text-align: center;
  color: $ink-soft;
  font-weight: 700;
  pointer-events: none;
  .big {
    font-size: 20px;
    color: $ink;
    font-weight: 700;
  }
  .small {
    font-size: 12.5px;
  }
}
.footnote {
  margin-top: 8px;
  font-size: 11.5px;
  color: $ink-soft;
  font-weight: 600;
  line-height: 1.6;
}
.export-canvas {
  position: fixed;
  left: -9999px;
  top: 0;
  width: 10px;
  height: 10px;
  pointer-events: none;
}
</style>
