import colorSystemMapping from '../../data/colorSystemMapping.json'
import type { Brand, Hex } from '@/types/pattern'

export const BRANDS: Brand[] = ['MARD', 'COCO', '漫漫', '盼盼', '咪小窝']

export const DEFAULT_BRAND: Brand = 'MARD'

export const PALETTE_HEX: Hex[] = Object.keys(colorSystemMapping) as Hex[]

export const BRAND_CODES: Record<Brand, Record<Hex, string>> = (() => {
  const out = {} as Record<Brand, Record<Hex, string>>
  for (const b of BRANDS) out[b] = {}
  for (const hex of PALETTE_HEX) {
    const row = (colorSystemMapping as Record<Hex, Record<Brand, string>>)[hex]
    for (const b of BRANDS) out[b][hex] = row[b]
  }
  return out
})()

export const PAL_RGB: Float32Array = (() => {
  const arr = new Float32Array(PALETTE_HEX.length * 3)
  PALETTE_HEX.forEach((hex, i) => {
    const n = parseInt(hex.slice(1), 16)
    arr[i * 3] = (n >> 16) & 255
    arr[i * 3 + 1] = (n >> 8) & 255
    arr[i * 3 + 2] = n & 255
  })
  return arr
})()

// 32³ LUT：主导色已 4-bit 量化（16 级/通道），32 档 LUT 无损。
// 预计算约 4ms，之后 nearestHex 查询 O(1)。
export const LUT: Hex[] = (() => {
  const lut: Hex[] = new Array(32 * 32 * 32)
  for (let ri = 0; ri < 32; ri++) {
    for (let gi = 0; gi < 32; gi++) {
      for (let bi = 0; bi < 32; bi++) {
        const R = ri * 8, G = gi * 8, B = bi * 8
        let bestIdx = 0
        let bestDist = Infinity
        for (let i = 0; i < PALETTE_HEX.length; i++) {
          const dr = PAL_RGB[i * 3] - R
          const dg = PAL_RGB[i * 3 + 1] - G
          const db = PAL_RGB[i * 3 + 2] - B
          const d = dr * dr + dg * dg + db * db
          if (d < bestDist) {
            bestDist = d
            bestIdx = i
          }
        }
        lut[ri * 1024 + gi * 32 + bi] = PALETTE_HEX[bestIdx]
      }
    }
  }
  return lut
})()
