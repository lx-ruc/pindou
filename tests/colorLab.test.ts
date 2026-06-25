import { describe, it, expect } from 'vitest'
import { hexToLab, ciede2000 } from '@/utils/colorLab'
import type { Lab } from '@/utils/colorLab'

describe('hexToLab (sRGB→XYZ→LAB, D65)', () => {
  it('纯白 → L≈100, a≈0, b≈0', () => {
    const [L, a, b] = hexToLab('#FFFFFF')
    expect(L).toBeCloseTo(100.0, 1)
    expect(Math.abs(a)).toBeLessThan(0.5)
    expect(Math.abs(b)).toBeLessThan(0.5)
  })

  it('纯黑 → L≈0, a≈0, b≈0', () => {
    const [L, a, b] = hexToLab('#000000')
    expect(L).toBeLessThan(0.5)
    expect(Math.abs(a)).toBeLessThan(0.5)
    expect(Math.abs(b)).toBeLessThan(0.5)
  })

  it('纯红 → L≈53.24, a≈80.09, b≈67.20', () => {
    const [L, a, b] = hexToLab('#FF0000')
    expect(L).toBeCloseTo(53.24, 1)
    expect(a).toBeCloseTo(80.09, 0)
    expect(b).toBeCloseTo(67.2, 0)
  })

  it('任意合法 hex 返回有限值（无 NaN/Infinity）', () => {
    for (const hex of ['#FAF4C8', '#06A77D', '#324BCA', '#FFFF00']) {
      const [L, a, b] = hexToLab(hex)
      expect(Number.isFinite(L)).toBe(true)
      expect(Number.isFinite(a)).toBe(true)
      expect(Number.isFinite(b)).toBe(true)
    }
  })
})

describe('ciede2000', () => {
  // Sharma et al. 2005 标准测试对（最经典两对，验证完整公式）
  it('Sharma pair1: ΔE ≈ 2.0425', () => {
    expect(ciede2000([50, 2.6772, -79.7751], [50, 0, -82.7485])).toBeCloseTo(2.0425, 1)
  })

  it('Sharma pair2: ΔE ≈ 2.8615', () => {
    expect(ciede2000([50, 3.1571, -77.2803], [50, 0, -82.7485])).toBeCloseTo(2.8615, 1)
  })

  it('同色 ΔE = 0', () => {
    expect(ciede2000([50, 10, -20], [50, 10, -20])).toBe(0)
  })

  it('黑白对 ΔE = 100', () => {
    expect(ciede2000([0, 0, 0], [100, 0, 0])).toBeCloseTo(100, 1)
  })

  it('对称性：d(a,b) === d(b,a)', () => {
    const a: Lab = [60, 12, -8]
    const b: Lab = [42, -5, 23]
    expect(ciede2000(a, b)).toBeCloseTo(ciede2000(b, a), 5)
  })

  it('单调性：同 L 下 a 偏移越大 ΔE 越大', () => {
    const d1 = ciede2000([50, 0, 0], [50, 5, 0])
    const d2 = ciede2000([50, 0, 0], [50, 20, 0])
    expect(d2).toBeGreaterThan(d1)
  })
})
