import { describe, it } from 'vitest'
import { PNG } from 'pngjs'
import fs from 'fs'
import { nearestHex } from '../src/utils/color'
import { denoiseIsolated } from '../src/utils/colorMerge'
import type { Hex, ImagePixels } from '../src/types/pattern'

// 研究 pixelize 保真度：当前 dominant vs 候选（mean/median/dark-minority 保线）
// 输出像素图 PNG 到 test-output/，目测 + 黑格统计对比

function decodePng(file: string): ImagePixels {
  const png = PNG.sync.read(fs.readFileSync(file))
  return { data: new Uint8ClampedArray(png.data), width: png.width, height: png.height }
}

function hexToRgb(hex: Hex): [number, number, number] {
  return [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16)]
}

function encodeGridPng(grid: Hex[][], cellSize: number, file: string): void {
  const rows = grid.length, cols = grid[0].length
  const w = cols * cellSize, h = rows * cellSize
  const png = new PNG({ width: w, height: h })
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const [R, G, B] = hexToRgb(grid[r][c])
      for (let dy = 0; dy < cellSize; dy++) {
        for (let dx = 0; dx < cellSize; dx++) {
          const i = ((r * cellSize + dy) * w + (c * cellSize + dx)) * 4
          png.data[i] = R; png.data[i + 1] = G; png.data[i + 2] = B; png.data[i + 3] = 255
        }
      }
    }
  }
  fs.writeFileSync(file, PNG.sync.write(png))
}

// 生成测试图：白底 + 黑边框矩形（边框 24px）+ 内部红块。直击"黑轮廓被吞"问题
function genBorderTestPng(file: string): void {
  const W = 768, H = 768
  const png = new PNG({ width: W, height: H })
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const i = (y * W + x) * 4
      png.data[i] = 255; png.data[i + 1] = 255; png.data[i + 2] = 255; png.data[i + 3] = 255
      const inRect = x >= 184 && x < 584 && y >= 184 && y < 584
      const onBorder = inRect && (x < 186 || x >= 582 || y < 186 || y >= 582) // 细线 2px
      if (onBorder) { png.data[i] = 20; png.data[i + 1] = 20; png.data[i + 2] = 20 }
      else if (inRect) { png.data[i] = 220; png.data[i + 1] = 60; png.data[i + 2] = 60 }
    }
  }
  fs.writeFileSync(file, PNG.sync.write(png))
}

type Mode = 'dominant' | 'mean' | 'median' | 'dark-minority'

function pixelizeVariant(src: ImagePixels, longerSide: number, aspect: number, mode: Mode): Hex[][] {
  const { data, width: srcW, height: srcH } = src
  let rows: number, cols: number
  if (aspect >= 1) { cols = longerSide; rows = Math.max(1, Math.round(longerSide / aspect)) }
  else { rows = longerSide; cols = Math.max(1, Math.round(longerSide * aspect)) }
  const grid: Hex[][] = []
  for (let r = 0; r < rows; r++) {
    const row: Hex[] = []
    const y0 = Math.floor((r * srcH) / rows), y1 = Math.floor(((r + 1) * srcH) / rows)
    const ystep = Math.max(1, Math.floor((y1 - y0) / 16))
    for (let c = 0; c < cols; c++) {
      const x0 = Math.floor((c * srcW) / cols), x1 = Math.floor(((c + 1) * srcW) / cols)
      const step = Math.max(1, Math.floor((x1 - x0) / 16))
      const samples: Array<[number, number, number]> = []
      const bins: Record<number, number> = {}
      for (let y = y0; y < y1; y += ystep) {
        for (let x = x0; x < x1; x += step) {
          const i = (y * srcW + x) * 4
          const R = data[i], G = data[i + 1], B = data[i + 2]
          samples.push([R, G, B])
          const key = ((R >> 4) << 8) | ((G >> 4) << 4) | (B >> 4)
          bins[key] = (bins[key] || 0) + 1
        }
      }
      let hex: Hex
      if (mode === 'mean') {
        let rs = 0, gs = 0, bs = 0
        for (const [R, G, B] of samples) { rs += R; gs += G; bs += B }
        hex = nearestHex(Math.round(rs / samples.length), Math.round(gs / samples.length), Math.round(bs / samples.length))
      } else if (mode === 'median') {
        const rs = samples.map((s) => s[0]).sort((a, b) => a - b)
        const gs = samples.map((s) => s[1]).sort((a, b) => a - b)
        const bs = samples.map((s) => s[2]).sort((a, b) => a - b)
        const m = Math.floor(samples.length / 2)
        hex = nearestHex(rs[m], gs[m], bs[m])
      } else if (mode === 'dark-minority') {
        // dominant，但若格内有显著深色 minority（亮度<80 占>15% 且比 dominant 暗很多）→ 取最暗，保黑线
        let best = -1, bestN = -1
        for (const k in bins) { if (bins[k] > bestN) { bestN = bins[k]; best = +k } }
        const dR = (best >> 8) & 0xf, dG = (best >> 4) & 0xf, dB = best & 0xf
        const dominantLum = ((dR * 16) + (dG * 16) + (dB * 16)) / 3
        let darkest: [number, number, number] = samples[0]
        let darkestLum = 256
        let darkCount = 0
        for (const [R, G, B] of samples) {
          const lum = (R + G + B) / 3
          if (lum < darkestLum) { darkestLum = lum; darkest = [R, G, B] }
          if (lum < 80) darkCount++
        }
        const darkRatio = darkCount / samples.length
        if (darkRatio > 0.05 && darkestLum < dominantLum - 40) {
          hex = nearestHex(darkest[0], darkest[1], darkest[2])
        } else {
          hex = nearestHex((dR << 4) | dR, (dG << 4) | dG, (dB << 4) | dB)
        }
      } else {
        let best = -1, bestN = -1
        for (const k in bins) { if (bins[k] > bestN) { bestN = bins[k]; best = +k } }
        const R = (best >> 8) & 0xf, G = (best >> 4) & 0xf, B = best & 0xf
        hex = nearestHex((R << 4) | R, (G << 4) | G, (B << 4) | B)
      }
      row.push(hex)
    }
    grid.push(row)
  }
  return grid
}

function darkCellRatio(grid: Hex[][]): number {
  let dark = 0, total = 0
  for (const row of grid) for (const h of row) {
    const [R, G, B] = hexToRgb(h)
    if ((R + G + B) / 3 < 80) dark++
    total++
  }
  return dark / total
}

describe('pixelize fidelity research', () => {
  it('对比 dominant / mean / median / dark-minority（输出 PNG + 黑格比例）', () => {
    fs.mkdirSync('test-output', { recursive: true })
    genBorderTestPng('test-output/border-input.png')
    const border = decodePng('test-output/border-input.png')
    const logo = decodePng('brand/pindou-logo-4color.png')
    const size = 52
    const cellSize = 14
    const lines: string[] = ['\n=== 像素化保真度对比（黑格比例越高 = 越保黑线/轮廓）===']
    for (const mode of ['dominant', 'mean', 'median', 'dark-minority'] as Mode[]) {
      const gB0 = pixelizeVariant(border, size, 1, mode)
      const gB = denoiseIsolated(gB0, gB0.length, gB0[0].length, { threshold: 10 })
      encodeGridPng(gB, cellSize, `test-output/border-${mode}.png`)
      const gL0 = pixelizeVariant(logo, size, 1, mode)
      const gL = denoiseIsolated(gL0, gL0.length, gL0[0].length, { threshold: 10 })
      encodeGridPng(gL, cellSize, `test-output/logo-${mode}.png`)
      lines.push(
        `${mode.padEnd(14)} border黑格=${(darkCellRatio(gB) * 100).toFixed(1)}%  logo黑格=${(darkCellRatio(gL) * 100).toFixed(1)}%`
      )
    }
    lines.push('PNG 输出: test-output/{border,logo}-{dominant,mean,median,dark-minority}.png')
    console.log(lines.join('\n'))
  })
})
