<script setup lang="ts">
import { ref, computed, watch, getCurrentInstance, onMounted, nextTick } from 'vue'
import { usePatternStore } from '@/stores/pattern'
import { BRAND_CODES } from '@/utils/palette'
import type { Brand } from '@/types/pattern'

const BRANDS: Brand[] = ['MARD', 'COCO', '漫漫', '盼盼', '咪小窝']
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

// canvas-scroll 用 aspect-ratio 让宽高比 = grid 比例（cols:rows）；
// max-height + 对应的 max-width 保证宽屏下 canvas-scroll 是正方形（grid 填满，无两侧留白）
// canvas-card 本身保持 grid 比例（接近正方形），canvas-scroll 占满 canvas-card
// canvas-card 靠 flex 撑满 layout 剩余宽度，跟随浏览器宽度变宽/变窄（不再用 aspect-ratio 锁宽）
// 格子仍保持正方形：bp=min(W/cols,H/rows)，grid 居中绘制，米黄底填满整个 canvas-card
const canvasCardStyle = computed(() => '')
const canvasScrollStyle = computed(() => '')

// 视图状态：pan 偏移（CSS px，相对 canvas 左上）+ zoom 倍数
// zoom > 1 时 grid 比 canvas 大，超出的部分被 overflow:hidden 裁掉，用户拖动 pan 查看不同区域
const panX = ref(0)
const panY = ref(0)

// cells 必须是正方形（拼豆实际就是方格）。bp = min(canvasW/cols, canvasH/rows) * zoom
// canvas 比例和 grid 不一致时，grid 居中绘制，两侧露出 canvas-card 米色背景（无小框感）
function fitBp(canvasCssW: number, canvasCssH: number): { bpX: number; bpY: number } {
  const zM = store.showZones ? 3.4 : 0
  const base = Math.min(canvasCssW / (store.cols + zM), canvasCssH / (store.rows + zM))
  const bp = Math.max(3, base * store.zoom)
  return { bpX: bp, bpY: bp }
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

  // grid 尺寸（拉伸填满 canvas，可能非正方形 cells）
  const { bpX, bpY } = fitBp(cw, ch)
  const Mx = store.showZones ? Math.round(bpX * 1.7) : 0
  const My = store.showZones ? Math.round(bpY * 1.7) : 0
  const W = store.cols * bpX + 2 * Mx
  const H = store.rows * bpY + 2 * My

  canvas.width = Math.floor(cw * dpr)
  canvas.height = Math.floor(ch * dpr)
  const ctx = canvas.getContext('2d') as CanvasRenderingContext2D
  ctx.setTransform(1, 0, 0, 1, 0, 0)
  ctx.scale(dpr, dpr)
  ctx.clearRect(0, 0, cw, ch)
  // 米黄底占满整块画布
  ctx.fillStyle = '#ECE4D2'
  ctx.fillRect(0, 0, cw, ch)

  // 居中 + pan 偏移
  const ox = Math.floor((cw - W) / 2) + panX.value
  const oy = Math.floor((ch - H) / 2) + panY.value
  ctx.translate(ox, oy)

  drawGrid(ctx, store.hexGrid, store.rows, store.cols, bpX, bpY, store.showCodes, store.showZones, store.brand)

  if (store.mode === 'track') {
    drawProgressOverlay(
      ctx,
      store.placed,
      store.rows,
      store.cols,
      bpX,
      bpY,
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
  // #ifdef H5
  // 刚拖完，忽略这次 click（mouseup 会触发 click），避免 drag 末尾误触
  if (justDragged) {
    justDragged = false
    return
  }
  // #endif
  // 选图入口已移到工具栏按钮，canvas-scroll 点击只在进度模式下标记格子
  if (!store.srcData || store.mode !== 'track') return
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
      const cw = rect.width
      const ch = rect.height
      const x = rawX - rect.left
      const y = rawY - rect.top
      const { bpX, bpY } = fitBp(cw, ch)
      const Mx = store.showZones ? Math.round(bpX * 1.7) : 0
      const My = store.showZones ? Math.round(bpY * 1.7) : 0
      const W = store.cols * bpX + 2 * Mx
      const H = store.rows * bpY + 2 * My
      const ox = Math.floor((cw - W) / 2) + panX.value
      const oy = Math.floor((ch - H) / 2) + panY.value
      const c = Math.floor((x - ox - Mx) / bpX)
      const r = Math.floor((y - oy - My) / bpY)
      if (r < 0 || r >= store.rows || c < 0 || c >= store.cols) return
      store.togglePlaced(r, c)
      nextTick(() => render())
    })
    .exec()
}

// H5 专属：滚轮缩放 + 鼠标拖动 pan（mp-weixin 无鼠标事件，靠手势）
// #ifdef H5
let dragging = false
let justDragged = false  // 区分 drag 和 click：移动 > 3px 才算 drag，避免拖动完触发 pickImage
let dragStartX = 0
let dragStartY = 0
let dragStartPanX = 0
let dragStartPanY = 0

function onWheel(e: WheelEvent): void {
  if (!store.srcData) return
  const dy = e.deltaY || 0
  if (dy === 0) return
  const step = dy > 0 ? -0.1 : 0.1
  const next = Math.min(2.6, Math.max(0.5, +(store.zoom + step).toFixed(2)))
  if (next !== store.zoom) {
    store.setZoom(next)
  }
}

function onMouseDown(e: MouseEvent): void {
  if (!store.srcData) return
  // 只在 zoom > 1（grid 比 canvas 大）时才允许拖动；zoom <= 1 拖动会让像素图偏离中心
  if (store.zoom <= 1.01) return
  dragging = true
  justDragged = false
  dragStartX = e.clientX
  dragStartY = e.clientY
  dragStartPanX = panX.value
  dragStartPanY = panY.value
  e.preventDefault()
}

function onMouseMove(e: MouseEvent): void {
  if (!dragging) return
  const dx = e.clientX - dragStartX
  const dy = e.clientY - dragStartY
  if (Math.abs(dx) > 3 || Math.abs(dy) > 3) justDragged = true
  panX.value = dragStartPanX + dx
  panY.value = dragStartPanY + dy
  nextTick(() => render())
}

function onMouseUp(): void {
  if (dragging && justDragged) {
    // drag 结束后短暂屏蔽接下来的 click，避免触发 pickImage / togglePlaced
    setTimeout(() => { justDragged = false }, 150)
  }
  dragging = false
}
// #endif

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
  // #ifdef H5
  // navigationStyle:custom 不再设置 document.title，显式补上（否则浏览器标签显示 undefined）
  document.title = '拼豆智能助手'
  // uni-app @wheel 在 <view> 上不一定绑定成功，手动 addEventListener 确保 pan/zoom 生效
  setTimeout(() => {
    const el = document.querySelector('.canvas-scroll')
    if (!el) return
    el.addEventListener('wheel', onWheel as EventListener, { passive: false })
    el.addEventListener('mousedown', onMouseDown as EventListener)
    // mousemove/up 绑 window，拖出元素也能继续拖
    window.addEventListener('mousemove', onMouseMove as EventListener)
    window.addEventListener('mouseup', onMouseUp as EventListener)
  }, 100)
  // #endif
})

// watch UI 状态变化触发 render（primitive sources，不 deep walk typed array）
watch(() => store.mode, () => nextTick(() => render()))
watch(() => store.brand, () => nextTick(() => render()))
watch(() => store.size, () => { panX.value = 0; panY.value = 0; nextTick(() => render()) })
// zoom 回到 1 时自动归位 pan（避免像素图偏在一边）
watch(() => store.zoom, (z) => {
  if (z <= 1.01) { panX.value = 0; panY.value = 0 }
  nextTick(() => render())
})
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
      </view>
    </view>

    <view class="layout">
      <view class="card canvas-card" :style="canvasCardStyle">
        <ProgressStrip />

        <view
          class="canvas-scroll"
          :style="canvasScrollStyle"
          @tap="onCanvasTap"
          @wheel.prevent="onWheel"
          @mousedown="onMouseDown"
          @mousemove="onMouseMove"
          @mouseup="onMouseUp"
          @mouseleave="onMouseUp"
        >
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
            <text class="big">点右侧「选择图片」按钮</text>
            <text class="small">上传照片生成像素图</text>
          </view>
        </view>
      </view>

      <view class="sidebar">
        <view class="brand-tabs">
          <view
            v-for="b in BRANDS"
            :key="b"
            class="brand-tab"
            :class="{ active: store.brand === b }"
            @tap="store.setBrand(b)"
          >{{ b }}</view>
        </view>
        <Toolbar @viewOrig="showOrig = true" @export="onExport" @pick="pickImage" />
        <StatsPanel />
        <view class="card guide-card">
          <view class="group-title">使用说明</view>
          <view class="guide-list">
            <view class="guide-item"><text class="step">1</text>点底部「选择图片」上传</view>
            <view class="guide-item"><text class="step">2</text>切尺寸 29/50/80/100</view>
            <view class="guide-item"><text class="step">3</text>顶部切品牌色号体系</view>
            <view class="guide-item"><text class="step">4</text>开「分区」「色号」→ 照图拼</view>
            <view class="guide-item"><text class="step">5</text>「进度」模式点格子记录已拼</view>
            <view class="guide-item"><text class="step">6</text>滚轮缩放，按住拖动平移</view>
          </view>
        </view>
      </view>
    </view>

    <view class="legend-bottom" v-if="store.srcData">
      <view class="legend-bottom-title">色号 → 数量（{{ store.sortedItems.length }} 色）</view>
      <scroll-view scroll-x class="legend-scroll-x" show-scrollbar="false">
        <view class="legend-row">
          <view
            v-for="[hex, n] in store.sortedItems"
            :key="hex"
            class="bead-chip"
          >
            <view class="bead-swatch" :style="{ background: hex }" />
            <text class="bead-code">{{ BRAND_CODES[store.brand][hex] }}</text>
            <text class="bead-count">×{{ n }}</text>
          </view>
        </view>
      </scroll-view>
    </view>

    <OrigModal :show="showOrig" :src="store.origTempFilePath" @close="showOrig = false" />

    <canvas :id="exportCanvasId" type="2d" class="export-canvas" />
  </view>
</template>

<style lang="scss" scoped>
.page {
  height: 100vh;
  padding: 12px;
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  overflow: hidden;
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
.brand-tabs {
  display: flex;
  gap: 4px;
  padding: 4px;
  background: $bg-2;
  border: $border;
  border-radius: 12px;
  box-shadow: $shadow-sm;
  flex-wrap: wrap;
  width: 100%;
  box-sizing: border-box;
}
.brand-tab {
  flex: 1 1 0;
  text-align: center;
  font-weight: 600;
  font-size: 11px;
  padding: 6px 4px;
  border-radius: 9px;
  color: $ink-soft;
  white-space: nowrap;
  cursor: pointer;
  &.active {
    background: $ink;
    color: #fff;
  }
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
  background: $canvas-bg;
  flex: 0 1 auto;
  min-width: 0;
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
  /* sidebar 下移 canvas-card 的 border(3)+padding-top(12)=15px，让工具栏顶部与画布顶部齐平 */
  .sidebar { flex: 0 0 280px; width: 280px; padding-top: 15px; box-sizing: border-box; }
  .sidebar :deep(.toolbar) { flex-direction: column; align-items: stretch; padding: 0; gap: 12px; }
  .sidebar :deep(.tool-label) { margin-bottom: -6px; }
  .sidebar :deep(.mode-toggle),
  .sidebar :deep(.seg),
  .sidebar :deep(.actions),
  .sidebar :deep(.btn),
  .sidebar :deep(.zoom-slider) { width: 100%; box-sizing: border-box; }
  .sidebar :deep(.actions) { flex-direction: column; align-items: stretch; }
  .sidebar :deep(.btn) { justify-content: center; }
}
.legend-bottom {
  flex: 0 0 auto;
  background: $surface;
  border: $border;
  border-radius: $radius;
  box-shadow: $shadow;
  padding: 10px 14px;
  margin-top: 12px;
}
.legend-bottom-title {
  font-size: 12px;
  font-weight: 700;
  color: $ink-soft;
  text-transform: uppercase;
  letter-spacing: 0.6px;
  margin-bottom: 8px;
}
.legend-scroll-x {
  white-space: nowrap;
}
.legend-row {
  display: inline-flex;
  gap: 7px;
  padding-right: 4px;
}
.bead-chip {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 5px 9px;
  border: 2px solid $ink;
  border-radius: 9px;
  background: $surface;
  box-shadow: 1.5px 1.5px 0 $ink;
  flex: 0 0 auto;
}
.bead-swatch {
  width: 18px;
  height: 18px;
  border-radius: 4px;
  border: 1.5px solid $ink;
  flex: 0 0 auto;
}
.bead-code {
  font-weight: 700;
  font-size: 13px;
}
.bead-count {
  font-weight: 600;
  font-size: 12px;
  color: $ink-soft;
}
.guide-card {
  background: $surface;
  border: $border;
  border-radius: $radius;
  box-shadow: $shadow;
  padding: 14px;
}
.guide-card .group-title {
  font-size: 13px;
  font-weight: 600;
  color: $ink-soft;
  text-transform: uppercase;
  letter-spacing: 0.6px;
  margin: 0 0 9px;
  text-align: center;
}
.guide-list {
  display: flex;
  flex-direction: column;
  gap: 7px;
}
.guide-item {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  font-size: 12.5px;
  font-weight: 600;
  color: $ink;
  line-height: 1.45;
}
.guide-item .step {
  flex: 0 0 18px;
  width: 18px;
  height: 18px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: $orange;
  color: #fff;
  border-radius: 50%;
  font-size: 11px;
  font-weight: 700;
  margin-top: 1px;
}
.canvas-scroll {
  background: transparent;
  width: 100%;
  margin: 0 auto;
  flex: 1 1 auto;
  min-height: 120px;
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
.export-canvas {
  position: fixed;
  left: -9999px;
  top: 0;
  width: 10px;
  height: 10px;
  pointer-events: none;
}
</style>

<style>
/* 全局：禁止页面滚动，画布刚好占满一屏 */
html,
body,
#app {
  margin: 0;
  height: 100%;
  overflow: hidden;
}
</style>
