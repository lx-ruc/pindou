import { LUT } from './palette'
import type { Hex } from '@/types/pattern'

export function nearestHex(r: number, g: number, b: number): Hex {
  return LUT[(r >> 3) * 1024 + (g >> 3) * 32 + (b >> 3)]
}

export function hexToRgb(hex: Hex): [number, number, number] {
  const n = parseInt(hex.slice(1), 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}
