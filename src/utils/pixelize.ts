import type { Hex, ImagePixels } from '@/types/pattern'
import { nearestHex } from './color'

export interface PixelizeResult {
  rows: number
  cols: number
  hexGrid: Hex[][]
}

// 主导色像素化：对每格 cell，采样像素并按 4-bit/通道量化（4096 桶），
// 取出现频次最高的桶作为该 cell 的主导色 RGB。
// 注意：不是均值池化——均值会让色边界发灰。
export function pixelize(
  src: ImagePixels,
  longerSide: number,
  aspect: number
): PixelizeResult {
  const _t0 = Date.now()
  const _log = (tag: string) => {
    ;(globalThis as any).__pindouLogs = (globalThis as any).__pindouLogs || []
    ;(globalThis as any).__pindouLogs.push(`[${((Date.now() - _t0) / 1000).toFixed(2)}s][pixelize] ${tag}`)
  }
  _log('start')

  const { data, width: srcW, height: srcH } = src
  let rows: number, cols: number
  if (aspect >= 1) {
    cols = longerSide
    rows = Math.max(1, Math.round(longerSide / aspect))
  } else {
    rows = longerSide
    cols = Math.max(1, Math.round(longerSide * aspect))
  }
  _log(`grid ${rows}x${cols}, srcW=${srcW} srcH=${srcH}`)

  const hexGrid: Hex[][] = new Array(rows)
  for (let r = 0; r < rows; r++) {
    const row: Hex[] = new Array(cols)
    const y0 = Math.floor((r * srcH) / rows)
    const y1 = Math.floor(((r + 1) * srcH) / rows)
    const ystep = Math.max(1, Math.floor((y1 - y0) / 16))
    for (let c = 0; c < cols; c++) {
      const x0 = Math.floor((c * srcW) / cols)
      const x1 = Math.floor(((c + 1) * srcW) / cols)
      const step = Math.max(1, Math.floor((x1 - x0) / 16))
      const bins: Record<number, number> = {}
      for (let y = y0; y < y1; y += ystep) {
        for (let x = x0; x < x1; x += step) {
          const i = (y * srcW + x) * 4
          const key = ((data[i] >> 4) << 8) | ((data[i + 1] >> 4) << 4) | (data[i + 2] >> 4)
          bins[key] = (bins[key] || 0) + 1
        }
      }
      let best = -1
      let bestN = -1
      for (const k in bins) {
        const n = bins[k]
        if (n > bestN) {
          bestN = n
          best = +k
        }
      }
      const R = (best >> 8) & 0xf
      const G = (best >> 4) & 0xf
      const B = best & 0xf
      row[c] = nearestHex((R << 4) | R, (G << 4) | G, (B << 4) | B)
    }
    hexGrid[r] = row
  }
  _log('done')

  return { rows, cols, hexGrid }
}
