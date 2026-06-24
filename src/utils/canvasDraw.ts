import type { Brand, Hex } from '@/types/pattern'
import { BRAND_CODES } from './palette'
import { hexToRgb } from './color'
import { ZONE } from './route'

// 绘制完整图纸：每格填色 + 色号 + 分区线/字母编号
// bpX/bpY 允许不相等 → cells 拉伸填满任意比例的 canvas（大框内直接出像素图）
export function drawGrid(
  g: CanvasRenderingContext2D,
  hexGrid: Hex[][],
  rows: number,
  cols: number,
  bpX: number,
  bpY: number,
  withCode: boolean,
  withZones: boolean,
  brand: Brand
): void {
  const Mx = withZones ? Math.round(bpX * 1.7) : 0
  const My = withZones ? Math.round(bpY * 1.7) : 0
  const ox = Mx
  const oy = My
  const bpMin = Math.min(bpX, bpY)

  g.fillStyle = '#ECE4D2'
  g.fillRect(ox, oy, cols * bpX, rows * bpY)

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const hex = hexGrid[r][c]
      const x = ox + c * bpX
      const y = oy + r * bpY
      g.fillStyle = hex
      g.fillRect(x + 0.5, y + 0.5, bpX - 1, bpY - 1)

      if (withCode && bpMin >= 12) {
        const [R, GG, B] = hexToRgb(hex)
        const lum = (0.299 * R + 0.587 * GG + 0.114 * B) / 255
        g.fillStyle = lum > 0.55 ? 'rgba(35,32,46,0.92)' : 'rgba(255,255,255,0.95)'
        const code = BRAND_CODES[brand][hex]
        const fs = Math.floor(bpMin * Math.min(0.5, 1.3 / Math.max(1, code.length)))
        g.font = '700 ' + fs + 'px sans-serif'
        g.textAlign = 'center'
        g.textBaseline = 'middle'
        g.fillText(code, x + bpX / 2, y + bpY / 2 + 0.5)
      }
    }
  }

  if (withZones) {
    g.strokeStyle = '#E63946'
    g.lineWidth = Math.max(2, bpMin * 0.14)
    g.lineCap = 'square'
    g.beginPath()
    for (let i = 0; i <= cols; i += ZONE) {
      const x = Math.round(ox + i * bpX) + 0.5
      g.moveTo(x, oy)
      g.lineTo(x, oy + rows * bpY)
    }
    for (let i = 0; i <= rows; i += ZONE) {
      const y = Math.round(oy + i * bpY) + 0.5
      g.moveTo(ox, y)
      g.lineTo(ox + cols * bpX, y)
    }
    g.stroke()
    g.lineWidth = Math.max(2.5, bpMin * 0.16)
    g.strokeRect(ox + 0.5, oy + 0.5, cols * bpX - 1, rows * bpY - 1)

    g.fillStyle = '#E63946'
    g.font = '700 ' + Math.floor(bpMin * 0.8) + 'px sans-serif'
    g.textBaseline = 'middle'
    for (let zc = 0; zc * ZONE < cols; zc++) {
      g.textAlign = 'center'
      g.fillText(String.fromCharCode(65 + zc), ox + (zc * ZONE + ZONE / 2) * bpX, oy - My * 0.5)
    }
    for (let zr = 0; zr * ZONE < rows; zr++) {
      g.textAlign = 'center'
      g.fillText(String(zr + 1), ox - Mx * 0.5, oy + (zr * ZONE + ZONE / 2) * bpY)
    }
  }
}

// 进度覆盖层：已拼格打勾，下一步格高亮（支持 bpX/bpY 拉伸）
export function drawProgressOverlay(
  g: CanvasRenderingContext2D,
  placed: boolean[][],
  rows: number,
  cols: number,
  bpX: number,
  bpY: number,
  showZones: boolean,
  guide: boolean,
  routeOrder: [number, number][],
  nextIdx: number
): void {
  const Mx = showZones ? Math.round(bpX * 1.7) : 0
  const My = showZones ? Math.round(bpY * 1.7) : 0
  const ox = Mx
  const oy = My
  const bpMin = Math.min(bpX, bpY)

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (!placed[r][c]) continue
      const x = ox + c * bpX
      const y = oy + r * bpY
      g.fillStyle = 'rgba(35,32,46,0.5)'
      g.fillRect(x, y, bpX, bpY)
      g.strokeStyle = '#fff'
      g.lineWidth = Math.max(1.6, bpMin * 0.16)
      g.lineCap = 'round'
      g.lineJoin = 'round'
      const cx = x + bpX / 2
      const cy = y + bpY / 2
      const s = bpMin * 0.2
      g.beginPath()
      g.moveTo(cx - s * 1.1, cy)
      g.lineTo(cx - s * 0.2, cy + s * 0.9)
      g.lineTo(cx + s * 1.2, cy - s * 1.0)
      g.stroke()
    }
  }

  if (guide) {
    for (let k = 0; k < 3 && nextIdx + k < routeOrder.length; k++) {
      const [r, c] = routeOrder[nextIdx + k]
      const x = ox + c * bpX
      const y = oy + r * bpY
      g.strokeStyle = '#F77F00'
      g.lineWidth = k === 0 ? Math.max(2.5, bpMin * 0.2) : Math.max(1.5, bpMin * 0.1)
      g.globalAlpha = k === 0 ? 1 : 0.4
      g.strokeRect(x + 1, y + 1, bpX - 2, bpY - 2)
    }
    g.globalAlpha = 1
  }
}

// 组合导出：标题 + 大图纸 + 色号图例
export function drawComposed(
  g: CanvasRenderingContext2D,
  hexGrid: Hex[][],
  rows: number,
  cols: number,
  sortedItems: [Hex, number][],
  brand: Brand,
  bp = 30
): { width: number; height: number } {
  const M = Math.round(bp * 1.7)
  const gridW = cols * bp + 2 * M
  const gridH = rows * bp + 2 * M
  const titleH = 46
  const itemW = 176
  const itemH = 42
  const legendCols = Math.max(1, Math.min(sortedItems.length, Math.floor((gridW + 40) / itemW)))
  const legendRows = Math.ceil(sortedItems.length / legendCols)
  const W = Math.max(gridW, legendCols * itemW) + 40
  const H = titleH + gridH + legendRows * itemH + 34 + 40

  g.fillStyle = '#FBF6EC'
  g.fillRect(0, 0, W, H)

  g.fillStyle = '#23202E'
  g.textAlign = 'left'
  g.textBaseline = 'alphabetic'
  g.font = '700 24px sans-serif'
  const totalBeads = rows * cols
  g.fillText(
    '拼豆图纸 · ' + brand + ' · ' + cols + '×' + rows + ' · ' + sortedItems.length + ' 色 · ' + totalBeads + ' 颗',
    20,
    32
  )

  g.save()
  g.translate(Math.floor((W - gridW) / 2), titleH + 6)
  drawGrid(g, hexGrid, rows, cols, bp, bp, true, true, brand)
  g.restore()

  let ly = titleH + gridH + 30
  g.fillStyle = '#23202E'
  g.font = '700 16px sans-serif'
  g.fillText('色号 → HEX → 数量', 20, ly)
  ly += 12

  sortedItems.forEach(([hex, n], i) => {
    const col = i % legendCols
    const row = Math.floor(i / legendCols)
    const x = 20 + col * itemW
    const y = ly + row * itemH
    const code = BRAND_CODES[brand][hex]
    g.fillStyle = hex
    g.strokeStyle = '#23202E'
    g.lineWidth = 2.5
    g.beginPath()
    g.rect(x + 2, y + 2, 28, 28)
    g.fill()
    g.stroke()
    g.fillStyle = '#23202E'
    g.textAlign = 'left'
    g.textBaseline = 'middle'
    g.font = '700 17px sans-serif'
    g.fillText(code, x + 38, y + 9)
    g.fillStyle = '#615C72'
    g.font = '700 11px sans-serif'
    g.fillText(hex, x + 38, y + 24)
    g.fillStyle = '#F77F00'
    g.font = '700 16px sans-serif'
    g.fillText('×' + n, x + 140, y + 16)
  })

  return { width: W, height: H }
}
