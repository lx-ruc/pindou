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
