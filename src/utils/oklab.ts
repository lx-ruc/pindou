// Oklab 色空间 + 距离，移植自 Zippland/perler-beads（AGPL-3.0，pindou 同协议）。
// Oklab 是比 CIEDE2000 更新的人眼感知色彩空间；距离 ×100 与 0-100 阈值兼容。
// 来源：https://github.com/Zippland/perler-beads/blob/main/src/utils/pixelation.ts
import { PALETTE_HEX, PAL_RGB } from './palette'
import { hexToRgb } from './color'
import type { Hex } from '@/types/pattern'

export interface Oklab { l: number; a: number; b: number }

function srgbToLinear(c: number): number {
  const n = c / 255
  return n <= 0.04045 ? n / 12.92 : Math.pow((n + 0.055) / 1.055, 2.4)
}

const cache = new Map<number, Oklab>()
function getOklab(r: number, g: number, b: number): Oklab {
  const key = (r << 16) | (g << 8) | b
  const c = cache.get(key)
  if (c) return c
  const lr = srgbToLinear(r), lg = srgbToLinear(g), lb = srgbToLinear(b)
  const l = 0.4122214708 * lr + 0.5363325363 * lg + 0.0514459929 * lb
  const m = 0.2119034982 * lr + 0.6806995451 * lg + 0.1073969566 * lb
  const s = 0.0883024619 * lr + 0.2817188376 * lg + 0.6299787005 * lb
  const lR = Math.cbrt(l), mR = Math.cbrt(m), sR = Math.cbrt(s)
  const lab: Oklab = {
    l: 0.2104542553 * lR + 0.7936177850 * mR - 0.0040720468 * sR,
    a: 1.9779984951 * lR - 2.4285922050 * mR + 0.4505937099 * sR,
    b: 0.0259040371 * lR + 0.7827717662 * mR - 0.8086757660 * sR,
  }
  cache.set(key, lab)
  return lab
}

/** Oklab 距离 ×100（0-100 量纲，与原 CIEDE2000 阈值兼容） */
export function oklabDistance(a: Oklab, b: Oklab): number {
  const dl = a.l - b.l, da = a.a - b.a, db = a.b - b.b
  return Math.sqrt(dl * dl + da * da + db * db) * 100
}

export function hexToOklab(hex: Hex): Oklab {
  const [r, g, b] = hexToRgb(hex)
  return getOklab(r, g, b)
}

/** 在全色板中找 Oklab 最近色（对齐 Zippland findClosestPaletteColor，实时遍历 + 缓存） */
export function findClosestOklab(r: number, g: number, b: number): Hex {
  const target = getOklab(r, g, b)
  let best = PALETTE_HEX[0]
  let bestD = Infinity
  for (let i = 0; i < PALETTE_HEX.length; i++) {
    const d = oklabDistance(target, getOklab(PAL_RGB[i * 3], PAL_RGB[i * 3 + 1], PAL_RGB[i * 3 + 2]))
    if (d < bestD) {
      bestD = d
      best = PALETTE_HEX[i]
      if (d === 0) break
    }
  }
  return best
}
