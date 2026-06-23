<script setup lang="ts">
import { ref, watch, getCurrentInstance, onMounted, nextTick } from 'vue'

declare const wx: any
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

// canvas CSS 尺寸：通过 Vue 绑定到 WXML style 属性。变化后需等 Vue 重新渲染。
const canvasCssW = ref(10)
const canvasCssH = ref(10)
const showOrig = ref(false)
const exporting = ref(false)

// 调试用：把所有诊断日志同步写到一个全局数组，方便 automator 读取
;(globalThis as any).__pindouLogs = (globalThis as any).__pindouLogs || []
const _t0 = Date.now()
function _log(tag: string, ...args: any[]) {
  const dt = ((Date.now() - _t0) / 1000).toFixed(2) + 's'
  const line = `[${dt}][${tag}] ${args.map((a) => (typeof a === 'object' ? JSON.stringify(a) : String(a))).join(' ')}`
  ;(globalThis as any).__pindouLogs.push(line)
  try { (wx as any).setStorageSync('__pindou_logs', (globalThis as any).__pindouLogs) } catch (e) {}
  console.log(line)
}
;(globalThis as any).__pindouDump = () => (globalThis as any).__pindouLogs.slice()

// 计算 bp（每豆像素大小）
function fitBp(scrollW: number, scrollH: number): number {
  const W = Math.max(120, scrollW - 28)
  const H = Math.max(120, scrollH - 28)
  const zM = store.showZones ? 3.4 : 0
  return Math.max(
    6,
    Math.min(
      48,
      Math.floor(Math.min(W / (store.cols + zM), H / (store.rows + zM)) * store.zoom)
    )
  )
}

// 拿到 canvas node + 它当前实际的 CSS 尺寸
function getCanvasNodeAndSize(
  selector: string
): Promise<{ canvas: any; ctx: CanvasRenderingContext2D; dpr: number; cssW: number; cssH: number }> {
  return new Promise((resolve, reject) => {
    let done = false
    const finish = (val: any, err?: string) => {
      if (done) return
      done = true
      if (err) reject(new Error(err))
      else resolve(val)
    }
    setTimeout(() => finish(null, 'canvas query TIMEOUT ' + selector), 3000)
    try {
      ;(wx as any)
        .createSelectorQuery()
        .select(selector)
        .fields({ node: true, size: true, rect: true }, (res: any) => {
          _log('canvasNode', 'callback for', selector, res ? 'ok' : 'null')
          if (!res || !res.node) {
            finish(null, 'canvas node not found: ' + selector)
            return
          }
          const canvas = res.node
          const ctx = canvas.getContext('2d')
          const dpr = (wx as any).getSystemInfoSync().pixelRatio
          finish({ canvas, ctx, dpr, cssW: res.width, cssH: res.height })
        })
        .exec()
    } catch (e) {
      finish(null, 'canvas query exception: ' + (e as Error)?.message)
    }
  })
}

// 用硬编码尺寸（彻底跳过 wx API 测试）
function queryScrollSize(): Promise<{ w: number; h: number }> {
  _log('queryScrollSize', 'using literal hardcoded size')
  return Promise.resolve({ w: 320, h: 400 })
}

// 缓存 canvas node，避免每次 render 都调 selectorQuery
let canvasHandle: { canvas: any; ctx: CanvasRenderingContext2D; dpr: number } | null = null

function fetchAndCacheCanvas(): Promise<void> {
  return new Promise((resolve) => {
    ;(wx as any)
      .createSelectorQuery()
      .select('#' + canvasId)
      .fields({ node: true, size: true }, (res: any) => {
        _log('canvasCache', 'callback', res ? JSON.stringify({ w: res.width, h: res.height, hasNode: !!res.node }) : 'null')
        if (res && res.node) {
          canvasHandle = {
            canvas: res.node,
            ctx: res.node.getContext('2d'),
            dpr: (wx as any).getSystemInfoSync().pixelRatio,
          }
          _log('canvasCache', 'cached, dpr=' + canvasHandle.dpr + ' cssW=' + res.width + ' cssH=' + res.height)
        }
        resolve()
      })
      .exec()
  })
}

function onPicked(): void {
  _log('page', 'onPicked handler')
  render()
}

function render(): void {
  _log('render', 'start srcData?', !!store.srcData, 'rows/cols', store.rows, store.cols)
  if (!store.srcData || store.rows === 0 || store.cols === 0) {
    _log('render', 'skip — no image yet')
    return
  }
  if (!canvasHandle) {
    _log('render', 'canvasHandle not ready, fetching...')
    fetchAndCacheCanvas().then(() => render())
    return
  }

  const scrollW = 320
  const scrollH = 400
  const bp = fitBp(scrollW, scrollH)
  const M = store.showZones ? Math.round(bp * 1.7) : 0
  const W = store.cols * bp + 2 * M
  const H = store.rows * bp + 2 * M
  _log('render', 'bp=' + bp + ' W=' + W + ' H=' + H)

  const CANVAS_W = 320
  const CANVAS_H = 320

  try {
    const { canvas, ctx, dpr } = canvasHandle
    canvas.width = Math.floor(CANVAS_W * dpr)
    canvas.height = Math.floor(CANVAS_H * dpr)
    ctx.setTransform(1, 0, 0, 1, 0, 0)
    ctx.scale(dpr, dpr)
    ctx.clearRect(0, 0, CANVAS_W, CANVAS_H)

    const ox = Math.floor((CANVAS_W - W) / 2)
    const oy = Math.floor((CANVAS_H - H) / 2)
    ctx.translate(Math.max(0, ox), Math.max(0, oy))

    drawGrid(ctx, store.hexGrid, store.rows, store.cols, bp, store.showCodes, store.showZones, store.brand)
    _log('render', 'grid drawn')
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
  } catch (e) {
    _log('render', 'FAILED', (e as Error)?.message)
  }
}

function onCanvasTap(e: any): void {
  if (store.mode !== 'track' || !store.srcData) return
  const x = e.detail?.x ?? e.touches?.[0]?.x ?? e.changedTouches?.[0]?.x
  const y = e.detail?.y ?? e.touches?.[0]?.y ?? e.changedTouches?.[0]?.y
  if (x == null || y == null) return
  const M = store.showZones ? Math.round(20 * 1.7) : 0
  const bp = 20 // 粗略反推，仅供 cell 定位（实际 bp 会重算，但 tap 精度要求低）
  // 更准确：用当前 canvasCssW 除以 cols
  const actualBp = store.cols > 0 ? (canvasCssW.value - 2 * M) / store.cols : bp
  const c = Math.floor((x - M) / actualBp)
  const r = Math.floor((y - M) / actualBp)
  if (r < 0 || r >= store.rows || c < 0 || c >= store.cols) return
  store.togglePlaced(r, c)
}

async function onExport(): Promise<void> {
  if (exporting.value || !store.srcData) return
  exporting.value = true
  uni.showLoading({ title: '导出中…', mask: true })
  try {
    const handle = await getCanvasNodeAndSize('#' + exportCanvasId)
    const { canvas, ctx, dpr } = handle
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

    canvas.width = Math.floor(W * dpr)
    canvas.height = Math.floor(H * dpr)
    // export canvas 的 CSS 尺寸不重要（屏幕外），直接用 W×H 让 ctx 坐标系对齐
    ctx.setTransform(1, 0, 0, 1, 0, 0)
    ctx.scale(dpr, dpr)
    ctx.clearRect(0, 0, W, H)
    drawComposed(ctx, store.hexGrid, store.rows, store.cols, store.sortedItems, store.brand, bp)

    const { tempFilePath } = (await new Promise((resolve, reject) => {
      ;(canvas as any).toTempFilePath({
        x: 0,
        y: 0,
        width: W,
        height: H,
        destWidth: Math.floor(W * dpr),
        destHeight: Math.floor(H * dpr),
        fileType: 'png',
        success: (r: any) => resolve(r),
        fail: (err: any) => reject(err),
      })
    })) as any

    await saveImageToAlbum(tempFilePath)
  } catch (e) {
    console.error('export failed', e)
    uni.showToast({ title: '导出失败', icon: 'none' })
  } finally {
    uni.hideLoading()
    exporting.value = false
  }
}

const renderDebounced = (() => {
  let t: any = null
  return () => {
    _log('renderDebounced', 'scheduled')
    if (t) clearTimeout(t)
    t = setTimeout(() => {
      t = null
      _log('renderDebounced', 'firing')
      render()
    }, 30)
  }
})()

onMounted(() => {
  nextTick(() => {
    setTimeout(() => {
      _log('mount', 'onMounted timeout fired, fetching canvas')
      fetchAndCacheCanvas().then(() => {
        _log('mount', 'canvas cached, calling render')
        render()
      })
    }, 50)
  })
  // 诊断入口 V2：逐步增加复杂度，找出哪一步卡死
  ;(globalThis as any).__pindouTestIngest = async (wxPath: string) => {
    const g = globalThis as any
    g.__pindouLogs = g.__pindouLogs || []
    const t0 = Date.now()
    const pushLog = (tag: string, ...args: any[]) => {
      const line = `[${((Date.now() - t0) / 1000).toFixed(2)}s][${tag}] ${args.join(' ')}`
      g.__pindouLogs.push(line)
      try { (wx as any).setStorageSync('__pindou_logs', g.__pindouLogs) } catch {}
      console.log(line)
    }
    pushLog('ingest', 'START', wxPath)

    // 测试 1：只调 showToast
    pushLog('ingest', 'before showToast')
    uni.showToast({ title: 't1', icon: 'none', duration: 500 })
    pushLog('ingest', 'after showToast')

    // 测试 2：只调 createOffscreenCanvas
    pushLog('ingest', 'before createOffscreenCanvas')
    const off = (wx as any).createOffscreenCanvas({ type: '2d', width: 2048, height: 2048 })
    pushLog('ingest', 'after createOffscreenCanvas')

    // 测试 3：createImage
    pushLog('ingest', 'before createImage')
    const img = off.createImage()
    pushLog('ingest', 'after createImage')

    // 测试 4：await img load
    pushLog('ingest', 'before await img load')
    await new Promise<void>((resolve, reject) => {
      img.onload = () => { pushLog('ingest', 'img onload'); resolve() }
      img.onerror = (e: any) => { pushLog('ingest', 'img onerror', JSON.stringify(e)); reject(e) }
      setTimeout(() => { pushLog('ingest', 'img load TIMEOUT'); reject(new Error('timeout')) }, 5000)
      img.src = wxPath
    })
    pushLog('ingest', 'after img load', img.width, 'x', img.height)

    // 测试 5：drawImage + getImageData
    pushLog('ingest', 'before drawImage')
    const ctx = off.getContext('2d')
    ctx.drawImage(img, 0, 0, img.width, img.height)
    pushLog('ingest', 'after drawImage, before getImageData')
    const { data } = ctx.getImageData(0, 0, img.width, img.height)
    pushLog('ingest', 'after getImageData', data.length)

    // 测试 6：store.ingest
    pushLog('ingest', 'before store.ingest')
    store.ingest({
      tempFilePath: wxPath,
      pixels: { data: new Uint8ClampedArray(data), width: img.width, height: img.height },
    })
    pushLog('ingest', 'after store.ingest, rows=' + store.rows + ' cols=' + store.cols)

    // 测试 7：render
    pushLog('ingest', 'before render')
    await render()
    pushLog('ingest', 'DONE after render')
  }
  // 极简测试：看 async 函数调用是否本身有问题
  ;(globalThis as any).__pindouAsyncTest = async (msg: string) => {
    console.log('[async-test] entry', msg)
    ;(globalThis as any).__pindouAsyncTestLog = ['entry', msg]
    await new Promise((r: any) => setTimeout(r, 100))
    console.log('[async-test] after await', msg)
    ;(globalThis as any).__pindouAsyncTestLog.push('after-await')
    return 'ok:' + msg
  }
})

// 完全不用 watch。事件驱动：Toolbar emit 'picked' → page.render()
// 其他 UI 状态（mode/size/zoom/etc）也通过事件 emit 触发 render
// 避免 Vue watch 在 mp-weixin 上的潜在问题
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
        <canvas
          :id="canvasId"
          type="2d"
          class="pattern-canvas"
          @tap="onCanvasTap"
          @touchstart="onCanvasTap"
        />
        <view v-if="!store.srcData" class="pick-prompt">
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
  min-height: 54vh;
  max-height: 72vh;
  padding: 12px;
  position: relative;
  box-sizing: border-box;
}
.pattern-canvas-wrap {
  text-align: center;
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
.pattern-canvas {
  display: block;
  margin: 0 auto;
  width: 320px;
  height: 320px;
  flex: none;
  box-shadow: $shadow;
  border: $border;
  border-radius: 6px;
  background: $bg-2;
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
