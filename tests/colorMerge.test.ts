import { describe, it, expect } from 'vitest'
import { mergeSpatial, mergePalette } from '@/utils/colorMerge'
import type { Lab } from '@/utils/colorLab'

// 测试用注入的 distFn 绕开 ciede2000 数值，语义直观
const alwaysNear = (): number => 1 // 任何两色都视为"近似"
const alwaysFar = (): number => 999 // 任何两色都视为"远"

describe('mergeSpatial (模式A: 8连通 BFS 去孤立)', () => {
  it('近似杂色被周围大色同化（distFn<threshold 连通）', () => {
    const g = Array.from({ length: 5 }, () => new Array(5).fill('#CCCCCC'))
    g[2][2] = '#C8C8C8' // 1 颗近似杂色
    const out = mergeSpatial(g, 5, 5, { threshold: 5, distFn: alwaysNear })
    expect(out[2][2]).toBe('#CCCCCC')
  })

  it('色差超阈值的色保留（不连通，孤立单格区域跳过）', () => {
    const g = Array.from({ length: 5 }, () => new Array(5).fill('#CCCCCC'))
    g[2][2] = '#FF0000'
    const out = mergeSpatial(g, 5, 5, { threshold: 5, distFn: alwaysFar })
    expect(out[2][2]).toBe('#FF0000')
  })

  it('immutable：输入数组不被修改', () => {
    const g = Array.from({ length: 3 }, () => new Array(3).fill('#CCCCCC'))
    g[1][1] = '#C8C8C8'
    const snap = JSON.stringify(g)
    mergeSpatial(g, 3, 3, { threshold: 5, distFn: alwaysNear })
    expect(JSON.stringify(g)).toBe(snap)
  })

  it('返回新数组（引用不同）', () => {
    const g = [['#CCCCCC']]
    const out = mergeSpatial(g, 1, 1, { threshold: 5 })
    expect(out).not.toBe(g)
  })

  it('边界：空 grid 返回 []', () => {
    expect(mergeSpatial([], 0, 0, { threshold: 5 })).toEqual([])
  })

  it('边界：单色 grid 内容不变且是新数组', () => {
    const g = [
      ['#CCCCCC', '#CCCCCC'],
      ['#CCCCCC', '#CCCCCC'],
    ]
    const out = mergeSpatial(g, 2, 2, { threshold: 5 })
    expect(out).toEqual(g)
    expect(out).not.toBe(g)
  })
})

describe('mergePalette (模式B: 全局归并)', () => {
  it('小色（频次<minCount）归并到最近大色，色数减少', () => {
    // #CCCCCC×10(大), #FF0000×2(小), #00FF00×1(小), #0000FF×2(小)
    const g = [
      ['#CCCCCC', '#CCCCCC', '#CCCCCC', '#CCCCCC', '#CCCCCC'],
      ['#CCCCCC', '#CCCCCC', '#CCCCCC', '#CCCCCC', '#CCCCCC'],
      ['#FF0000', '#FF0000', '#00FF00', '#0000FF', '#0000FF'],
    ]
    const out = mergePalette(g, { minCount: 3, threshold: 100, distFn: alwaysNear })
    const colors = new Set(out.flat())
    expect(colors.size).toBe(1)
    expect(colors.has('#FF0000')).toBe(false)
  })

  it('maxColors 迭代归并到 ≤N 色', () => {
    const g = [
      ['#CCCCCC', '#CCCCCC', '#FF0000', '#FF0000'],
      ['#00FF00', '#00FF00', '#0000FF', '#FFFF00'],
    ]
    const out = mergePalette(g, { maxColors: 2, minCount: 1, threshold: 100, distFn: alwaysNear })
    expect(new Set(out.flat()).size).toBeLessThanOrEqual(2)
  })

  it('色差超阈值的小色保留', () => {
    const g = [['#CCCCCC', '#CCCCCC', '#CCCCCC', '#FF0000']] // #FF0000 只 1 颗且远离
    const out = mergePalette(g, { minCount: 3, threshold: 1, distFn: alwaysFar })
    expect(new Set(out.flat()).has('#FF0000')).toBe(true)
  })

  it('immutable：输入不被修改', () => {
    const g = [
      ['#CCCCCC', '#FF0000'],
      ['#CCCCCC', '#00FF00'],
    ]
    const snap = JSON.stringify(g)
    mergePalette(g, { minCount: 1, threshold: 100, distFn: alwaysNear })
    expect(JSON.stringify(g)).toBe(snap)
  })

  it('返回新数组', () => {
    const g = [['#CCCCCC']]
    expect(mergePalette(g, {})).not.toBe(g)
  })

  it('边界：空 grid 返回 []', () => {
    expect(mergePalette([], {})).toEqual([])
  })

  it('边界：单色 grid 原样返回（新数组）', () => {
    const g = [
      ['#CCCCCC', '#CCCCCC'],
      ['#CCCCCC', '#CCCCCC'],
    ]
    const out = mergePalette(g, {})
    expect(out).toEqual(g)
    expect(out).not.toBe(g)
  })

  it('全小色兜底：保留最高频者，其余归并', () => {
    const g = [
      ['#CCCCCC', '#FF0000'],
      ['#00FF00', '#0000FF'],
    ] // 每色 1 颗，无大色
    const out = mergePalette(g, { minCount: 3, threshold: 100, distFn: alwaysNear })
    expect(new Set(out.flat()).size).toBe(1)
  })
})
