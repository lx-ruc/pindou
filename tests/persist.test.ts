import { describe, it, expect } from 'vitest'
import {
  buildSnapshot,
  serialize,
  deserialize,
  applySnapshot,
  type Snapshot,
  type PatternStore,
} from '@/utils/persist'

const PARAMS = {
  brand: 'MARD',
  mode: 'view',
  size: 50,
  zoom: 1,
  showZones: true,
  showCodes: true,
  guide: true,
  mergeEnabled: true,
  mergeMode: 'palette',
  spatialThreshold: 10,
  paletteMaxColors: 0,
  paletteMinCount: 3,
  paletteThreshold: 12,
} as const

interface RestoredCall {
  params: unknown
  rows: number
  cols: number
  hexGrid: string[][]
  placed: boolean[][]
}

function makeFakeStore(
  over: Partial<{ hexGrid: string[][]; placed: boolean[][]; rows: number; cols: number }> = {}
): { store: PatternStore; calls: RestoredCall[] } {
  const hexGrid = over.hexGrid ?? [
    ['#FF0000', '#00FF00'],
    ['#0000FF', '#FF0000'],
  ]
  const rows = over.rows ?? hexGrid.length
  const cols = over.cols ?? hexGrid[0].length
  const placed = over.placed ?? hexGrid.map((r) => r.map(() => false))
  const calls: RestoredCall[] = []
  const store = {
    ...PARAMS,
    rows,
    cols,
    srcW: 100,
    srcH: 100,
    imgAspect: 1,
    hexGrid,
    placed,
    applyRestored(snap: RestoredCall): void {
      calls.push({
        params: snap.params,
        rows: snap.rows,
        cols: snap.cols,
        hexGrid: snap.hexGrid,
        placed: snap.placed,
      })
    },
  } as unknown as PatternStore
  return { store, calls }
}

describe('persist', () => {
  it('serialize → deserialize round-trip：参数/hexGrid/placed 一致', () => {
    const { store } = makeFakeStore({ placed: [[true, false], [false, true]] })
    const snap = buildSnapshot(store)
    const back = deserialize(serialize(snap)) as Snapshot
    expect(back.v).toBe(1)
    expect(back.params.size).toBe(50)
    expect(back.params.mergeMode).toBe('palette')
    expect(back.rows).toBe(2)
    expect(back.cols).toBe(2)
    expect(back.hexGrid).toEqual([
      ['#FF0000', '#00FF00'],
      ['#0000FF', '#FF0000'],
    ])
    expect(back.placed).toEqual([[true, false], [false, true]])
  })

  it('version 字段恒为 1', () => {
    expect(buildSnapshot(makeFakeStore().store).v).toBe(1)
  })

  it('维度校验：placed 行数不符 → applySnapshot 丢弃进度，重置全 false（行数对齐 rows）', () => {
    const { store, calls } = makeFakeStore()
    const bad: Snapshot = {
      v: 1,
      params: { ...PARAMS } as Snapshot['params'],
      rows: 2,
      cols: 2,
      srcW: 100,
      srcH: 100,
      imgAspect: 1,
      hexGrid: [
        ['#FFFFFF', '#FFFFFF'],
        ['#FFFFFF', '#FFFFFF'],
      ],
      placed: [[true, false]], // 仅 1 行，与 rows=2 不符
    }
    applySnapshot(store, bad)
    expect(calls).toHaveLength(1)
    const placed = calls[0].placed
    expect(placed.length).toBe(2)
    expect(placed.every((r) => r.every((v) => v === false))).toBe(true)
  })

  it('维度校验：placed 列数不符 → 同样重置全 false', () => {
    const { store, calls } = makeFakeStore()
    const bad: Snapshot = {
      v: 1,
      params: { ...PARAMS } as Snapshot['params'],
      rows: 2,
      cols: 2,
      srcW: 100,
      srcH: 100,
      imgAspect: 1,
      hexGrid: [
        ['#FFFFFF', '#FFFFFF'],
        ['#FFFFFF', '#FFFFFF'],
      ],
      placed: [
        [true, false, true], // 3 列，与 cols=2 不符
        [false, false, false],
      ],
    }
    applySnapshot(store, bad)
    const placed = calls[0].placed
    expect(placed[0].length).toBe(2)
    expect(placed.every((r) => r.every((v) => v === false))).toBe(true)
  })

  it('deserialize 非法 JSON → null（不抛）', () => {
    expect(deserialize('not json')).toBeNull()
    expect(deserialize('{')).toBeNull()
    expect(deserialize('')).toBeNull()
  })

  it('deserialize 版本号非 1 → null', () => {
    expect(deserialize(JSON.stringify({ v: 2, params: {}, hexGrid: [], placed: [] }))).toBeNull()
  })

  it('buildSnapshot immutable：改快照不污染 store 原数组', () => {
    const { store } = makeFakeStore()
    const snap = buildSnapshot(store)
    snap.hexGrid[0][0] = '#000000'
    snap.placed[0][0] = true
    expect(store.hexGrid[0][0]).toBe('#FF0000')
    expect(store.placed[0][0]).toBe(false)
  })

  it('applySnapshot：完整恢复参数 + 几何 + 图纸 + 进度（调用 applyRestored）', () => {
    const { store, calls } = makeFakeStore()
    const snap: Snapshot = {
      v: 1,
      params: {
        ...PARAMS,
        brand: 'COCO',
        mode: 'track',
        size: 29,
        zoom: 2,
        showZones: false,
        showCodes: false,
        guide: false,
        mergeEnabled: false,
        mergeMode: 'spatial',
        spatialThreshold: 15,
        paletteMaxColors: 8,
        paletteMinCount: 5,
        paletteThreshold: 20,
      } as Snapshot['params'],
      rows: 2,
      cols: 2,
      srcW: 200,
      srcH: 100,
      imgAspect: 2,
      hexGrid: [
        ['#AAAAAA', '#BBBBBB'],
        ['#CCCCCC', '#DDDDDD'],
      ],
      placed: [
        [true, true],
        [false, false],
      ],
    }
    applySnapshot(store, snap)
    expect(calls).toHaveLength(1)
    expect(calls[0].rows).toBe(2)
    expect(calls[0].cols).toBe(2)
    expect((calls[0].params as { brand: string }).brand).toBe('COCO')
    expect(calls[0].hexGrid).toEqual([
      ['#AAAAAA', '#BBBBBB'],
      ['#CCCCCC', '#DDDDDD'],
    ])
    expect(calls[0].placed).toEqual([
      [true, true],
      [false, false],
    ])
  })

  it('applySnapshot immutable：传给 applyRestored 的是拷贝，改之不影响快照', () => {
    const { store, calls } = makeFakeStore()
    const snap: Snapshot = {
      v: 1,
      params: { ...PARAMS } as Snapshot['params'],
      rows: 1,
      cols: 1,
      srcW: 10,
      srcH: 10,
      imgAspect: 1,
      hexGrid: [['#FFFFFF']],
      placed: [[true]],
    }
    applySnapshot(store, snap)
    calls[0].hexGrid[0][0] = '#000000'
    expect(snap.hexGrid[0][0]).toBe('#FFFFFF')
  })
})
