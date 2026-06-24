<script setup lang="ts">
import { ref, computed, watch, getCurrentInstance, onMounted, nextTick } from 'vue'
import { usePatternStore } from '@/stores/pattern'
import { drawGrid, drawProgressOverlay, drawComposed } from '@/utils/canvasDraw'
import { saveImageToAlbum } from '@/utils/permissions'
import { pickAndDecodeImage } from '@/composables/useImageDecode'
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
// image 元素 ref，tap 时拿 boundingClientRect（e.currentTarget 在 uni-app H5 下可能指向 canvas）
const imageRef = ref<any>(null)

// canvas-scroll 的 aspect-ratio = grid 比例（cols:rows），同时设 CSS 变量给 max-width 用
// 画布区用 flex 撑满高度，不再用 aspect-ratio（像素图按比例居中，米黄底填满整块）
const canvasScrollStyle = computed(() => '')

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

// 拿 canvas node + dpr（canvas-scroll 尺寸每次 render 动态拿，因为 aspect-ratio 会变）
function fetchCanvasNode(): Promise<void> {
  return new Promise((resolve) => {
    // #ifdef H5
    // H5：uni <canvas type="2d"> 的原生 getContext 绘制坏（fillStyle 切换不生效，
    // 实测画 4 色读回全红）。改用 document.createElement 的纯原生 canvas，
    // 挂到 canvas-scroll 上，原生 2d context 绘制正常且直接显示。
    const container = document.querySelector('.canvas-scroll')
    if (container) {
      let c = container.querySelector('canvas.native-canvas') as HTMLCanvasElement | null
      if (!c) {
        c = document.createElement('canvas')
        c.className = 'native-canvas'
        container.appendChild(c)
      }
      canvasNode = c
      canvasDpr = window.devicePixelRatio || 1
    }
    resolve()
    // #endif
    // #ifndef H5
    uni.createSelectorQuery()
      .in(instance)
      .select('#' + canvasId)
      .fields({ node: true } as any, (res: any) => {
        if (res && res.node) {
          canvasNode = res.node
          canvasDpr = uni.getSystemInfoSync().pixelRatio
        }
        resolve()
      })
      .exec()
    // #endif
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

  // 拿 image 的 boundingClientRect（= canvas buffer 应该的尺寸，和外框边缘对齐）
  // 第一次 render 时 image 可能还没显示（patternImageSrc 空），fallback 到 canvas-scroll 内容区
  uni.createSelectorQuery()
    .in(instance)
    .select('.pattern-image')
    .boundingClientRect((imgRect: any) => {
      if (imgRect && imgRect.width > 0 && imgRect.height > 0) {
        drawPattern(imgRect.width, imgRect.height)
        return
      }
      // image 没显示，用 canvas-scroll 内容区（减 border）
      uni.createSelectorQuery()
        .in(instance)
        .select('.canvas-scroll')
        .boundingClientRect((scrollRect: any) => {
          if (!scrollRect) return
          // scrollRect 是外框尺寸（含 border 3px），内容区 = 外框 - 2*border
          drawPattern(scrollRect.width - 6, scrollRect.height - 6)
        })
        .exec()
    })
    .exec()
}

function drawPattern(cw: number, ch: number): void {
  if (!canvasNode || !store.srcData) return
  const canvas = canvasNode
  const dpr = canvasDpr

  // grid 尺寸（可能小于 buffer，居中绘制）
  const bp = fitBp(cw, ch)
  const M = store.showZones ? Math.round(bp * 1.7) : 0
  const W = store.cols * bp + 2 * M
  const H = store.rows * bp + 2 * M

  canvas.width = Math.floor(cw * dpr)
  canvas.height = Math.floor(ch * dpr)
  const ctx = canvas.getContext('2d') as CanvasRenderingContext2D
  ctx.setTransform(1, 0, 0, 1, 0, 0)
  ctx.scale(dpr, dpr)
  ctx.clearRect(0, 0, cw, ch)
  // 米黄底占满整块画布，消除两侧留白；像素图居中画在其上
  ctx.fillStyle = '#ECE4D2'
  ctx.fillRect(0, 0, cw, ch)

  // 居中画 grid
  const ox = Math.floor((cw - W) / 2)
  const oy = Math.floor((ch - H) / 2)
  ctx.translate(Math.max(0, ox), Math.max(0, oy))

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

  // #ifndef H5
  // MP：canvas 离屏，导出整张 buffer PNG 给 <image> 显示（绕过 canvas 显示层 bug）
  if (typeof canvas.toTempFilePath === 'function') {
    canvas.toTempFilePath({
      x: 0,
      y: 0,
      width: canvas.width,
      height: canvas.height,
      destWidth: canvas.width,
      destHeight: canvas.height,
      fileType: 'png',
      success: (r: any) => { patternImageSrc.value = r.tempFilePath },
      fail: (e: any) => { console.error('[render] toTempFilePath failed', e) },
    })
  }
  // #endif
  // H5：原生 canvas 直接显示，无需导出

  dumpCanvasStats(canvas, ctx, cw, ch)
}

async function pickImage(): Promise<void> {
  try {
    const picked = await pickAndDecodeImage()
    if (picked) {
      store.ingest(picked)
      nextTick(() => render())
    }
  } catch (e) {
    console.error('pick image failed', e)
    uni.showToast({ title: '图片加载失败', icon: 'none' })
  }
}

function onCanvasTap(e: any): void {
  // 无图 / 视图模式：点击画布 = 选择图片
  if (!store.srcData || store.mode === 'view') {
    pickImage()
    return
  }
  // 进度模式：点击 = 标记/取消已拼
  const rawX = e.detail?.x ?? e.clientX ?? e.touches?.[0]?.clientX ?? e.changedTouches?.[0]?.clientX
  const rawY = e.detail?.y ?? e.clientY ?? e.touches?.[0]?.clientY ?? e.changedTouches?.[0]?.clientY
  if (rawX == null || rawY == null) return
  // 用 canvas-scroll 的 rect 做坐标映射（H5 原生 canvas / MP image 都填满它）
  uni.createSelectorQuery()
    .in(instance)
    .select('.canvas-scroll')
    .boundingClientRect((rect: any) => {
      if (!rect) return
      const border = 3
      const cw = rect.width - 2 * border
      const ch = rect.height - 2 * border
      const x = rawX - rect.left - border
      const y = rawY - rect.top - border
      const bp = fitBp(cw, ch)
      const M = store.showZones ? Math.round(bp * 1.7) : 0
      const W = store.cols * bp + 2 * M
      const H = store.rows * bp + 2 * M
      const ox = Math.floor((cw - W) / 2)
      const oy = Math.floor((ch - H) / 2)
      const c = Math.floor((x - ox - M) / bp)
      const r = Math.floor((y - oy - M) / bp)
      if (r < 0 || r >= store.rows || c < 0 || c >= store.cols) return
      store.togglePlaced(r, c)
      nextTick(() => render())
    })
    .exec()
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

    // H5 vs mp-weixin：mp 用 canvas.toTempFilePath + saveImageToPhotosAlbum；
    // H5 用 canvas.toDataURL + <a download> 触发浏览器下载
    if (typeof canvas.toTempFilePath === 'function') {
      const tempFilePath: string = await new Promise((resolve, reject) => {
        canvas.toTempFilePath({
          x: 0,
          y: 0,
          width: canvas.width,
          height: canvas.height,
          destWidth: canvas.width,
          destHeight: canvas.height,
          fileType: 'png',
          success: (r: any) => resolve(r.tempFilePath),
          fail: (e: any) => reject(e),
        })
      })
      await saveImageToAlbum(tempFilePath)
    } else {
      // H5：toDataURL + <a download>
      const dataUrl = canvas.toDataURL('image/png')
      const a = document.createElement('a')
      a.href = dataUrl
      a.download = `pindou-pattern-${store.cols}x${store.rows}-${store.brand}.png`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      uni.showToast({ title: '已下载', icon: 'success' })
    }
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

// watch UI 状态变化触发 render（primitive sources，不 deep walk typed array）
watch(() => store.mode, () => nextTick(() => render()))
watch(() => store.size, () => nextTick(() => render()))
watch(() => store.zoom, () => nextTick(() => render()))
watch(() => store.showZones, () => nextTick(() => render()))
watch(() => store.showCodes, () => nextTick(() => render()))
watch(() => store.guide, () => nextTick(() => render()))
// placed 用 shallowRef + triggerRef，watch 引用变化（triggerRef 触发）
watch(() => store.placed, () => {
  if (store.mode === 'track') nextTick(() => render())
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

    <view class="layout">
      <view class="card canvas-card">
        <ProgressStrip />

        <view class="canvas-scroll" :style="canvasScrollStyle" @tap="onCanvasTap">
          <!-- #ifndef H5 -->
          <image
            v-if="patternImageSrc"
            ref="imageRef"
            :src="patternImageSrc"
            mode="scaleToFill"
            class="pattern-image"
          />
          <canvas :id="canvasId" type="2d" class="pattern-canvas" />
          <!-- #endif -->
          <view v-if="!store.srcData && !patternImageSrc" class="pick-prompt">
            <text class="big">点击此处选择图片</text>
            <text class="small">上传照片或已有图纸</text>
          </view>
        </view>

        <view class="footnote">
          主导色像素化 + 291 色最近欧氏映射 + 每豆 MARD 真实色号 + 每 10 格分区。
        </view>
      </view>

      <view class="sidebar">
        <Toolbar @viewOrig="showOrig = true" @export="onExport" />
        <StatsPanel />
      </view>
    </view>

    <OrigModal :show="showOrig" :src="store.origTempFilePath" @close="showOrig = false" />

    <canvas :id="exportCanvasId" type="2d" class="export-canvas" />
  </view>
</template>

<style lang="scss" scoped>
.page {
  min-height: 100vh;
  padding: 14px clamp(12px, 3vw, 32px) 24px;
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
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
  display: flex;
  flex-direction: column;
}
.layout {
  display: flex;
  flex-direction: column;
  gap: 14px;
  flex: 1 1 auto;
  min-height: 0;
}
.sidebar {
  display: flex;
  flex-direction: column;
  gap: 14px;
}
@media (min-width: 900px) {
  .layout { flex-direction: row; }
  .canvas-card { flex: 1 1 auto; min-width: 0; }
  .sidebar { flex: 0 0 300px; width: 300px; }
  .sidebar :deep(.toolbar) { flex-direction: column; align-items: stretch; padding: 0; }
  .sidebar :deep(.zoom-slider) { width: 100%; }
  .sidebar :deep(.actions) { flex-direction: column; align-items: stretch; }
  .sidebar :deep(.btn) { justify-content: center; }
}
.canvas-scroll {
  background: radial-gradient(circle, rgba(35, 32, 46, 0.1) 1.1px, transparent 1.6px) 0 0 / 14px 14px,
    $bg-2;
  border: $border;
  border-radius: 12px;
  /* 占满卡片宽度；inline style 设 aspect-ratio 让比例匹配 grid */
  width: 100%;
  margin: 0 auto;
  flex: 1 1 auto;
  min-height: 200px;
  position: relative;
  box-sizing: border-box;
  overflow: hidden;
}
.pattern-canvas {
  position: fixed;
  left: -9999px;
  top: 0;
  width: 10px;
  height: 10px;
  pointer-events: none;
}
.pattern-image {
  display: block;
  width: 100%;
  height: 100%;
  /* 强制拉伸到容器尺寸，不用 natural size（否则会撑开 canvas-scroll 破坏 aspect-ratio） */
  object-fit: fill;
  box-sizing: border-box;
}
/* #ifdef H5 */
/* H5 原生 canvas（document.createElement 挂入），直接显示 */
.native-canvas {
  display: block;
  width: 100%;
  height: 100%;
  box-sizing: border-box;
}
/* #endif */
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
