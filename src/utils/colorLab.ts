import { hexToRgb } from './color'
import type { Hex } from '@/types/pattern'

export type Lab = [number, number, number]

// sRGB gamma 反校正（分段函数），0-1 归一化输入
function invGamma(c: number): number {
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)
}

/**
 * sRGB hex → CIELAB（D65 参考白）。纯函数，对任意合法 #RRGGBB 工作。
 * 链路：hex → 线性 RGB（gamma 反校正）→ XYZ（sRGB/D65 矩阵）→ LAB。
 */
export function hexToLab(hex: Hex): Lab {
  const [r8, g8, b8] = hexToRgb(hex)
  const r = invGamma(r8 / 255)
  const g = invGamma(g8 / 255)
  const b = invGamma(b8 / 255)

  // 线性 RGB → XYZ（sRGB / D65）
  const X = r * 0.4124 + g * 0.3576 + b * 0.1805
  const Y = r * 0.2126 + g * 0.7152 + b * 0.0722
  const Z = r * 0.0193 + g * 0.1192 + b * 0.9505

  // XYZ → LAB（D65: Xn=0.95047, Yn=1, Zn=1.08883），f(t) 分段
  const delta = 6 / 29
  const f = (t: number): number =>
    t > delta * delta * delta ? Math.cbrt(t) : t / (3 * delta * delta) + 4 / 29
  const fx = f(X / 0.95047)
  const fy = f(Y / 1.0)
  const fz = f(Z / 1.08883)

  return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)]
}

// hue 角度 [0, 360)，由 (b, a') 求 atan2
function hueAngle(b: number, a: number): number {
  const h = (Math.atan2(b, a) * 180) / Math.PI
  return h < 0 ? h + 360 : h
}

const DEG = Math.PI / 180
const POW25_7 = 25 ** 7

/**
 * CIEDE2000 色差（kL=kC=kH=1，参考条件）。纯函数，对称。
 * 实现依据 Sharma et al. 2005 公式（含 G、a'、ΔH'、T、RT 全部子项）。
 */
export function ciede2000(lab1: Lab, lab2: Lab): number {
  const [L1, a1, b1] = lab1
  const [L2, a2, b2] = lab2

  const C1 = Math.hypot(a1, b1)
  const C2 = Math.hypot(a2, b2)
  const Cbar7 = ((C1 + C2) / 2) ** 7
  const G = 0.5 * (1 - Math.sqrt(Cbar7 / (Cbar7 + POW25_7)))

  const a1p = (1 + G) * a1
  const a2p = (1 + G) * a2
  const C1p = Math.hypot(a1p, b1)
  const C2p = Math.hypot(a2p, b2)
  const h1p = hueAngle(b1, a1p)
  const h2p = hueAngle(b2, a2p)

  const dLp = L2 - L1
  const dCp = C2p - C1p

  // Δh'（角度差，度）；C1p*C2p==0 时为 0
  let dhp = 0
  if (C1p * C2p !== 0) {
    const diff = h2p - h1p
    dhp = diff > 180 ? diff - 360 : diff < -180 ? diff + 360 : diff
  }
  // ΔH' = 2·√(C1'·C2')·sin(Δh'/2)
  const dHp = 2 * Math.sqrt(C1p * C2p) * Math.sin((dhp / 2) * DEG)

  const Lbarp = (L1 + L2) / 2
  const Cbarp = (C1p + C2p) / 2

  // H̄'（C1p*C2p==0 时 = h1p+h2p，否则按角度差折叠）
  let hbarp: number
  if (C1p * C2p === 0) {
    hbarp = h1p + h2p
  } else if (Math.abs(h1p - h2p) > 180) {
    const sum = h1p + h2p
    hbarp = sum < 360 ? (sum + 360) / 2 : (sum - 360) / 2
  } else {
    hbarp = (h1p + h2p) / 2
  }

  const T =
    1 -
    0.17 * Math.cos((hbarp - 30) * DEG) +
    0.24 * Math.cos(2 * hbarp * DEG) +
    0.32 * Math.cos((3 * hbarp + 6) * DEG) -
    0.2 * Math.cos((4 * hbarp - 63) * DEG)

  const dTheta = 30 * Math.exp(-(((hbarp - 275) / 25) ** 2))
  const Cbarp7 = Cbarp ** 7
  const RC = 2 * Math.sqrt(Cbarp7 / (Cbarp7 + POW25_7))
  const SL = 1 + (0.015 * (Lbarp - 50) ** 2) / Math.sqrt(20 + (Lbarp - 50) ** 2)
  const SC = 1 + 0.045 * Cbarp
  const SH = 1 + 0.015 * Cbarp * T
  const RT = -Math.sin(2 * dTheta * DEG) * RC

  return Math.sqrt(
    (dLp / SL) ** 2 +
      (dCp / SC) ** 2 +
      (dHp / SH) ** 2 +
      RT * (dCp / SC) * (dHp / SH)
  )
}
