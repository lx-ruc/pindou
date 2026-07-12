<script setup lang="ts">
import { ref, computed, watch, getCurrentInstance, onMounted, onUnmounted, nextTick } from 'vue'
import { usePatternStore } from '@/stores/pattern'
import { BRAND_CODES } from '@/utils/palette'
import type { Brand } from '@/types/pattern'

const BRANDS: Brand[] = ['MARD', 'COCO', '漫漫', '盼盼', '咪小窝']
import { drawGrid, drawProgressOverlay, drawComposed } from '@/utils/canvasDraw'
import { saveImageToAlbum } from '@/utils/permissions'
import { chooseImageTemp, decodeImage } from '@/composables/useImageDecode'
import { UnsafeImageError } from '@/utils/cloud'
import { patternToHTML, patternToSVG } from '@/utils/exportHTML'
import Toolbar from '@/components/pattern/Toolbar.vue'
import ProgressStrip from '@/components/pattern/ProgressStrip.vue'
import StatsPanel from '@/components/pattern/StatsPanel.vue'
import OrigModal from '@/components/pattern/OrigModal.vue'
import { installPersist } from '@/utils/persist'

const store = usePatternStore()
const instance = getCurrentInstance()

const canvasId = 'patternCanvas'
const exportCanvasId = 'exportCanvas'
const showOrig = ref(false)

// 小程序自定义导航栏：留出状态栏 + 胶囊按钮高度；H5 端沿用 page 默认 12px padding
const navPadTop = ref(12)
// #ifdef MP-WEIXIN
;(function initNavPad() {
  try {
    const sys = uni.getSystemInfoSync()
    const sb = sys.statusBarHeight || 0
    const menu = (uni as any).getMenuButtonBoundingClientRect?.()
    if (menu && menu.height) {
      // 胶囊在 navbar 中垂直居中：navbar.bottom = menu.top + menu.bottom - statusBarHeight
      const navBarBottom = menu.top + menu.bottom - sb
      navPadTop.value = navBarBottom + 8
    } else {
      navPadTop.value = sb + 52
    }
  } catch {
    navPadTop.value = 64
  }
})()
// #endif

// mp-weixin 主屏只显示画布 + 两按钮 + 顶部品牌切换
const isMpWeixin = ref(false)
// #ifdef MP-WEIXIN
isMpWeixin.value = true
// #endif
const showBrandMenu = ref(false)
function selectBrand(b: Brand): void {
  store.setBrand(b)
  showBrandMenu.value = false
}
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
const canvasCardStyle = computed(() => isMpWeixin.value ? 'flex: 1 1 0; min-height: 0;' : '')
const canvasScrollStyle = computed(() => {
  // canvas-scroll / movable-area 保持 grid 比例，image scaleToFill 才不会拉伸变形
  if (!store.cols || !store.rows) return ''
  return `aspect-ratio: ${store.cols} / ${store.rows};`
})

// 有图纸可交互（原图在 或 已恢复历史图纸 ghost 态）；替代到处判 store.srcData
const hasPattern = computed(() => store.hexGrid.length > 0)
// ghost 态：已恢复历史图纸但原图未存（srcData=null），文案需要表达"重新上传图"
const ghost = computed(() => !store.srcData && store.hexGrid.length > 0)
// 尺寸显示：按图片宽高比换算成 cols×rows（拼豆板实际格子数）
// 尺寸显示：直接读 pixelize 实际产出的 rows×cols（长边在前），
// 不再从 size+aspect 在显示层重新算 —— 避免与图纸实际格子数差 1 格。
const sizeDisplay = computed(() => {
  if (!store.rows || !store.cols) return `${store.size}×${store.size}`
  const long = Math.max(store.rows, store.cols)
  const short = Math.min(store.rows, store.cols)
  return `${long}×${short}`
})

// 视图状态：pan 偏移（CSS px，相对 canvas 左上）+ zoom 倍数
// zoom > 1 时 grid 比 canvas 大，超出的部分被 overflow:hidden 裁掉，用户拖动 pan 查看不同区域
// panX/panY：H5 mouse 拖动用（MP 改用 movable-view，不靠 panX/panY 驱动 canvas）
const panX = ref(0)
const panY = ref(0)
// movable-view 数据切换（换图/调尺寸）时 movKey++ 重建复位（受控属性复位不可靠，改 key 重建）。
// 缩放/平移由 movable-view 原生管手势（图片式连续缩放），逻辑层不追踪 → 渲染层丝滑、不卡。
const movKey = ref(0)
// MP canvas 画"整张 grid"。buffer 长边动态：尽量接近 native 上限 4096（放大少糊），cell = buffer/长边。
// 注意：放大清晰度受「buffer 像素 vs 屏幕 dpr」物理限制 —— buffer 4096 + dpr 3 时放大约 3 倍内完全清晰，
// 更大倍数渐糊（8 倍无法完全清晰，除非交互后 canvas 按放大重画可见局部，另议）。
const MAX_BUF_EDGE = 4096
function mpCellSize(): number {
  const longer = Math.max(store.rows, store.cols) || 1
  return Math.max(8, MAX_BUF_EDGE / longer)
}

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
  console.log('[render] enter', {
    hasPattern: hasPattern.value,
    rows: store.rows,
    cols: store.cols,
    hasCanvasNode: !!canvasNode,
  })
  if (!hasPattern.value || store.rows === 0 || store.cols === 0) return
  // canvasNode 缺失（onMounted 时 canvas 还没就绪）→ 兜底重新 fetchCanvasNode 再 render
  if (!canvasNode) {
    console.warn('[render] canvasNode missing, refetching...')
    fetchCanvasNode().then(() => render())
    return
  }
  // 用 canvas-scroll（= movable-area / H5 view）尺寸作画布显示区。
  // 不再用 .pattern-image rect —— MP movable-view 会 pan/scale 让 image rect 漂移，不能作基准。
  uni.createSelectorQuery()
    .in(instance)
    .select('.canvas-scroll')
    .boundingClientRect((rect: any) => {
      if (!rect || rect.width === 0) {
        console.warn('[render] canvas-scroll rect missing')
        return
      }
      drawPattern(rect.width, rect.height)
    })
    .exec()
}

function drawPattern(cw: number, ch: number): void {
  if (!canvasNode || !hasPattern.value) return
  const canvas = canvasNode
  const ctx = canvas.getContext('2d') as CanvasRenderingContext2D

  if (isMpWeixin.value) {
    // MP 图片式：canvas 一次画整张 grid（mpCellSize 让长边≈4096），转 PNG 给 movable-view 双指连续缩放。
    // 放大靠 movable-view 缩放 image（不重画）—— buffer 内清晰、更大渐糊（用户已接受）。
    const cell = mpCellSize()
    const Mx = store.showZones ? Math.round(cell * 1.7) : 0
    const My = Mx
    const bufW = Math.floor(store.cols * cell + 2 * Mx)
    const bufH = Math.floor(store.rows * cell + 2 * My)
    canvas.width = bufW
    canvas.height = bufH
    ctx.setTransform(1, 0, 0, 1, 0, 0)
    ctx.clearRect(0, 0, bufW, bufH)
    ctx.fillStyle = '#ECE4D2'
    ctx.fillRect(0, 0, bufW, bufH)
    drawGrid(ctx, store.hexGrid, store.rows, store.cols, cell, cell, store.showCodes, store.showZones, store.brand)
    if (store.mode === 'track') {
      drawProgressOverlay(ctx, store.placed, store.rows, store.cols, cell, cell, store.showZones, store.guide, store.routeOrder, store.progress.nextIdx)
    }
    const exportOpts = {
      x: 0, y: 0, width: bufW, height: bufH, destWidth: bufW, destHeight: bufH, fileType: 'png' as const,
      success: (r: any) => { console.log('[render] export OK', r.tempFilePath, bufW + 'x' + bufH); patternImageSrc.value = r.tempFilePath },
      fail: (e: any) => { console.error('[render] export failed', e) },
    }
    if (typeof canvas.toTempFilePath === 'function') {
      canvas.toTempFilePath(exportOpts)
    } else {
      // @ts-ignore uni.canvasToTempFilePath 兼容老 API（部分版本 canvas node 没有 toTempFilePath）
      uni.canvasToTempFilePath({ ...exportOpts, canvas }, instance?.proxy)
    }
    dumpCanvasStats(canvas, ctx, bufW, bufH)
    return
  }

  // H5：canvas 按 zoom/pan 画，native-canvas 直接显示（无 toTempFilePath 开销，不卡）
  const dpr = canvasDpr
  const { bpX, bpY } = fitBp(cw, ch)
  const mx = store.showZones ? Math.round(bpX * 1.7) : 0
  const my = store.showZones ? Math.round(bpY * 1.7) : 0
  const W = store.cols * bpX + 2 * mx
  const H = store.rows * bpY + 2 * my
  canvas.width = Math.floor(cw * dpr)
  canvas.height = Math.floor(ch * dpr)
  if (canvas.style) {
    canvas.style.width = cw + 'px'
    canvas.style.height = ch + 'px'
  }
  ctx.setTransform(1, 0, 0, 1, 0, 0)
  ctx.scale(dpr, dpr)
  ctx.clearRect(0, 0, cw, ch)
  ctx.fillStyle = '#ECE4D2'
  ctx.fillRect(0, 0, cw, ch)
  const ox = Math.floor((cw - W) / 2) + panX.value
  const oy = Math.floor((ch - H) / 2) + panY.value
  ctx.translate(ox, oy)
  drawGrid(ctx, store.hexGrid, store.rows, store.cols, bpX, bpY, store.showCodes, store.showZones, store.brand)
  if (store.mode === 'track') {
    drawProgressOverlay(ctx, store.placed, store.rows, store.cols, bpX, bpY, store.showZones, store.guide, store.routeOrder, store.progress.nextIdx)
  }
  dumpCanvasStats(canvas, ctx, cw, ch)
}


async function pickImage(): Promise<void> {
  // ghost 态（已恢复历史图纸 + 有进度）下重新上传会清空进度，二次确认
  if (!store.srcData && store.placed.some((row) => row?.some(Boolean))) {
    const ok = await new Promise<boolean>((resolve) => {
      uni.showModal({
        title: '重新上传',
        content: '重新上传将清空当前拼豆进度，是否继续？',
        success: (res) => resolve(!!res.confirm),
        fail: () => resolve(false),
      })
    })
    if (!ok) return
  }
  // 1) 先选图。用户取消则旧像素图保持不动（不清画布、不 loading）。
  let tempFilePath: string
  try {
    const picked = await chooseImageTemp()
    if (!picked) return
    tempFilePath = picked
  } catch (e) {
    console.error('chooseImage failed', e)
    return
  }
  // 2) 选图成功：立即清掉旧像素图（否则用户会误以为换图没生效）+ 提示生成中。
  //    安全检测 + 解码有几秒耗时，期间画布空白 + loading。
  patternImageSrc.value = ''
  movKey.value++  // 换图 → 复位 movable-view（从整图 fit 重新看）
  uni.showLoading({ title: '正在生成新的像素图…', mask: true })
  // 3) 解码（含内容安全检测）
  try {
    const pixels = await decodeImage(tempFilePath)
    uni.hideLoading()
    store.ingest({ tempFilePath, pixels })
    // 兜底：onMounted 时 canvas 可能没就绪，选图后确保 canvasNode 有值
    if (!canvasNode) {
      console.warn('[pickImage] canvasNode missing, refetching before render')
      await fetchCanvasNode()
    }
    nextTick(() => render())
  } catch (e) {
    // hideLoading 必须在 showToast 之前，否则 loading 层会盖掉/关闭 toast
    uni.hideLoading()
    // 解码失败：恢复旧像素图（patternImageSrc 已清，但 store 里旧 hexGrid 还在，重画即可）
    if (store.hexGrid.length > 0) nextTick(() => render())
    if (e instanceof UnsafeImageError) {
      uni.showToast({ title: '该图片内容不合规，请更换', icon: 'none', duration: 2500 })
      return
    }
    console.error('pick image failed', e)
    uni.showToast({ title: '图片加载失败，请重试', icon: 'none' })
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
  // 选图入口已移到工具栏按钮，点击只在进度模式下标记格子
  if (!hasPattern.value || store.mode !== 'track') return
  const rawX = e.detail?.x ?? e.clientX ?? e.touches?.[0]?.clientX ?? e.changedTouches?.[0]?.clientX
  const rawY = e.detail?.y ?? e.clientY ?? e.touches?.[0]?.clientY ?? e.changedTouches?.[0]?.clientY
  if (rawX == null || rawY == null) return

  // 由 (fx, fy)（grid 内比例 0~1）+ grid 尺寸 + margin → cell (r,c)，命中则标记
  const hitCell = (fx: number, fy: number, gridW: number, gridH: number, cell: number, mx: number, my: number): void => {
    const c = Math.floor((fx * gridW - mx) / cell)
    const r = Math.floor((fy * gridH - my) / cell)
    if (r < 0 || r >= store.rows || c < 0 || c >= store.cols) return
    store.togglePlaced(r, c)
    nextTick(() => render())
  }

  if (isMpWeixin.value) {
    // MP 图片式：image = 整张 grid，movable-view 缩放/平移。imgRect 已含变换 → fx/fy 直接乘 cols/rows。
    uni.createSelectorQuery()
      .in(instance)
      .select('.pattern-image')
      .boundingClientRect((imgRect: any) => {
        if (!imgRect || imgRect.width === 0) return
        const fx = (rawX - imgRect.left) / imgRect.width
        const fy = (rawY - imgRect.top) / imgRect.height
        if (fx < 0 || fx > 1 || fy < 0 || fy > 1) return
        // 整图 fx/fy → grid 坐标（忽略 zone margin 小误差）
        const gc = Math.floor(fx * store.cols)
        const gr = Math.floor(fy * store.rows)
        if (gr < 0 || gr >= store.rows || gc < 0 || gc >= store.cols) return
        store.togglePlaced(gr, gc)
        nextTick(() => render())
      })
      .exec()
  } else {
    // H5：canvas-scroll rect + fitBp + panX 映射
    uni.createSelectorQuery()
      .in(instance)
      .select('.canvas-scroll')
      .boundingClientRect((rect: any) => {
        if (!rect) return
        const x = rawX - rect.left
        const y = rawY - rect.top
        const { bpX, bpY } = fitBp(rect.width, rect.height)
        const Mx = store.showZones ? Math.round(bpX * 1.7) : 0
        const My = store.showZones ? Math.round(bpY * 1.7) : 0
        const W = store.cols * bpX + 2 * Mx
        const H = store.rows * bpY + 2 * My
        const ox = Math.floor((rect.width - W) / 2) + panX.value
        const oy = Math.floor((rect.height - H) / 2) + panY.value
        hitCell((x - ox) / W, (y - oy) / H, W, H, bpX, Mx, My)
      })
      .exec()
  }
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
  if (!hasPattern.value) return
  const dy = e.deltaY || 0
  if (dy === 0) return
  const step = dy > 0 ? -0.1 : 0.1
  const next = Math.min(2.6, Math.max(0.5, +(store.zoom + step).toFixed(2)))
  if (next !== store.zoom) {
    store.setZoom(next)
  }
}

function onMouseDown(e: MouseEvent): void {
  if (!hasPattern.value) return
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
  console.log('[export] onExport called', { exporting: exporting.value, hasPattern: hasPattern.value })
  if (exporting.value || !hasPattern.value) return
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

    console.log('[export] createSelectorQuery start')
    const exportNode: any = await new Promise((resolve, reject) => {
      uni.createSelectorQuery()
        .in(instance)
        .select('#' + exportCanvasId)
        .fields({ node: true }, (res: any) => {
          console.log('[export] selectorQuery result', !!res, !!res?.node)
          if (!res || !res.node) reject(new Error('export canvas not found'))
          else resolve(res.node)
        })
        .exec()
    })
    const canvas = exportNode as any
    const ctx = canvas.getContext('2d')
    // 导出 canvas 总像素需受控：微信 canvasToTempFilePath 有 native buffer 上限，
    // 超限报 "native buffer exceed size limit"（日志：5106×5508≈28M 像素即触发）；
    // iOS Safari ~16.7M、单边 4096。以设备 pixelRatio 起步，压到单边 ≤4096、总像素 ≤14M。
    const MAX_EXPORT_EDGE = 4096
    const MAX_EXPORT_PIXELS = 14_000_000
    const devRatio = uni.getSystemInfoSync().pixelRatio
    let scale = Math.max(1, devRatio)
    if (Math.max(W, H) * scale > MAX_EXPORT_EDGE) {
      scale = Math.max(1, Math.floor(MAX_EXPORT_EDGE / Math.max(W, H)))
    }
    if (W * scale * H * scale > MAX_EXPORT_PIXELS) {
      scale = Math.max(1, Math.floor(Math.sqrt(MAX_EXPORT_PIXELS / (W * H))))
    }
    canvas.width = Math.floor(W * scale)
    canvas.height = Math.floor(H * scale)
    // #ifdef H5
    // mp-weixin canvas node 没有 style 属性，仅 H5 设
    if (canvas.style) {
      canvas.style.width = W + 'px'
      canvas.style.height = H + 'px'
    }
    // #endif
    ctx.setTransform(1, 0, 0, 1, 0, 0)
    ctx.scale(scale, scale)
    ctx.clearRect(0, 0, W, H)
    drawComposed(ctx, store.hexGrid, store.rows, store.cols, store.sortedItems, store.brand, bp)
    console.log('[export] drawComposed done, canvas=', canvas.width, 'x', canvas.height)

    // #ifdef H5
    // H5：SVG → Image → canvas → toDataURL，绕开 Safari drawComposed 兼容性问题
    const { svg, width: sW, height: sH } = patternToSVG(store.hexGrid, store.rows, store.cols, store.sortedItems, store.brand)
    // 自适应缩放，保证导出 canvas 单边 ≤ 4096、总像素 ≤ 14M。
    // iOS Safari 单 canvas 硬限 ~16.7M 像素 / 单边 4096，超限 toDataURL 直接抛 SecurityError
    // （手机端"导出失败"的根因）。固定 dpr2=2 时，尺寸 ≥80 的图纸导出 canvas 必超限。
    const MAX_CANVAS_EDGE = 4096
    const MAX_CANVAS_PIXELS = 14_000_000
    let dpr2 = 2
    if (Math.max(sW, sH) * dpr2 > MAX_CANVAS_EDGE) {
      dpr2 = Math.max(1, Math.floor(MAX_CANVAS_EDGE / Math.max(sW, sH)))
    }
    if (sW * dpr2 * sH * dpr2 > MAX_CANVAS_PIXELS) {
      dpr2 = Math.max(1, Math.floor(Math.sqrt(MAX_CANVAS_PIXELS / (sW * sH))))
    }
    await new Promise<void>((resolve, reject) => {
      const img = new Image()
      img.onload = () => {
        const c = document.createElement('canvas')
        c.width = Math.floor(sW * dpr2)
        c.height = Math.floor(sH * dpr2)
        const cx = c.getContext('2d')!
        cx.drawImage(img, 0, 0, c.width, c.height)
        // 用 toBlob + Blob URL 触发下载：iOS Safari 对 data: URL 的 <a download> 支持很差
        // （大图常在新窗口打开而非下载）；Blob URL 更可靠，也避免超长 data URL 被截断。
        c.toBlob((blob) => {
          if (!blob) {
            reject(new Error('toBlob 返回空（canvas 尺寸 ' + c.width + '×' + c.height + '）'))
            return
          }
          const blobUrl = URL.createObjectURL(blob)
          const a = document.createElement('a')
          a.href = blobUrl
          a.download = `pindou-pattern-${store.cols}x${store.rows}-${store.brand}.png`
          document.body.appendChild(a)
          a.click()
          document.body.removeChild(a)
          // 延迟 revoke，确保 click 触发的导航已读取 blob URL
          setTimeout(() => URL.revokeObjectURL(blobUrl), 2000)
          resolve()
        }, 'image/png')
      }
      img.onerror = () => reject(new Error('SVG 图加载失败'))
      img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg)
    })
    uni.showToast({ title: 'PNG 已下载', icon: 'success', duration: 2000 })
    // #endif

    // #ifndef H5
    // mp-weixin：导出整张 canvas buffer PNG 到相册（优先 canvas.toTempFilePath，fallback 到 uni.canvasToTempFilePath）
    console.log('[export] mp-weixin toTempFilePath start, hasFn=', typeof canvas.toTempFilePath)
    const tempFilePath: string = await new Promise<string>((resolve, reject) => {
      const opts = {
        x: 0,
        y: 0,
        width: canvas.width,
        height: canvas.height,
        destWidth: canvas.width,
        destHeight: canvas.height,
        fileType: 'png' as const,
        success: (r: any) => { console.log('[export] toTempFilePath OK', r.tempFilePath); resolve(r.tempFilePath) },
        fail: (e: any) => { console.error('[export] toTempFilePath FAIL', e); reject(e) },
      }
      if (typeof canvas.toTempFilePath === 'function') {
        canvas.toTempFilePath(opts)
      } else {
        // @ts-ignore
        uni.canvasToTempFilePath({ ...opts, canvas }, instance?.proxy)
      }
    })
    console.log('[export] saveImageToAlbum start', tempFilePath)
    const ok = await saveImageToAlbum(tempFilePath)
    console.log('[export] saveImageToAlbum done, ok =', ok)
    if (ok) uni.showToast({ title: '已保存到相册', icon: 'success', duration: 3000 })
    // #endif
  } catch (e: any) {
    console.error('[export] failed:', e?.errMsg || e?.message || JSON.stringify(e), e)
    uni.showToast({ title: '导出失败：' + (e?.errMsg || e?.message || '未知错误'), icon: 'none', duration: 3000 })
  } finally {
    uni.hideLoading()
    exporting.value = false
  }
}

let disposePersist: (() => void) | null = null

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
  // 持久化：H5 总启用；mp-weixin 仅生产启用（dev 期重新编译应该重置状态，方便调试）
  // #ifdef H5
  disposePersist = installPersist(store)
  // #endif
  // #ifdef MP-WEIXIN
  if (process.env.NODE_ENV === 'production') {
    disposePersist = installPersist(store)
  } else {
    // dev 期清掉历史快照，避免重新编译还记忆上次图片
    try { uni.removeStorageSync('pindou:snapshot') } catch {}
  }
  // #endif
})

onUnmounted(() => {
  if (disposePersist) {
    disposePersist()
    disposePersist = null
  }
})

// watch UI 状态变化触发 render（primitive sources，不 deep walk typed array）
watch(() => store.mode, () => nextTick(() => render()))
watch(() => store.brand, () => nextTick(() => render()))
watch(() => store.size, () => { panX.value = 0; panY.value = 0; movKey.value++; nextTick(() => render()) })
// zoom 回到 1 时自动归位 pan（避免像素图偏在一边）
watch(() => store.zoom, (z) => {
  if (z <= 1.01) { panX.value = 0; panY.value = 0 }
  nextTick(() => render())
})
watch(() => store.showZones, () => nextTick(() => render()))
watch(() => store.showCodes, () => nextTick(() => render()))
watch(() => store.guide, () => nextTick(() => render()))
watch(() => store.mergeEnabled, () => nextTick(() => render()))
watch(() => store.mergeMode, () => nextTick(() => render()))
watch(() => store.spatialThreshold, () => nextTick(() => render()))
watch(() => store.paletteMaxColors, () => nextTick(() => render()))
watch(() => store.paletteMinCount, () => nextTick(() => render()))
watch(() => store.paletteThreshold, () => nextTick(() => render()))
// placed 用 shallowRef + triggerRef，watch 引用变化（triggerRef 触发）
watch(() => store.placed, () => {
  if (store.mode === 'track') nextTick(() => render())
})
</script>

<template>
  <view class="page" :style="{ paddingTop: navPadTop + 'px' }">
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
      <view v-if="isMpWeixin" class="spacer" />
      <view v-if="isMpWeixin" class="brand-toggle" @tap="showBrandMenu = !showBrandMenu">
        <text class="brand-current">{{ store.brand }}</text>
        <text class="brand-arrow">▾</text>
      </view>
    </view>

    <view class="layout">
      <view class="card canvas-card" :style="canvasCardStyle">
        <!-- #ifdef H5 -->
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
          <view v-if="!hasPattern && !patternImageSrc" class="pick-prompt">
            <text class="big">点下方「选择图片」按钮</text>
            <text class="small">上传照片生成像素图</text>
          </view>
        </view>
        <!-- #endif -->
        <!-- #ifndef H5 -->
        <movable-area class="canvas-scroll" :style="canvasScrollStyle" scale-area>
          <movable-view
            v-if="patternImageSrc"
            :key="movKey"
            direction="all"
            scale
            :scale-min="1"
            :scale-max="10"
            out-of-bounds
            :damping="40"
            @tap="onCanvasTap"
            class="pattern-image-wrap"
          >
            <image
              ref="imageRef"
              :src="patternImageSrc"
              mode="scaleToFill"
              class="pattern-image"
            />
          </movable-view>
          <canvas :id="canvasId" type="2d" class="pattern-canvas" />
          <view v-if="!hasPattern && !patternImageSrc" class="pick-prompt">
            <text class="big">点下方「选择图片」按钮</text>
            <text class="small">上传照片生成像素图</text>
          </view>
        </movable-area>
        <!-- #endif -->

        <view class="legend-bottom" v-if="hasPattern && !isMpWeixin">
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
      </view>

      <!-- mp-weixin: 尺寸滑块（画布和按钮之间） -->
      <view v-if="isMpWeixin" class="size-bar">
        <text class="size-label">尺寸</text>
        <slider
          class="size-slider"
          :min="50"
          :max="200"
          :step="1"
          :value="store.size"
          activeColor="#F77F00"
          backgroundColor="#F3EAD6"
          block-size="20"
          @change="(e: any) => store.setSize(e.detail.value)"
        />
        <text class="size-display">{{ sizeDisplay }}</text>
        <text v-if="store.totalBeads" class="bead-count">共{{ store.totalBeads }}颗</text>
      </view>

      <!-- mp-weixin: 主操作按钮固定在画布下方 -->
      <view v-if="isMpWeixin" class="main-actions">
        <view class="big-btn pick" @tap="pickImage">
          <text>{{ hasPattern ? '换图片' : (ghost ? '重新上传图' : '选择图片') }}</text>
        </view>
        <view v-if="hasPattern" class="big-btn export" @tap="onExport">
          <text>导出图纸</text>
        </view>
      </view>

      <!-- H5: sidebar 在 layout 内 -->
      <view v-if="!isMpWeixin" class="sidebar">
        <ProgressStrip />
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

    <!-- mp-weixin: 品牌切换菜单（dropdown） -->
    <view v-if="isMpWeixin && showBrandMenu" class="brand-menu-mask" @tap="showBrandMenu = false">
      <view class="brand-menu" @tap.stop>
        <view
          v-for="b in BRANDS"
          :key="b"
          class="brand-menu-item"
          :class="{ active: store.brand === b }"
          @tap="selectBrand(b)"
        >
          <text>{{ b }}</text>
          <text v-if="store.brand === b" class="check">✓</text>
        </view>
      </view>
    </view>

    <OrigModal :show="showOrig" :src="store.origTempFilePath" @close="showOrig = false" />

    <canvas :id="exportCanvasId" type="2d" class="export-canvas" />
  </view>
</template>

<style lang="scss" scoped>
.page {
  height: 100vh;
  padding: 0 12px 12px;
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
  /* sidebar 顶部对齐画布顶边黑框；overflow-y:auto 兜底，内容多时内部滚动，
     底边恒与画布底边对齐、绝不溢出到画布以下 */
  .sidebar { flex: 0 0 280px; width: 280px; min-height: 0; overflow-y: auto; box-sizing: border-box; }
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
  padding: 8px 12px;
  margin-top: 10px;
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
.pattern-image-wrap {
  width: 100%;
  height: 100%;
  box-sizing: border-box;
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
/* mp-weixin: 主屏画布占大头 + 底部两按钮 + 顶部品牌切换（H5 下元素 v-if=false 不渲染，样式留着无副作用）*/
.brand-toggle {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 8px 14px;
  background: $surface;
  border: $border;
  border-radius: 12px;
  box-shadow: $shadow-sm;
  font-size: 14px;
  font-weight: 700;
  color: $ink;
}
.brand-current {
  font-weight: 800;
}
.brand-arrow {
  font-size: 12px;
  color: $ink-soft;
}
.brand-menu-mask {
  position: fixed;
  left: 0;
  right: 0;
  top: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.35);
  z-index: 9999;
}
.brand-menu {
  position: fixed;
  top: 80px;
  right: 12px;
  min-width: 140px;
  background: $surface;
  border: $border;
  border-radius: 12px;
  box-shadow: $shadow;
  padding: 4px;
  z-index: 10000;
}
.brand-menu-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 14px;
  font-size: 14px;
  font-weight: 600;
  color: $ink;
  border-radius: 9px;
  &.active {
    background: $ink;
    color: #fff;
  }
  .check {
    color: $orange;
    font-weight: 800;
  }
  &.active .check {
    color: #fff;
  }
}
.main-actions {
  flex: 0 0 auto;
  display: flex;
  gap: 10px;
  padding: 4px 0 2px;
}
.size-bar {
  flex: 0 0 auto;
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 8px 14px;
  background: $surface;
  border: $border;
  border-radius: 12px;
  box-shadow: $shadow-sm;
  margin-bottom: 8px;
}
.size-label {
  flex: 0 0 auto;
  font-weight: 800;
  font-size: 13px;
  color: $ink;
}
.size-slider {
  flex: 1 1 auto;
  margin: 0;
  min-width: 0;
}
.size-display {
  flex: 0 0 auto;
  min-width: 56px;
  text-align: right;
  font-weight: 700;
  font-size: 13px;
  color: $orange;
  font-variant-numeric: tabular-nums;
}
.bead-count {
  flex: 0 0 auto;
  margin-left: 8px;
  padding: 2px 8px;
  font-weight: 700;
  font-size: 12px;
  color: $ink-soft;
  background: $bg-2;
  border-radius: 8px;
  font-variant-numeric: tabular-nums;
}
.big-btn {
  flex: 1 1 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 16px 14px;
  border: $border;
  border-radius: 14px;
  font-size: 16px;
  font-weight: 700;
  box-shadow: $shadow;
  text-align: center;
  &.pick { background: $teal; color: #fff; }
  &.export { background: $orange; color: #fff; }
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
