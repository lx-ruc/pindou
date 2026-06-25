export type Hex = string

export type Brand = 'MARD' | 'COCO' | '漫漫' | '盼盼' | '咪小窝'

export type Mode = 'view' | 'track'

export type Cell = [number, number]

export interface ImagePixels {
  data: Uint8ClampedArray
  width: number
  height: number
}

export interface PickedImage {
  tempFilePath: string
  pixels: ImagePixels
}

export interface Progress {
  placed: number
  total: number
  pct: number
  next: Cell | null
  nextIdx: number
}

/** 颜色合并模式：spatial=空间BFS去孤立噪点，palette=全局色号归并/限N色 */
export type MergeMode = 'spatial' | 'palette'

/** 颜色合并配置（对应 store 的合并参数） */
export interface MergeConfig {
  enabled: boolean
  mode: MergeMode
  spatialThreshold: number
  paletteMaxColors: number
  paletteMinCount: number
  paletteThreshold: number
}
