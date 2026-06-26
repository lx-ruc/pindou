import type { Brand, Hex } from '@/types/pattern'
import { BRAND_CODES } from './palette'

const escape = (s: string) => s.replace(/[<>&"]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' }[c] || c))

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '')
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)]
}

// cells + legend 的 SVG 片段（每个 cell 用 rect + text，原生 SVG 不依赖 foreignObject）
function buildSVGBody(
  hexGrid: Hex[][],
  rows: number,
  cols: number,
  sortedItems: [Hex, number][],
  brand: Brand
): { svg: string; width: number; height: number } {
  const bp = 28
  const M = 48
  const gridW = cols * bp + 2 * M
  const gridH = rows * bp + 2 * M
  const titleH = 60
  const itemW = 200
  const itemH = 44
  const legendCols = Math.max(1, Math.min(sortedItems.length, Math.floor((gridW + 40) / itemW)))
  const legendRows = Math.ceil(sortedItems.length / legendCols)
  const innerW = Math.max(gridW, legendCols * itemW)
  const W = innerW + 80
  const H = titleH + gridH + legendRows * itemH + 80

  const parts: string[] = []
  // 背景
  parts.push(`<rect x="0" y="0" width="${W}" height="${H}" fill="#FBF6EC"/>`)
  // 标题
  const title = `拼豆图纸 · ${escape(brand)} · ${cols}×${rows} · ${sortedItems.length} 色 · ${rows * cols} 颗`
  parts.push(`<text x="${W / 2}" y="38" font-family="-apple-system, sans-serif" font-size="24" font-weight="700" fill="#23202E" text-anchor="middle">${title}</text>`)

  // grid 外框
  const gridX = (W - gridW) / 2
  const gridY = titleH + 10
  parts.push(`<rect x="${gridX}" y="${gridY}" width="${gridW}" height="${gridH}" fill="#ECE4D2" stroke="#23202E" stroke-width="3"/>`)

  // cells
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const hex = hexGrid[r][c]
      const x = gridX + M + c * bp
      const y = gridY + M + r * bp
      parts.push(`<rect x="${x + 0.5}" y="${y + 0.5}" width="${bp - 1}" height="${bp - 1}" fill="${hex}"/>`)
      const code = BRAND_CODES[brand][hex] || ''
      if (bp >= 12 && code) {
        const [R, G, B] = hexToRgb(hex)
        const lum = (0.299 * R + 0.587 * G + 0.114 * B) / 255
        const textColor = lum > 0.55 ? '#23202E' : '#FFFFFF'
        const fs = Math.floor(bp * 0.45)
        parts.push(`<text x="${x + bp / 2}" y="${y + bp / 2 + fs / 3}" font-family="sans-serif" font-size="${fs}" font-weight="700" fill="${textColor}" text-anchor="middle">${escape(code)}</text>`)
      }
    }
  }

  // 图例标题
  const legY = gridY + gridH + 30
  parts.push(`<text x="40" y="${legY}" font-family="sans-serif" font-size="18" font-weight="700" fill="#23202E">色号 → HEX → 数量</text>`)

  // 图例 items
  sortedItems.forEach(([hex, n], i) => {
    const col = i % legendCols
    const row = Math.floor(i / legendCols)
    const x = 40 + col * itemW
    const y = legY + 20 + row * itemH
    const code = BRAND_CODES[brand][hex] || ''
    parts.push(`<rect x="${x}" y="${y}" width="28" height="28" fill="${hex}" stroke="#23202E" stroke-width="2"/>`)
    parts.push(`<text x="${x + 38}" y="${y + 20}" font-family="sans-serif" font-size="17" font-weight="700" fill="#23202E">${escape(code)}</text>`)
    parts.push(`<text x="${x + 90}" y="${y + 20}" font-family="monospace" font-size="13" fill="#615C72">${hex}</text>`)
    parts.push(`<text x="${x + 160}" y="${y + 20}" font-family="sans-serif" font-size="14" font-weight="700" fill="#F77F00">×${n}</text>`)
  })

  return { svg: parts.join(''), width: W, height: H }
}

export function patternToHTML(
  hexGrid: Hex[][],
  rows: number,
  cols: number,
  sortedItems: [Hex, number][],
  brand: Brand
): string {
  const totalBeads = rows * cols
  const cells = hexGrid.map((row) =>
    row.map((hex) => {
      const code = BRAND_CODES[brand][hex] || ''
      const [r, g, b] = hexToRgb(hex)
      const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255
      const textColor = lum > 0.55 ? '#23202E' : '#FFFFFF'
      return `<div class="cell" style="background:${hex};color:${textColor}">${escape(code)}</div>`
    }).join('')
  ).join('')

  const legend = sortedItems.map(([hex, n]) => {
    const code = BRAND_CODES[brand][hex] || ''
    return `<div class="leg-item"><div class="leg-swatch" style="background:${hex}"></div><span class="leg-code">${escape(code)}</span><span class="leg-hex">${hex}</span><span class="leg-count">×${n}</span></div>`
  }).join('')

  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<title>拼豆图纸 · ${escape(brand)} · ${cols}×${rows}</title>
<style>
  body { margin: 0; padding: 24px; font-family: -apple-system, BlinkMacSystemFont, "PingFang SC", sans-serif; background: #FBF6EC; color: #23202E; }
  h1 { font-size: 22px; margin: 0 0 16px; }
  .grid { display: grid; grid-template-columns: repeat(${cols}, 1fr); gap: 1px; background: #23202E; padding: 1px; border: 3px solid #23202E; box-shadow: 6px 6px 0 #23202E; }
  .cell { aspect-ratio: 1; display: flex; align-items: center; justify-content: center; font-size: 10px; font-weight: 700; line-height: 1; }
  .legend { margin-top: 24px; display: flex; flex-wrap: wrap; gap: 8px; }
  .leg-item { display: inline-flex; align-items: center; gap: 6px; padding: 6px 10px; background: #fff; border: 2px solid #23202E; border-radius: 8px; box-shadow: 2px 2px 0 #23202E; }
  .leg-swatch { width: 20px; height: 20px; border: 1.5px solid #23202E; border-radius: 4px; }
  .leg-code { font-weight: 700; font-size: 14px; }
  .leg-hex { font-size: 12px; color: #615C72; font-family: monospace; }
  .leg-count { font-weight: 700; color: #F77F00; }
</style>
</head>
<body>
<h1>拼豆图纸 · ${escape(brand)} · ${cols}×${rows} · ${sortedItems.length} 色 · ${totalBeads} 颗</h1>
<div class="grid">${cells}</div>
<h2 style="font-size:16px;margin:24px 0 8px">色号 → HEX → 数量</h2>
<div class="legend">${legend}</div>
</body>
</html>`
}

// 生成完整 SVG（自包含，原生 SVG rect/text，无 foreignObject），用 Image 加载后画到 canvas → PNG
export function patternToSVG(
  hexGrid: Hex[][],
  rows: number,
  cols: number,
  sortedItems: [Hex, number][],
  brand: Brand
): { svg: string; width: number; height: number } {
  const { svg: body, width, height } = buildSVGBody(hexGrid, rows, cols, sortedItems, brand)
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">${body}</svg>`
  return { svg, width, height }
}
